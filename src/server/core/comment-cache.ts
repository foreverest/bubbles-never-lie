import { reddit, redis } from '@devvit/web/server';
import type { Comment } from '@devvit/web/server';
import type { ChartComment } from '../../shared/api';
import { readCachedPostIdsForTimeframe } from './post-cache';

const COMMENT_INDEX_PREFIX = 'bubble-stats:comments:index';
const COMMENT_DATA_PREFIX = 'bubble-stats:comments:data';
const COMMENT_POST_INDEX_PREFIX = 'bubble-stats:comments:post-index';
const CACHE_META_PREFIX = 'bubble-stats:comments:meta';
const REDIS_WRITE_CHUNK_SIZE = 100;
const COMMENT_PRUNE_BATCH_SIZE = 500;
const MAX_COMMENT_PRUNE_BATCHES_PER_RUN = 10;
const COMMENT_PREVIEW_LENGTH = 20;
const DAY_MS = 24 * 60 * 60 * 1000;
const COMMENT_RETENTION_MS = 90 * DAY_MS;
const PARENT_POST_LOOKBACK_MS = 90 * DAY_MS;

export type CommentCacheReadOptions = {
  subredditName: string;
  startTime: number;
  endTime: number;
  excludedPostId: string | null;
};

export type CommentCacheReadResult = {
  lastSuccessAt: string | null;
  lastError: string | null;
  sampledCommentCount: number;
  comments: ChartComment[];
};

export type CommentCacheRefreshResult = {
  refreshedPostCount: number;
  failedPostCount: number;
  fetchedCommentCount: number;
  cachedCommentCount: number;
  removedStaleCommentCount: number;
  prunedCommentCount: number;
  generatedAt: string;
};

type CacheKeys = {
  index: string;
  comments: string;
  postComments: string;
  meta: string;
};

type CachedComment = {
  id: string;
  postId: string;
  authorName: string;
  score: number;
  bodyPreview: string;
  createdAt: string;
  permalink: string;
};

type PostCommentsRefreshResult = {
  fetchedCommentCount: number;
  cachedCommentCount: number;
  removedStaleCommentCount: number;
  failed: boolean;
};

export const readCommentsForTimeframe = async ({
  subredditName,
  startTime,
  endTime,
  excludedPostId,
}: CommentCacheReadOptions): Promise<CommentCacheReadResult> => {
  const keys = getCacheKeys(subredditName);
  const lastSuccessAt = await redis.hGet(keys.meta, 'lastSuccessAt');
  const lastError = await redis.hGet(keys.meta, 'lastError');

  if (!lastSuccessAt) {
    return {
      lastSuccessAt: null,
      lastError: lastError ?? null,
      sampledCommentCount: 0,
      comments: [],
    };
  }

  const lastFetchedCommentCount = await redis.hGet(keys.meta, 'lastFetchedCommentCount');
  const indexedComments = await redis.zRange(keys.index, startTime, endTime, { by: 'score' });
  const commentIds = indexedComments.map((comment) => comment.member);
  const cachedComments = await readCachedComments(keys, commentIds);
  const visibleCachedComments = cachedComments.filter(
    (comment) => comment.postId !== excludedPostId
  );
  const comments = visibleCachedComments
    .map(toChartComment)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

  return {
    lastSuccessAt: lastSuccessAt ?? null,
    lastError: lastError ?? null,
    sampledCommentCount: parseCount(lastFetchedCommentCount),
    comments,
  };
};

