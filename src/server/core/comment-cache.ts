import { reddit, redis, scheduler } from '@devvit/web/server';
import type { Comment } from '@devvit/web/server';
import type { ChartComment } from '../../shared/api';
import { readCachedPostIdsForTimeframe } from './post-cache';

const COMMENT_INDEX_PREFIX = 'bubble-stats:comments:index';
const COMMENT_DATA_PREFIX = 'bubble-stats:comments:data';
const COMMENT_AUTHOR_DATA_PREFIX = 'bubble-stats:comments:authors:data';
const COMMENT_META_PREFIX = 'bubble-stats:comments:meta';
const REDIS_WRITE_CHUNK_SIZE = 100;
const COMMENT_REFRESH_POST_CHUNK_SIZE = 50;
const COMMENT_REFRESH_CHUNK_JOB_DELAY_MS = 60 * 1000;
export const COMMENT_REFRESH_CHUNK_JOB_NAME = 'refreshCommentCacheChunk';
const COMMENT_PRUNE_BATCH_SIZE = 500;
const MAX_COMMENT_PRUNE_BATCHES_PER_RUN = 10;
const COMMENT_AUTHOR_AVATAR_CONCURRENCY = 4;
const MAX_COMMENT_AUTHORS_TO_REFRESH_PER_POST = 25;
const COMMENT_AUTHOR_PRUNE_SCAN_COUNT = 200;
const COMMENT_PREVIEW_LENGTH = 20;
const DAY_MS = 24 * 60 * 60 * 1000;
const COMMENT_RETENTION_MS = 90 * DAY_MS;
const COMMENT_AUTHOR_AVATAR_STALE_MS = DAY_MS;
const COMMENT_AUTHOR_AVATAR_RETENTION_MS = 90 * DAY_MS;
const PARENT_POST_LOOKBACK_MS = 90 * DAY_MS;

export type CommentCacheReadOptions = {
  subredditName: string;
  startTime: number;
  endTime: number;
  excludedPostId: string | null;
};

export type CommentCacheReadResult = {
  comments: ChartComment[];
};

export type CommentCountReadResult = {
  commentCount: number;
};

export type CommentCacheRefreshResult = {
  parentPostCount: number;
  scheduledPostCount: number;
  scheduledJobCount: number;
  scheduledJobIds: string[];
  prunedCommentCount: number;
  prunedAuthorAvatarCount: number;
  generatedAt: string;
};

export type CommentCacheChunkRefreshData = {
  subredditName: string;
  postIds: `t3_${string}`[];
};

export type CommentCacheChunkRefreshResult = {
  refreshedPostCount: number;
  failedPostCount: number;
  fetchedCommentCount: number;
  cachedCommentCount: number;
  refreshedAuthorAvatarCount: number;
  generatedAt: string;
};

type CacheKeys = {
  index: string;
  comments: string;
  authors: string;
  meta: string;
};

type CachedComment = {
  id: string;
  postId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  score: number;
  bodyPreview: string;
  createdAt: string;
  permalink: string;
};

type PostCommentsRefreshResult = {
  fetchedCommentCount: number;
  cachedCommentCount: number;
  refreshedAuthorAvatarCount: number;
  failed: boolean;
};

type CachedCommentAuthorAvatar = {
  avatarUrl: string | null;
  fetchedAt: string;
};

export const readCommentsForTimeframe = async ({
  subredditName,
  startTime,
  endTime,
  excludedPostId,
}: CommentCacheReadOptions): Promise<CommentCacheReadResult> => {
  const keys = getCacheKeys(subredditName);
  const commentIds = await readIndexedCommentIdsForTimeframe(keys, startTime, endTime);
  const cachedComments = await readCachedComments(keys, commentIds);
  const visibleCachedComments = filterVisibleComments(cachedComments, excludedPostId);
  const comments = visibleCachedComments
    .map(toChartComment)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

  return {
    comments,
  };
};

