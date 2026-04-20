import { reddit } from '@devvit/web/server';
import { resolveUserAvatarUrl } from '../../shared/api';
import { createDataLayer } from '../data';
import type { ContributorEntity, CommentEntity, PostEntity } from '../data';
import { createLogger } from '../logging/logger';
import { shouldUseSyntheticContributorKarma } from './subreddits';

const logger = createLogger('contributor-cache');
const CONTRIBUTOR_METADATA_CONCURRENCY = 4;
const DAY_MS = 24 * 60 * 60 * 1000;
const CONTRIBUTOR_LOOKBACK_MS = 90 * DAY_MS;
const SYNTHETIC_KARMA_MIN = -100;
const SYNTHETIC_KARMA_MAX = 50_000;

export type ContributorCacheRefreshResult = {
  candidateContributorCount: number;
  refreshedContributorCount: number;
  generatedAt: string;
};

export type ContributorMetadataRefreshResult = {
  refreshedContributorCount: number;
  generatedAt: string;
};

export const refreshContributorCache = async (
  subredditName: string
): Promise<ContributorCacheRefreshResult> => {
  logger.info('Refreshing contributor cache', { subredditName });

  try {
    const dataLayer = createDataLayer(subredditName);
    const fetchedAt = new Date();
    const [posts, comments] = await Promise.all([
      dataLayer.posts.getInTimeRange({
        startTime: fetchedAt.getTime() - CONTRIBUTOR_LOOKBACK_MS,
        endTime: fetchedAt.getTime() + DAY_MS,
      }),
      dataLayer.comments.getInTimeRange({
        startTime: fetchedAt.getTime() - CONTRIBUTOR_LOOKBACK_MS,
        endTime: fetchedAt.getTime() + DAY_MS,
      }),
    ]);
    const usernames = getUniqueRefreshableContributorNames(posts, comments);
    const useSyntheticContributorKarma =
      shouldUseSyntheticContributorKarma(subredditName);

    logger.info('Loaded contributor cache candidates', {
      subredditName,
      postCount: posts.length,
      commentCount: comments.length,
      candidateContributorCount: usernames.length,
      useSyntheticContributorKarma,
    });

    const refreshedContributors = await mapWithConcurrency(
      usernames,
      CONTRIBUTOR_METADATA_CONCURRENCY,
      async (username) =>
        await getContributorEntity(
          username,
          fetchedAt,
          useSyntheticContributorKarma
        )
    );

    await dataLayer.contributors.upsertMany(refreshedContributors);

    const result = {
      candidateContributorCount: usernames.length,
      refreshedContributorCount: refreshedContributors.length,
      generatedAt: new Date().toISOString(),
    };

    logger.info('Stored contributor cache entries', {
      subredditName,
      candidateContributorCount: result.candidateContributorCount,
      refreshedContributorCount: result.refreshedContributorCount,
      generatedAt: result.generatedAt,
    });

    return result;
  } catch (error) {
    logger.error('Contributor cache refresh failed', {
      subredditName,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

export const refreshContributorMetadata = async (
  subredditName: string,
  username: string
): Promise<ContributorMetadataRefreshResult> => {
  const contributorName = readRefreshableContributorName(username);
  const fetchedAt = new Date();
  const generatedAt = fetchedAt.toISOString();

  if (!contributorName) {
    logger.info('Skipped contributor metadata refresh', {
      subredditName,
      username,
      generatedAt,
    });

    return {
      refreshedContributorCount: 0,
      generatedAt,
    };
  }

  const dataLayer = createDataLayer(subredditName);
  const contributor = await getContributorEntity(
    contributorName,
    fetchedAt,
    shouldUseSyntheticContributorKarma(subredditName)
  );

  await dataLayer.contributors.upsert(contributor);

  logger.info('Stored contributor metadata cache entry', {
    subredditName,
    username: contributorName,
    generatedAt,
  });

  return {
    refreshedContributorCount: 1,
    generatedAt,
  };
};

export const readRefreshableContributorName = (
  username: string
): string | null => {
  const trimmed = username.trim();

  return trimmed === '' || trimmed.toLowerCase() === '[deleted]'
    ? null
    : trimmed;
};

const getContributorEntity = async (
  username: string,
  fetchedAt: Date,
  useSyntheticContributorKarma: boolean
): Promise<ContributorEntity> => {
  const [subredditKarma, avatarUrl] = await Promise.all([
    getContributorKarma(username, useSyntheticContributorKarma),
    getContributorAvatarUrl(username),
  ]);

  logger.debug('Loaded contributor metadata', {
    username,
    hasSubredditKarma: subredditKarma !== null,
    hasAvatarUrl: avatarUrl !== resolveUserAvatarUrl(null),
  });

  return {
    id: username,
    avatarUrl,
    subredditKarma,
    fetchedAt: fetchedAt.toISOString(),
  };
};

const getContributorKarma = async (
  username: string,
  useSyntheticContributorKarma: boolean
): Promise<number | null> => {
  if (useSyntheticContributorKarma) {
    logger.debug('Using synthetic contributor karma', { username });
    return getSyntheticContributorKarma();
  }

  try {
    const karma = await reddit.getUserKarmaFromCurrentSubreddit(username);
    return sumKarma(karma);
  } catch (error) {
    logger.warn('Unable to load subreddit karma for contributor', {
      username,
      error: getErrorMessage(error),
    });
    return null;
  }
};

const getContributorAvatarUrl = async (username: string): Promise<string> => {
  try {
    return resolveUserAvatarUrl(await reddit.getSnoovatarUrl(username));
  } catch (error) {
    logger.warn('Unable to load contributor avatar', {
      username,
      error: getErrorMessage(error),
    });
    return resolveUserAvatarUrl(null);
  }
};

const getUniqueRefreshableContributorNames = (
  posts: PostEntity[],
  comments: CommentEntity[]
): string[] =>
  Array.from(
    new Set(
      [
        ...posts.map((post) => post.authorName),
        ...comments.map((comment) => comment.authorName),
      ]
        .map(readRefreshableContributorName)
        .filter((username): username is string => username !== null)
    )
  );

const getSyntheticContributorKarma = (): number =>
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
