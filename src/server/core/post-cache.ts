import { reddit, redis } from '@devvit/web/server';
import type { Post } from '@devvit/web/server';
import { AUTHOR_SUBREDDIT_KARMA_BUCKET_COUNT } from '../../shared/api';
import type { AuthorSubredditKarmaBucket, ChartPost } from '../../shared/api';
import { shouldUseSyntheticAuthorKarma } from './subreddits';

const POST_INDEX_PREFIX = 'bubble-stats:posts:index';
const POST_DATA_PREFIX = 'bubble-stats:posts:data';
const AUTHOR_DATA_PREFIX = 'bubble-stats:authors:data';
const CACHE_META_PREFIX = 'bubble-stats:posts:meta';
const REDIS_WRITE_CHUNK_SIZE = 100;
const POST_PRUNE_BATCH_SIZE = 500;
const MAX_POST_PRUNE_BATCHES_PER_RUN = 10;
const AUTHOR_METADATA_CONCURRENCY = 4;
const MAX_AUTHORS_TO_REFRESH_PER_RUN = 25;
const DAY_MS = 24 * 60 * 60 * 1000;
const POST_RETENTION_MS = 90 * DAY_MS;
const AUTHOR_METADATA_STALE_MS = 24 * 60 * 60 * 1000;
const AUTHOR_METADATA_RETENTION_MS = 90 * DAY_MS;
const AUTHOR_PRUNE_SCAN_COUNT = 200;
const SYNTHETIC_KARMA_MIN = -100;
const SYNTHETIC_KARMA_MAX = 50_000;

export type PostCacheReadOptions = {
  subredditName: string;
  startTime: number;
  endTime: number;
  excludedPostId: string | null;
};

export type PostCacheReadResult = {
  lastSuccessAt: string | null;
  lastError: string | null;
  sampledPostCount: number;
  posts: ChartPost[];
};

export type PostCacheRefreshResult = {
  fetchedPostCount: number;
  cachedPostCount: number;
  refreshedAuthorCount: number;
  prunedPostCount: number;
  prunedAuthorCount: number;
  generatedAt: string;
};

type CacheKeys = {
  index: string;
  posts: string;
  authors: string;
  meta: string;
};

type CachedPost = {
  id: string;
  title: string;
  authorName: string;
  comments: number;
  score: number;
  createdAt: string;
  permalink: string;
};

type CachedAuthorMetadata = {
  subredditKarma: number | null;
  avatarUrl: string | null;
  fetchedAt: string;
};

export const readPostsForTimeframe = async ({
  subredditName,
  startTime,
  endTime,
  excludedPostId,
}: PostCacheReadOptions): Promise<PostCacheReadResult> => {
  const keys = getCacheKeys(subredditName);
  const [lastSuccessAt, lastError, lastFetchedPostCount, indexedPosts] = await Promise.all([
    redis.hGet(keys.meta, 'lastSuccessAt'),
    redis.hGet(keys.meta, 'lastError'),
    redis.hGet(keys.meta, 'lastFetchedPostCount'),
    redis.zRange(keys.index, startTime, endTime, { by: 'score' }),
  ]);
  const postIds = indexedPosts
    .map((post) => post.member)
    .filter((postId) => postId !== excludedPostId);
  const cachedPosts = await readCachedPosts(keys, postIds);
  const authorMetadata = await readAuthorMetadata(keys, cachedPosts);
  const authorKarmaBuckets = createAuthorKarmaBuckets(authorMetadata);
  const posts = cachedPosts
    .map((post) =>
      toChartPost(
        post,
        authorMetadata.get(post.authorName) ?? null,
        authorKarmaBuckets.get(post.authorName) ?? null
      )
    )
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

  return {
    lastSuccessAt: lastSuccessAt ?? null,
    lastError: lastError ?? null,
    sampledPostCount: parseCount(lastFetchedPostCount),
    posts,
  };
};