export const readCommentCountForTimeframe = async ({
  subredditName,
  startTime,
  endTime,
  excludedPostId,
}: CommentCacheReadOptions): Promise<CommentCountReadResult> => {
  const keys = getCacheKeys(subredditName);
  const commentIds = await readIndexedCommentIdsForTimeframe(keys, startTime, endTime);
  const cachedComments = await readCachedComments(keys, commentIds);
  const visibleCachedComments = filterVisibleComments(cachedComments, excludedPostId);

  return {
    commentCount: visibleCachedComments.length,
  };
};

export const refreshCommentCache = async (
  subredditName: string
): Promise<CommentCacheRefreshResult> => {
  const keys = getCacheKeys(subredditName);
  const fetchedAt = new Date();
  const parentPostIds = await readCommentParentPostIds(subredditName, fetchedAt.getTime());
  const postIdChunks = chunkItems(parentPostIds, COMMENT_REFRESH_POST_CHUNK_SIZE);
  const firstRunAt = Date.now() + COMMENT_REFRESH_CHUNK_JOB_DELAY_MS;
  const scheduledJobIds: string[] = [];

  console.log(
    `Scheduling comment cache refresh for r/${subredditName}. Found ${parentPostIds.length} parent posts in the timeframe.`
  );

  for (const [chunkIndex, postIds] of postIdChunks.entries()) {
    const jobId = await scheduler.runJob({
      name: COMMENT_REFRESH_CHUNK_JOB_NAME,
      data: {
        subredditName,
        postIds,
      },
      runAt: new Date(
        firstRunAt + chunkIndex * COMMENT_REFRESH_CHUNK_JOB_DELAY_MS
      ),
    });

    scheduledJobIds.push(jobId);
  }

  const prunedCommentCount = await pruneOldComments(keys, fetchedAt.getTime());
  const prunedAuthorAvatarCount = await pruneOldCommentAuthorAvatars(
    keys,
    fetchedAt.getTime()
  );

  return {
    parentPostCount: parentPostIds.length,
    scheduledPostCount: postIdChunks.reduce((total, postIds) => total + postIds.length, 0),
    scheduledJobCount: scheduledJobIds.length,
    scheduledJobIds,
    prunedCommentCount,
    prunedAuthorAvatarCount,
    generatedAt: new Date().toISOString(),
  };
};

export const refreshCommentCacheChunk = async ({
  subredditName,
  postIds,
}: CommentCacheChunkRefreshData): Promise<CommentCacheChunkRefreshResult> => {
  const keys = getCacheKeys(subredditName);
  const refreshResults: PostCommentsRefreshResult[] = [];

  console.log(
    `Refreshing comment cache chunk for r/${subredditName}. Found ${postIds.length} parent posts in this chunk.`
  );

  for (const postId of postIds) {
    refreshResults.push(await refreshPostComments(keys, postId));
  }

  return {
    refreshedPostCount: postIds.length,
    failedPostCount: refreshResults.filter((result) => result.failed).length,
    fetchedCommentCount: sumRefreshCount(
      refreshResults,
      (result) => result.fetchedCommentCount
    ),
    cachedCommentCount: sumRefreshCount(
      refreshResults,
      (result) => result.cachedCommentCount
    ),
    refreshedAuthorAvatarCount: sumRefreshCount(
      refreshResults,
      (result) => result.refreshedAuthorAvatarCount
    ),
    generatedAt: new Date().toISOString(),
  };
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
    const authorAvatars = await readCommentAuthorAvatarUrls(keys, comments, new Date());
    const cachedComments = comments.map((comment) =>
      toCachedComment(comment, authorAvatars.avatarUrls.get(comment.authorName) ?? null)
    );
    await writeCachedComments(keys, cachedComments);

    return {
      fetchedCommentCount: comments.length,
      cachedCommentCount: cachedComments.length,
      refreshedAuthorAvatarCount: authorAvatars.refreshedCount,
      failed: false,
    };
  } catch (error) {
    console.warn(`Unable to refresh comments for ${postId}: ${getErrorMessage(error)}`);

    return {
      fetchedCommentCount: 0,
      cachedCommentCount: 0,
      refreshedAuthorAvatarCount: 0,
      failed: true,
    };
  }
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