export const refreshCommentCache = async (
  subredditName: string
): Promise<CommentCacheRefreshResult> => {
  const keys = getCacheKeys(subredditName);

  try {
    const fetchedAt = new Date();
    const parentPostIds = await readCommentParentPostIds(subredditName, fetchedAt.getTime());
    console.log(`Refreshing comment cache for r/${subredditName}. Found ${parentPostIds.length} parent posts in the timeframe.`);
    const refreshResults: PostCommentsRefreshResult[] = [];

    for (const postId of parentPostIds) {
      console.log(`Refreshing comments for post ${postId} in r/${subredditName}...`);
      refreshResults.push(await refreshPostComments(keys, postId));
    }
    const failedPostCount = refreshResults.filter((result) => result.failed).length;
    const fetchedCommentCount = sumRefreshCount(
      refreshResults,
      (result) => result.fetchedCommentCount
    );
    const cachedCommentCount = sumRefreshCount(
      refreshResults,
      (result) => result.cachedCommentCount
    );
    const removedStaleCommentCount = sumRefreshCount(
      refreshResults,
      (result) => result.removedStaleCommentCount
    );
    const prunedCommentCount = await pruneOldComments(keys, fetchedAt.getTime());
    const generatedAt = new Date().toISOString();
    const metaFields: Record<string, string> = {
      lastSuccessAt: generatedAt,
      lastRefreshedPostCount: String(parentPostIds.length),
      lastFailedPostCount: String(failedPostCount),
      lastFetchedCommentCount: String(fetchedCommentCount),
      lastCachedCommentCount: String(cachedCommentCount),
      lastRemovedStaleCommentCount: String(removedStaleCommentCount),
      lastPrunedCommentCount: String(prunedCommentCount),
    };

    if (failedPostCount > 0) {
      metaFields.lastError = `Unable to refresh comments for ${failedPostCount} post(s).`;
      metaFields.lastErrorAt = generatedAt;
    }

    await redis.hSet(keys.meta, metaFields);

    if (failedPostCount === 0) {
      await redis.hDel(keys.meta, ['lastError', 'lastErrorAt']);
    }

    return {
      refreshedPostCount: parentPostIds.length,
      failedPostCount,
      fetchedCommentCount,
      cachedCommentCount,
      removedStaleCommentCount,
      prunedCommentCount,
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

const readCommentParentPostIds = async (
  subredditName: string,
  now: number
): Promise<`t3_${string}`[]> => {
  const cachedPostIds = await readCachedPostIdsForTimeframe({
    subredditName,
    startTime: now - PARENT_POST_LOOKBACK_MS,
    endTime: now + DAY_MS,
    excludedPostId: null,
  });

  if (!cachedPostIds.lastSuccessAt) {
    throw new Error('Post cache is not warm enough to refresh comments.');
  }

  return cachedPostIds.postIds;
};

const refreshPostComments = async (
  keys: CacheKeys,
  postId: `t3_${string}`
): Promise<PostCommentsRefreshResult> => {
  try {
    const comments = await reddit
      .getComments({
        postId,
        limit: 1000,
        pageSize: 100,
      })
      .all();
    console.log(`Fetched ${comments.length} comments for post ${postId}. Caching...`);
    const cachedComments = comments.map(toCachedComment);
    const removedStaleCommentCount = await replaceCachedPostComments(
      keys,
      postId,
      cachedComments
    );
    console.log(`Removed ${removedStaleCommentCount} stale comments from cache for post ${postId}.`);

    return {
      fetchedCommentCount: comments.length,
      cachedCommentCount: cachedComments.length,
      removedStaleCommentCount,
      failed: false,
    };
  } catch (error) {
    console.warn(`Unable to refresh comments for ${postId}: ${getErrorMessage(error)}`);

    return {
      fetchedCommentCount: 0,
      cachedCommentCount: 0,
      removedStaleCommentCount: 0,
      failed: true,
    };
  }
};

const replaceCachedPostComments = async (
  keys: CacheKeys,
  postId: string,
  comments: CachedComment[]
): Promise<number> => {
  const previousCommentIds = parseCachedCommentIds(
    (await redis.hGet(keys.postComments, postId)) ?? null
  );
  const currentCommentIds = comments.map((comment) => comment.id);
  const currentCommentIdSet = new Set(currentCommentIds);
  const staleCommentIds = previousCommentIds.filter(
    (commentId) => !currentCommentIdSet.has(commentId)
  );

  await writeCachedComments(keys, comments);
  await redis.hSet(keys.postComments, {
    [postId]: JSON.stringify(currentCommentIds),
  });
  await deleteCachedComments(keys, staleCommentIds);

  return staleCommentIds.length;
};

const writeCachedComments = async (
  keys: CacheKeys,
  comments: CachedComment[]
): Promise<void> => {
  for (const chunk of chunkItems(comments, REDIS_WRITE_CHUNK_SIZE)) {
    const commentFields: Record<string, string> = {};
    const indexMembers = chunk.map((comment) => {
      commentFields[comment.id] = JSON.stringify(comment);

      return {
        member: comment.id,
        score: Date.parse(comment.createdAt),
      };
    });

    await redis.hSet(keys.comments, commentFields);
    await redis.zAdd(keys.index, ...indexMembers);
  }
};

const readCachedComments = async (
  keys: CacheKeys,
  commentIds: string[]
): Promise<CachedComment[]> => {
  const comments: CachedComment[] = [];

  for (const chunk of chunkItems(commentIds, REDIS_WRITE_CHUNK_SIZE)) {
    const values = await redis.hMGet(keys.comments, chunk);
    values.forEach((value) => {
      const comment = parseCachedComment(value);

      if (comment) {
        comments.push(comment);
      }
    });
  }

  return comments;
};

const deleteCachedComments = async (
  keys: CacheKeys,
  commentIds: string[]
): Promise<void> => {
  if (commentIds.length === 0) {
    return;
  }

  await redis.zRem(keys.index, commentIds);
  await redis.hDel(keys.comments, commentIds);
};

const pruneOldComments = async (keys: CacheKeys, now: number): Promise<number> => {
  const cutoff = now - COMMENT_RETENTION_MS;
  let prunedCommentCount = 0;

  for (let batch = 0; batch < MAX_COMMENT_PRUNE_BATCHES_PER_RUN; batch += 1) {
    const oldComments = await redis.zRange(keys.index, 0, cutoff, {
      by: 'score',
      limit: {
        offset: 0,
        count: COMMENT_PRUNE_BATCH_SIZE,
      },
    });
    const oldCommentIds = oldComments.map((comment) => comment.member);

    if (oldCommentIds.length === 0) {
      break;
    }

    await deleteCachedComments(keys, oldCommentIds);
    prunedCommentCount += oldCommentIds.length;
  }

  return prunedCommentCount;
};

const getCacheKeys = (subredditName: string): CacheKeys => {
  const keySubreddit = subredditName.toLowerCase();

  return {
    index: `${COMMENT_INDEX_PREFIX}:${keySubreddit}`,
    comments: `${COMMENT_DATA_PREFIX}:${keySubreddit}`,
    postComments: `${COMMENT_POST_INDEX_PREFIX}:${keySubreddit}`,
    meta: `${CACHE_META_PREFIX}:${keySubreddit}`,
  };
};

const toCachedComment = (comment: Comment): CachedComment => ({
  id: comment.id,
  postId: comment.postId,
  authorName: comment.authorName,
  score: comment.score,
  bodyPreview: createCommentPreview(comment.body),
  createdAt: comment.createdAt.toISOString(),
  permalink: comment.permalink,
});

const toChartComment = (comment: CachedComment): ChartComment => ({
  id: comment.id,
  postId: comment.postId,
  authorName: comment.authorName,
  score: comment.score,
  bodyPreview: comment.bodyPreview,
  createdAt: comment.createdAt,
  permalink: comment.permalink,
});

const createCommentPreview = (body: string): string => {
  const normalized = body.replace(/\s+/g, ' ').trim();
  const symbols = Array.from(normalized);

  if (symbols.length <= COMMENT_PREVIEW_LENGTH) {
    return normalized;
  }

  return `${symbols.slice(0, COMMENT_PREVIEW_LENGTH - 3).join('')}...`;
};

const parseCachedComment = (value: string | null): CachedComment | null => {
  if (value === null) {
    return null;
  }

  const parsed = parseJsonRecord(value);

  if (
    !parsed ||
    typeof parsed.id !== 'string' ||
    typeof parsed.postId !== 'string' ||
    typeof parsed.authorName !== 'string' ||
    !isFiniteNumber(parsed.score) ||
    typeof parsed.bodyPreview !== 'string' ||
    typeof parsed.createdAt !== 'string' ||
    typeof parsed.permalink !== 'string' ||
    Number.isNaN(Date.parse(parsed.createdAt))
  ) {
    return null;
  }

  return {
    id: parsed.id,
    postId: parsed.postId,
    authorName: parsed.authorName,
    score: parsed.score,
    bodyPreview: parsed.bodyPreview,
    createdAt: parsed.createdAt,
    permalink: parsed.permalink,
  };
};

const parseCachedCommentIds = (value: string | null): string[] => {
  if (value === null) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((commentId): commentId is string => typeof commentId === 'string')
      : [];
  } catch {
    return [];
  }
};

const parseCount = (value: string | undefined): number => {
  const count = Number(value);

  return Number.isInteger(count) && count >= 0 ? count : 0;
};

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

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const sumRefreshCount = (
  results: PostCommentsRefreshResult[],
  readCount: (result: PostCommentsRefreshResult) => number
): number => results.reduce((total, result) => total + readCount(result), 0);

const chunkItems = <Item>(items: Item[], size: number): Item[][] => {
  const chunks: Item[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
};

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