export const refreshPostCache = async (
  subredditName: string
): Promise<PostCacheRefreshResult> => {
  const keys = getCacheKeys(subredditName);

  try {
    const fetchedAt = new Date();
    const posts = await reddit
      .getNewPosts({
        subredditName,
        limit: 1000,
        pageSize: 100,
      })
      .all();
    const cachedPosts = posts.map(toCachedPost);

    await writeCachedPosts(keys, cachedPosts);
    const refreshedAuthorCount = await refreshAuthorMetadata(
      keys,
      cachedPosts,
      fetchedAt,
      shouldUseSyntheticAuthorKarma(subredditName)
    );
    const prunedPostCount = await pruneOldPosts(keys, fetchedAt.getTime());
    const prunedAuthorCount = await pruneOldAuthorMetadata(keys, fetchedAt.getTime());
    const generatedAt = new Date().toISOString();

    await redis.hSet(keys.meta, {
      lastSuccessAt: generatedAt,
      lastFetchedPostCount: String(posts.length),
      lastCachedPostCount: String(cachedPosts.length),
      lastRefreshedAuthorCount: String(refreshedAuthorCount),
      lastPrunedPostCount: String(prunedPostCount),
      lastPrunedAuthorCount: String(prunedAuthorCount),
    });
    await redis.hDel(keys.meta, ['lastError', 'lastErrorAt']);

    return {
      fetchedPostCount: posts.length,
      cachedPostCount: cachedPosts.length,
      refreshedAuthorCount,
      prunedPostCount,
      prunedAuthorCount,
      generatedAt,
    };
  } catch (error) {
    const message = getErrorMessage(error);
    await redis.hSet(keys.meta, {
      lastError: message,
      lastErrorAt: new Date().toISOString(),
    });
    throw error;
  }
};

const getCacheKeys = (subredditName: string): CacheKeys => {
  const keySubreddit = subredditName.toLowerCase();

  return {
    index: `${POST_INDEX_PREFIX}:${keySubreddit}`,
    posts: `${POST_DATA_PREFIX}:${keySubreddit}`,
    authors: `${AUTHOR_DATA_PREFIX}:${keySubreddit}`,
    meta: `${CACHE_META_PREFIX}:${keySubreddit}`,
  };
};

const toCachedPost = (post: Post): CachedPost => ({
  id: post.id,
  title: post.title,
  authorName: post.authorName,
  comments: post.numberOfComments,
  score: post.score,
  createdAt: post.createdAt.toISOString(),
  permalink: post.permalink,
});

const writeCachedPosts = async (keys: CacheKeys, posts: CachedPost[]): Promise<void> => {
  for (const chunk of chunkItems(posts, REDIS_WRITE_CHUNK_SIZE)) {
    const postFields: Record<string, string> = {};
    const indexMembers = chunk.map((post) => {
      postFields[post.id] = JSON.stringify(post);

      return {
        member: post.id,
        score: Date.parse(post.createdAt),
      };
    });

    await Promise.all([
      redis.hSet(keys.posts, postFields),
      redis.zAdd(keys.index, ...indexMembers),
    ]);
  }
};

const readCachedPosts = async (keys: CacheKeys, postIds: string[]): Promise<CachedPost[]> => {
  const posts: CachedPost[] = [];

  for (const chunk of chunkItems(postIds, REDIS_WRITE_CHUNK_SIZE)) {
    const values = await redis.hMGet(keys.posts, chunk);
    values.forEach((value) => {
      const post = parseCachedPost(value);

      if (post) {
        posts.push(post);
      }
    });
  }

  return posts;
};

const readAuthorMetadata = async (
  keys: CacheKeys,
  posts: CachedPost[]
): Promise<Map<string, CachedAuthorMetadata>> => {
  const usernames = getUniqueRefreshableAuthorNames(posts);
  const metadataByUsername = new Map<string, CachedAuthorMetadata>();

  for (const chunk of chunkItems(usernames, REDIS_WRITE_CHUNK_SIZE)) {
    const values = await redis.hMGet(keys.authors, chunk);

    values.forEach((value, index) => {
      const username = chunk[index];
      const metadata = parseCachedAuthorMetadata(value);

      if (username && metadata) {
        metadataByUsername.set(username, metadata);
      }
    });
  }

  return metadataByUsername;
};