const readCommentAuthorAvatarUrls = async (
  keys: CacheKeys,
  comments: Comment[],
  fetchedAt: Date
): Promise<{ avatarUrls: Map<string, string | null>; refreshedCount: number }> => {
  const usernames = getUniqueRefreshableCommentAuthorNames(comments);
  const cachedAvatars = await readCachedCommentAuthorAvatars(keys, usernames);
  const usernamesToRefresh = selectStaleCommentAuthorAvatarNames(
    usernames,
    cachedAvatars,
    fetchedAt
  );
  const refreshedAvatars = await mapWithConcurrency(
    usernamesToRefresh,
    COMMENT_AUTHOR_AVATAR_CONCURRENCY,
    async (username) =>
      [
        username,
        {
          avatarUrl: await getAuthorAvatarUrl(username),
          fetchedAt: fetchedAt.toISOString(),
        },
      ] as const
  );
  const avatarFields: Record<string, string> = {};

  refreshedAvatars.forEach(([username, avatar]) => {
    cachedAvatars.set(username, avatar);
    avatarFields[username] = JSON.stringify(avatar);
  });

  if (Object.keys(avatarFields).length > 0) {
    await redis.hSet(keys.authors, avatarFields);
  }

  return {
    avatarUrls: new Map(
      [...cachedAvatars.entries()].map(([username, avatar]) => [username, avatar.avatarUrl])
    ),
    refreshedCount: refreshedAvatars.length,
  };
};

const readCachedCommentAuthorAvatars = async (
  keys: CacheKeys,
  usernames: string[]
): Promise<Map<string, CachedCommentAuthorAvatar>> => {
  const avatars = new Map<string, CachedCommentAuthorAvatar>();

  for (const chunk of chunkItems(usernames, REDIS_WRITE_CHUNK_SIZE)) {
    const values = await redis.hMGet(keys.authors, chunk);

    values.forEach((value, index) => {
      const username = chunk[index];
      const avatar = parseCachedCommentAuthorAvatar(value);

      if (username && avatar) {
        avatars.set(username, avatar);
      }
    });
  }

  return avatars;
};

