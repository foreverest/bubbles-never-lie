import { reddit } from '@devvit/web/server';
import { createBubbleStatsDataLayer } from '../data';
import type { AuthorEntity, CommentEntity, PostEntity } from '../data';
import { shouldUseSyntheticAuthorKarma } from './subreddits';

const AUTHOR_METADATA_CONCURRENCY = 4;
const DAY_MS = 24 * 60 * 60 * 1000;
const AUTHOR_LOOKBACK_MS = 90 * DAY_MS;
const SYNTHETIC_KARMA_MIN = -100;
const SYNTHETIC_KARMA_MAX = 50_000;

export type AuthorCacheRefreshResult = {
  candidateAuthorCount: number;
  refreshedAuthorCount: number;
  generatedAt: string;
};

export const refreshAuthorCache = async (
  subredditName: string
): Promise<AuthorCacheRefreshResult> => {
  const dataLayer = createBubbleStatsDataLayer(subredditName);
  const fetchedAt = new Date();
  const [posts, comments] = await Promise.all([
    dataLayer.posts.getInTimeRange({
      startTime: fetchedAt.getTime() - AUTHOR_LOOKBACK_MS,
      endTime: fetchedAt.getTime() + DAY_MS,
    }),
    dataLayer.comments.getInTimeRange({
      startTime: fetchedAt.getTime() - AUTHOR_LOOKBACK_MS,
      endTime: fetchedAt.getTime() + DAY_MS,
    }),
  ]);
  const usernames = getUniqueRefreshableAuthorNames(posts, comments);
  const refreshedAuthors = await mapWithConcurrency(
    usernames,
    AUTHOR_METADATA_CONCURRENCY,
    async (username) =>
      await getAuthorEntity(
        username,
        fetchedAt,
        shouldUseSyntheticAuthorKarma(subredditName)
      )
  );

  await dataLayer.authors.upsertMany(refreshedAuthors);

  return {
    candidateAuthorCount: usernames.length,
    refreshedAuthorCount: refreshedAuthors.length,
    generatedAt: new Date().toISOString(),
  };
};

const getAuthorEntity = async (
  username: string,
  fetchedAt: Date,
  useSyntheticAuthorKarma: boolean
): Promise<AuthorEntity> => {
  const [subredditKarma, avatarUrl] = await Promise.all([
    getAuthorKarma(username, useSyntheticAuthorKarma),
    getAuthorAvatarUrl(username),
  ]);

  return {
    id: username,
    avatarUrl,
    subredditKarma,
    fetchedAt: fetchedAt.toISOString(),
  };
};

const getAuthorKarma = async (
  username: string,
  useSyntheticAuthorKarma: boolean
): Promise<number | null> => {
  if (useSyntheticAuthorKarma) {
    return getSyntheticAuthorKarma();
  }

  try {
    const karma = await reddit.getUserKarmaFromCurrentSubreddit(username);
    return sumKarma(karma);
  } catch (error) {
    console.warn(`Unable to load subreddit karma for u/${username}: ${getErrorMessage(error)}`);
    return null;
  }
};

const getAuthorAvatarUrl = async (username: string): Promise<string | null> => {
  try {
    return (await reddit.getSnoovatarUrl(username)) ?? null;
  } catch (error) {
    console.warn(`Unable to load avatar for u/${username}: ${getErrorMessage(error)}`);
    return null;
  }
};

const getUniqueRefreshableAuthorNames = (
  posts: PostEntity[],
  comments: CommentEntity[]
): string[] =>
  Array.from(
    new Set(
      [...posts.map((post) => post.authorName), ...comments.map((comment) => comment.authorName)]
        .map((username) => username.trim())
        .filter((username) => username !== '' && username !== '[deleted]')
    )
  );

const getSyntheticAuthorKarma = (): number =>
  randomInteger(SYNTHETIC_KARMA_MIN, SYNTHETIC_KARMA_MAX);

const randomInteger = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const sumKarma = (karma: GetUserKarmaForSubredditResponse): number =>
  (karma.fromPosts ?? 0) + (karma.fromComments ?? 0);

type GetUserKarmaForSubredditResponse = {
  fromPosts?: number | undefined;
  fromComments?: number | undefined;
};

const mapWithConcurrency = async <Input, Output>(
  items: Input[],
  limit: number,
  mapper: (item: Input) => Promise<Output>
): Promise<Output[]> => {
  const results = new Array<Output | undefined>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(limit, items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        const item = items[index];

        if (item !== undefined) {
          results[index] = await mapper(item);
        }
      }
    })
  );

  return results.filter((result): result is Output => result !== undefined);
};

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