const refreshAuthorMetadata = async (
  keys: CacheKeys,
  posts: CachedPost[],
  fetchedAt: Date,
  useSyntheticAuthorKarma: boolean
): Promise<number> => {
  const usernames = getUniqueRefreshableAuthorNames(posts);
  const usernamesToRefresh: string[] = [];
  const staleCutoff = fetchedAt.getTime() - AUTHOR_METADATA_STALE_MS;

  for (const chunk of chunkItems(usernames, REDIS_WRITE_CHUNK_SIZE)) {
    if (usernamesToRefresh.length >= MAX_AUTHORS_TO_REFRESH_PER_RUN) {
      break;
    }

    const values = await redis.hMGet(keys.authors, chunk);

    values.forEach((value, index) => {
      if (usernamesToRefresh.length >= MAX_AUTHORS_TO_REFRESH_PER_RUN) {
        return;
      }

      const username = chunk[index];
      const metadata = parseCachedAuthorMetadata(value);
      const hasFreshMetadata = metadata && Date.parse(metadata.fetchedAt) >= staleCutoff;
      const hasSyntheticKarma =
        useSyntheticAuthorKarma && typeof metadata?.subredditKarma === 'number';

      if (
        !username ||
        (hasFreshMetadata && (!useSyntheticAuthorKarma || hasSyntheticKarma))
      ) {
        return;
      }

      usernamesToRefresh.push(username);
    });
  }

  const refreshed = await mapWithConcurrency(
    usernamesToRefresh,
    AUTHOR_METADATA_CONCURRENCY,
    async (username) =>
      [
        username,
        await getAuthorMetadata(username, fetchedAt, useSyntheticAuthorKarma),
      ] as const
  );
  const authorFields: Record<string, string> = {};

  refreshed.forEach(([username, metadata]) => {
    authorFields[username] = JSON.stringify(metadata);
  });

  if (Object.keys(authorFields).length > 0) {
    await redis.hSet(keys.authors, authorFields);
  }

  return refreshed.length;
};

const pruneOldPosts = async (keys: CacheKeys, now: number): Promise<number> => {
  const cutoff = now - POST_RETENTION_MS;
  let prunedPostCount = 0;

  for (let batch = 0; batch < MAX_POST_PRUNE_BATCHES_PER_RUN; batch += 1) {
    const oldPosts = await redis.zRange(keys.index, 0, cutoff, {
      by: 'score',
      limit: {
        offset: 0,
        count: POST_PRUNE_BATCH_SIZE,
      },
    });
    const oldPostIds = oldPosts.map((post) => post.member);

    if (oldPostIds.length === 0) {
      break;
    }

    await Promise.all([
      redis.zRem(keys.index, oldPostIds),
      redis.hDel(keys.posts, oldPostIds),
    ]);
    prunedPostCount += oldPostIds.length;
  }

  return prunedPostCount;
};

const pruneOldAuthorMetadata = async (keys: CacheKeys, now: number): Promise<number> => {
  const cursor = await readAuthorPruneCursor(keys);
  const scan = await redis.hScan(keys.authors, cursor, undefined, AUTHOR_PRUNE_SCAN_COUNT);
  const cutoff = now - AUTHOR_METADATA_RETENTION_MS;
  const staleAuthors = scan.fieldValues
    .filter((fieldValue) => {
      const metadata = parseCachedAuthorMetadata(fieldValue.value);
      return !metadata || Date.parse(metadata.fetchedAt) < cutoff;
    })
    .map((fieldValue) => fieldValue.field);

  await redis.hSet(keys.meta, {
    authorPruneCursor: String(scan.cursor),
  });

  if (staleAuthors.length > 0) {
    await redis.hDel(keys.authors, staleAuthors);
  }

  return staleAuthors.length;
};

const readAuthorPruneCursor = async (keys: CacheKeys): Promise<number> => {
  const cursorText = await redis.hGet(keys.meta, 'authorPruneCursor');
  const cursor = Number(cursorText);

  return Number.isInteger(cursor) && cursor >= 0 ? cursor : 0;
};