const selectStaleCommentAuthorAvatarNames = (
  usernames: string[],
  avatars: Map<string, CachedCommentAuthorAvatar>,
  fetchedAt: Date
): string[] => {
  const staleCutoff = fetchedAt.getTime() - COMMENT_AUTHOR_AVATAR_STALE_MS;
  const staleUsernames: string[] = [];

  for (const username of usernames) {
    const avatar = avatars.get(username);

    if (!avatar || Date.parse(avatar.fetchedAt) < staleCutoff) {
      staleUsernames.push(username);
    }

    if (staleUsernames.length >= MAX_COMMENT_AUTHORS_TO_REFRESH_PER_POST) {
      break;
    }
  }

  return staleUsernames;
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

const pruneOldCommentAuthorAvatars = async (
  keys: CacheKeys,
  now: number
): Promise<number> => {
  const cursor = await readCommentAuthorAvatarPruneCursor(keys);
  const scan = await redis.hScan(
    keys.authors,
    cursor,
    undefined,
    COMMENT_AUTHOR_PRUNE_SCAN_COUNT
  );
  const cutoff = now - COMMENT_AUTHOR_AVATAR_RETENTION_MS;
  const staleAuthors = scan.fieldValues
    .filter((fieldValue) => {
      const avatar = parseCachedCommentAuthorAvatar(fieldValue.value);
      return !avatar || Date.parse(avatar.fetchedAt) < cutoff;
    })
    .map((fieldValue) => fieldValue.field);

  await redis.hSet(keys.meta, {
    authorAvatarPruneCursor: String(scan.cursor),
  });

  if (staleAuthors.length > 0) {
    await redis.hDel(keys.authors, staleAuthors);
  }

  return staleAuthors.length;
};

const readCommentAuthorAvatarPruneCursor = async (keys: CacheKeys): Promise<number> => {
  const cursorText = await redis.hGet(keys.meta, 'authorAvatarPruneCursor');
  const cursor = Number(cursorText);

  return Number.isInteger(cursor) && cursor >= 0 ? cursor : 0;
};

const getCacheKeys = (subredditName: string): CacheKeys => {
  const keySubreddit = subredditName.toLowerCase();

  return {
    index: `${COMMENT_INDEX_PREFIX}:${keySubreddit}`,
    comments: `${COMMENT_DATA_PREFIX}:${keySubreddit}`,
    authors: `${COMMENT_AUTHOR_DATA_PREFIX}:${keySubreddit}`,
    meta: `${COMMENT_META_PREFIX}:${keySubreddit}`,
  };
};

const readIndexedCommentIdsForTimeframe = async (
  keys: CacheKeys,
  startTime: number,
  endTime: number
): Promise<string[]> => {
  const indexedComments = await redis.zRange(keys.index, startTime, endTime, { by: 'score' });

  return indexedComments.map((comment) => comment.member);
};

const filterVisibleComments = (
  comments: CachedComment[],
  excludedPostId: string | null
): CachedComment[] => comments.filter((comment) => comment.postId !== excludedPostId);

const toCachedComment = (
  comment: Comment,
  authorAvatarUrl: string | null
): CachedComment => ({
  id: comment.id,
  postId: comment.postId,
  authorName: comment.authorName,
  authorAvatarUrl,
  score: comment.score,
  bodyPreview: createCommentPreview(comment.body),
  createdAt: comment.createdAt.toISOString(),
  permalink: comment.permalink,
});

const toChartComment = (comment: CachedComment): ChartComment => ({
  id: comment.id,
  postId: comment.postId,
  authorName: comment.authorName,
  authorAvatarUrl: comment.authorAvatarUrl,
  score: comment.score,
  bodyPreview: comment.bodyPreview,
  createdAt: comment.createdAt,
  permalink: comment.permalink,
});

const getUniqueRefreshableCommentAuthorNames = (comments: Comment[]): string[] =>
  Array.from(
    new Set(
      comments
        .map((comment) => comment.authorName)
        .filter((username) => username !== '[deleted]' && username.trim() !== '')
    )
  );

const getAuthorAvatarUrl = async (username: string): Promise<string | null> => {
  try {
    return (await reddit.getSnoovatarUrl(username)) ?? null;
  } catch (error) {
    console.warn(`Unable to load avatar for u/${username}: ${getErrorMessage(error)}`);
    return null;
  }
};

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
    (parsed.authorAvatarUrl !== undefined &&
      parsed.authorAvatarUrl !== null &&
      typeof parsed.authorAvatarUrl !== 'string') ||
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
    authorAvatarUrl:
      typeof parsed.authorAvatarUrl === 'string' ? parsed.authorAvatarUrl : null,
    score: parsed.score,
    bodyPreview: parsed.bodyPreview,
    createdAt: parsed.createdAt,
    permalink: parsed.permalink,
  };
};

const parseCachedCommentAuthorAvatar = (
  value: string | null
): CachedCommentAuthorAvatar | null => {
  if (value === null) {
    return null;
  }

  const parsed = parseJsonRecord(value);

  if (
    !parsed ||
    (parsed.avatarUrl !== null && typeof parsed.avatarUrl !== 'string') ||
    typeof parsed.fetchedAt !== 'string' ||
    Number.isNaN(Date.parse(parsed.fetchedAt))
  ) {
    return null;
  }

  return {
    avatarUrl: parsed.avatarUrl,
    fetchedAt: parsed.fetchedAt,
  };
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
        results[index] = await mapper(items[index]!);
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