const getAuthorMetadata = async (
  username: string,
  fetchedAt: Date,
  useSyntheticAuthorKarma: boolean
): Promise<CachedAuthorMetadata> => {
  const [subredditKarma, avatarUrl] = await Promise.all([
    getAuthorKarma(username, useSyntheticAuthorKarma),
    getAuthorAvatarUrl(username),
  ]);

  return {
    subredditKarma,
    avatarUrl,
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

const toChartPost = (
  post: CachedPost,
  authorMetadata: CachedAuthorMetadata | null,
  authorSubredditKarmaBucket: AuthorSubredditKarmaBucket | null
): ChartPost => ({
  id: post.id,
  title: post.title,
  authorName: post.authorName,
  authorAvatarUrl: authorMetadata?.avatarUrl ?? null,
  comments: post.comments,
  score: post.score,
  authorSubredditKarmaBucket,
  createdAt: post.createdAt,
  permalink: post.permalink,
});

const createAuthorKarmaBuckets = (
  authorMetadata: Map<string, CachedAuthorMetadata>
): Map<string, AuthorSubredditKarmaBucket> => {
  const knownAuthors = [...authorMetadata.entries()]
    .flatMap(([authorName, metadata]) =>
      typeof metadata.subredditKarma === 'number' && Number.isFinite(metadata.subredditKarma)
        ? [{ authorName, subredditKarma: metadata.subredditKarma }]
        : []
    )
    .sort(
      (a, b) =>
        a.subredditKarma - b.subredditKarma || a.authorName.localeCompare(b.authorName)
    );
  const authorKarmaBuckets = new Map<string, AuthorSubredditKarmaBucket>();
  const maxAuthorIndex = knownAuthors.length - 1;

  knownAuthors.forEach((author, index) => {
    const bucket =
      maxAuthorIndex === 0
        ? AUTHOR_SUBREDDIT_KARMA_BUCKET_COUNT - 1
        : Math.round(
            (index / maxAuthorIndex) * (AUTHOR_SUBREDDIT_KARMA_BUCKET_COUNT - 1)
          );

    authorKarmaBuckets.set(author.authorName, bucket as AuthorSubredditKarmaBucket);
  });

  return authorKarmaBuckets;
};

const getUniqueRefreshableAuthorNames = (posts: CachedPost[]): string[] =>
  Array.from(
    new Set(
      posts
        .map((post) => post.authorName)
        .filter((username) => username !== '[deleted]' && username.trim() !== '')
    )
  );

const getSyntheticAuthorKarma = (): number =>
  randomInteger(SYNTHETIC_KARMA_MIN, SYNTHETIC_KARMA_MAX);

const randomInteger = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const parseCount = (value: string | undefined): number => {
  const count = Number(value);

  return Number.isInteger(count) && count >= 0 ? count : 0;
};

const parseCachedPost = (value: string | null): CachedPost | null => {
  if (value === null) {
    return null;
  }

  const parsed = parseJsonRecord(value);

  if (
    !parsed ||
    typeof parsed.id !== 'string' ||
    typeof parsed.title !== 'string' ||
    typeof parsed.authorName !== 'string' ||
    typeof parsed.comments !== 'number' ||
    typeof parsed.score !== 'number' ||
    typeof parsed.createdAt !== 'string' ||
    typeof parsed.permalink !== 'string' ||
    Number.isNaN(Date.parse(parsed.createdAt))
  ) {
    return null;
  }

  return {
    id: parsed.id,
    title: parsed.title,
    authorName: parsed.authorName,
    comments: parsed.comments,
    score: parsed.score,
    createdAt: parsed.createdAt,
    permalink: parsed.permalink,
  };
};

const parseCachedAuthorMetadata = (value: string | null): CachedAuthorMetadata | null => {
  if (value === null) {
    return null;
  }

  const parsed = parseJsonRecord(value);

  if (
    !parsed ||
    !isNullableFiniteNumber(parsed.subredditKarma) ||
    (parsed.avatarUrl !== null && typeof parsed.avatarUrl !== 'string') ||
    typeof parsed.fetchedAt !== 'string' ||
    Number.isNaN(Date.parse(parsed.fetchedAt))
  ) {
    return null;
  }

  return {
    subredditKarma: parsed.subredditKarma,
    avatarUrl: parsed.avatarUrl,
    fetchedAt: parsed.fetchedAt,
  };
};

const isNullableFiniteNumber = (value: unknown): value is number | null =>
  value === null || (typeof value === 'number' && Number.isFinite(value));

const parseJsonRecord = (value: string): Record<string, unknown> | null => {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

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

const chunkItems = <Item>(items: Item[], size: number): Item[][] => {
  const chunks: Item[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
};

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
