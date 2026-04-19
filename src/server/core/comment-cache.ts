import { reddit, redis } from '@devvit/web/server';
import type { Comment } from '@devvit/web/server';
import {
  resolveUserAvatarUrl,
  type ChartComment,
  type CommentBodyPreviewKind,
} from '../../shared/api';
import { createDataLayer, getDataKeys, type DataLayer } from '../data';
import type { CommentEntity, HydratedComment } from '../data';
import { createLogger } from '../logging/logger';
import { readLatestCachedPostIds } from './post-cache';

const logger = createLogger('comment-cache');
const COMMENT_REFRESH_PARENT_POST_LIMIT = 1000;
const COMMENT_REFRESH_COMMENT_LIMIT = 1000;
const COMMENT_REFRESH_PAGE_SIZE = 100;
export const COMMENT_REFRESH_QUEUE_WORKER_DURATION_MS = 25 * 1000;
const COMMENT_PREVIEW_LENGTH = 20;
const REDIS_QUEUE_CHUNK_SIZE = 100;

type PostId = `t3_${string}`;
type CommentId = `t1_${string}`;
type CommentQueueMember = `${PostId}:${CommentId}`;
type CommentRefreshQueueRedisClient = Pick<
  typeof redis,
  'del' | 'zAdd' | 'zRange' | 'zRem'
>;
type CommentRefreshRedditClient = Pick<typeof reddit, 'getComments'>;

export type CommentCacheReadOptions = {
  subredditName: string;
  startTime: number;
  endTime: number;
};

export type CommentCacheReadResult = {
  comments: ChartComment[];
};

export type CommentCountReadResult = {
  commentCount: number;
};

export type CommentCacheRefreshResult = {
  parentPostCount: number;
  enqueuedPostCount: number;
  generatedAt: string;
};

export type CommentCacheQueueProcessOptions = {
  subredditName: string;
  maxDurationMs?: number;
};

export type CommentCacheQueueProcessResult = {
  processedPostCount: number;
  processedCommentParentCount: number;
  failedItemCount: number;
  invalidQueueItemCount: number;
  fetchedCommentCount: number;
  cachedCommentCount: number;
  enqueuedCommentParentCount: number;
  queueEmpty: boolean;
  generatedAt: string;
};

export type CommentCacheRefreshDependencies = {
  redisClient?: CommentRefreshQueueRedisClient;
  readParentPostIds?: (subredditName: string) => Promise<PostId[]>;
  now?: () => number;
};

export type CommentCacheQueueProcessDependencies = {
  redisClient?: CommentRefreshQueueRedisClient;
  redditClient?: CommentRefreshRedditClient;
  dataLayer?: DataLayer;
  now?: () => number;
};

type CommentRefreshQueueKeys = {
  postQueue: string;
  commentQueue: string;
};

type CommentQueueItem =
  | {
      kind: 'post';
      postId: PostId;
    }
  | {
      kind: 'comment';
      postId: PostId;
      commentId: CommentId;
    }
  | {
      kind: 'invalid';
      member: string;
    };

type QueueItemRefreshResult = {
  fetchedCommentCount: number;
  cachedCommentCount: number;
  enqueuedCommentParentCount: number;
  failed: boolean;
};

type CommentWithAuthor = HydratedComment<{ author: true }>;
type CommentBodyPreview = Pick<
  CommentEntity,
  'bodyPreview' | 'bodyPreviewKind'
>;

export const readCommentsInDateRange = async ({
  subredditName,
  startTime,
  endTime,
}: CommentCacheReadOptions): Promise<CommentCacheReadResult> => {
  const dataLayer = createDataLayer(subredditName);
  const comments = await dataLayer.comments.getInTimeRange({
    startTime,
    endTime,
  });
  const hydratedComments = await dataLayer.hydrateCommentRelations(comments, {
    author: true,
  });

  return {
    comments: hydratedComments
      .map(toChartComment)
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)),
  };
};

export const readCommentCountInDateRange = async ({
  subredditName,
  startTime,
  endTime,
}: CommentCacheReadOptions): Promise<CommentCountReadResult> => {
  const dataLayer = createDataLayer(subredditName);
  const comments = await dataLayer.comments.getInTimeRange({
    startTime,
    endTime,
  });

  return {
    commentCount: comments.length,
  };
};

export const refreshCommentCache = async (
  subredditName: string,
  {
    redisClient = redis,
    readParentPostIds = readCommentParentPostIds,
    now = Date.now,
  }: CommentCacheRefreshDependencies = {}
): Promise<CommentCacheRefreshResult> => {
  logger.info('Seeding comment cache refresh queues', { subredditName });

  try {
    const parentPostIds = await readParentPostIds(subredditName);
    const queueKeys = getCommentRefreshQueueKeys(subredditName);

    await redisClient.del(queueKeys.postQueue, queueKeys.commentQueue);
    const enqueuedPostCount = await enqueueQueueItems(
      redisClient,
      queueKeys.postQueue,
      parentPostIds,
      now()
    );

    const result = {
      parentPostCount: parentPostIds.length,
      enqueuedPostCount,
      generatedAt: new Date(now()).toISOString(),
    };

    logger.info('Seeded comment cache refresh queues', {
      subredditName,
      parentPostCount: result.parentPostCount,
      parentPostLimit: COMMENT_REFRESH_PARENT_POST_LIMIT,
      enqueuedPostCount: result.enqueuedPostCount,
      generatedAt: result.generatedAt,
    });

    return result;
  } catch (error) {
    logger.error('Comment cache refresh queue seed failed', {
      subredditName,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

export const processCommentCacheQueue = async (
  {
    subredditName,
    maxDurationMs = COMMENT_REFRESH_QUEUE_WORKER_DURATION_MS,
  }: CommentCacheQueueProcessOptions,
  {
    redisClient = redis,
    redditClient = reddit,
    dataLayer = createDataLayer(subredditName),
    now = Date.now,
  }: CommentCacheQueueProcessDependencies = {}
): Promise<CommentCacheQueueProcessResult> => {
  logger.info('Processing comment cache refresh queue', {
    subredditName,
    maxDurationMs,
  });

  const startedAt = now();
  const queueKeys = getCommentRefreshQueueKeys(subredditName);
  const result: CommentCacheQueueProcessResult = {
    processedPostCount: 0,
    processedCommentParentCount: 0,
    failedItemCount: 0,
    invalidQueueItemCount: 0,
    fetchedCommentCount: 0,
    cachedCommentCount: 0,
    enqueuedCommentParentCount: 0,
    queueEmpty: false,
    generatedAt: new Date(startedAt).toISOString(),
  };

  try {
    while (now() - startedAt < maxDurationMs) {
      const item = await dequeueNextCommentRefreshItem(redisClient, queueKeys);

      if (!item) {
        result.queueEmpty = true;
        break;
      }

      if (item.kind === 'invalid') {
        result.invalidQueueItemCount += 1;
        logger.warn('Skipped invalid comment refresh queue item', {
          subredditName,
          member: item.member,
        });
        continue;
      }

      const refreshResult = await refreshQueuedCommentParent({
        dataLayer,
        item,
        queueKeys,
        redditClient,
        redisClient,
        now,
      });

      if (item.kind === 'post') {
        result.processedPostCount += 1;
      } else {
        result.processedCommentParentCount += 1;
      }

      if (refreshResult.failed) {
        result.failedItemCount += 1;
      }

      result.fetchedCommentCount += refreshResult.fetchedCommentCount;
      result.cachedCommentCount += refreshResult.cachedCommentCount;
      result.enqueuedCommentParentCount +=
        refreshResult.enqueuedCommentParentCount;
    }

    result.generatedAt = new Date(now()).toISOString();

    logger.info('Processed comment cache refresh queue', {
      subredditName,
      processedPostCount: result.processedPostCount,
      processedCommentParentCount: result.processedCommentParentCount,
      failedItemCount: result.failedItemCount,
      invalidQueueItemCount: result.invalidQueueItemCount,
      fetchedCommentCount: result.fetchedCommentCount,
      cachedCommentCount: result.cachedCommentCount,
      enqueuedCommentParentCount: result.enqueuedCommentParentCount,
      queueEmpty: result.queueEmpty,
      generatedAt: result.generatedAt,
    });

    return result;
  } catch (error) {
    logger.error('Comment cache refresh queue processing failed', {
      subredditName,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

const readCommentParentPostIds = async (
  subredditName: string
): Promise<PostId[]> => {
  const cachedPostIds = await readLatestCachedPostIds({
    subredditName,
    limit: COMMENT_REFRESH_PARENT_POST_LIMIT,
  });

  return cachedPostIds.postIds;
};

const getCommentRefreshQueueKeys = (
  subredditName: string
): CommentRefreshQueueKeys => {
  const keys = getDataKeys(subredditName);

  return {
    postQueue: keys.commentRefreshPostQueue,
    commentQueue: keys.commentRefreshCommentQueue,
  };
};

const enqueueQueueItems = async (
  redisClient: CommentRefreshQueueRedisClient,
  queueKey: string,
  items: string[],
  nowMs: number
): Promise<number> => {
  if (items.length === 0) {
    return 0;
  }

  const baseScore = nowMs * 1000;
  let enqueuedItemCount = 0;

  for (let start = 0; start < items.length; start += REDIS_QUEUE_CHUNK_SIZE) {
    const chunk = items.slice(start, start + REDIS_QUEUE_CHUNK_SIZE);

    enqueuedItemCount += await redisClient.zAdd(
      queueKey,
      ...chunk.map((member, index) => ({
        member,
        score: baseScore + start + index,
      }))
    );
  }

  return enqueuedItemCount;
};

const dequeueNextCommentRefreshItem = async (
  redisClient: CommentRefreshQueueRedisClient,
  queueKeys: CommentRefreshQueueKeys
): Promise<CommentQueueItem | null> => {
  const commentMember = await dequeueQueueMember(
    redisClient,
    queueKeys.commentQueue
  );

  if (commentMember) {
    return parseCommentQueueMember(commentMember);
  }

  const postMember = await dequeueQueueMember(redisClient, queueKeys.postQueue);

  if (!postMember) {
    return null;
  }

  return isPostId(postMember)
    ? { kind: 'post', postId: postMember }
    : { kind: 'invalid', member: postMember };
};

const dequeueQueueMember = async (
  redisClient: CommentRefreshQueueRedisClient,
  queueKey: string
): Promise<string | null> => {
  const nextItems = await redisClient.zRange(queueKey, 0, 0, { by: 'rank' });
  const nextItem = nextItems[0];

  if (!nextItem) {
    return null;
  }

  await redisClient.zRem(queueKey, [nextItem.member]);

  return nextItem.member;
};

const parseCommentQueueMember = (member: string): CommentQueueItem => {
  const [postId, commentId, extra] = member.split(':');

  if (!extra && isPostId(postId) && isCommentId(commentId)) {
    return {
      kind: 'comment',
      postId,
      commentId,
    };
  }

  return {
    kind: 'invalid',
    member,
  };
};

const refreshQueuedCommentParent = async ({
  dataLayer,
  item,
  queueKeys,
  redditClient,
  redisClient,
  now,
}: {
  dataLayer: DataLayer;
  item: Exclude<CommentQueueItem, { kind: 'invalid' }>;
  queueKeys: CommentRefreshQueueKeys;
  redditClient: CommentRefreshRedditClient;
  redisClient: CommentRefreshQueueRedisClient;
  now: () => number;
}): Promise<QueueItemRefreshResult> => {
  try {
    const comments = await redditClient
      .getComments({
        postId: item.postId,
        ...(item.kind === 'comment' ? { commentId: item.commentId } : {}),
        limit: COMMENT_REFRESH_COMMENT_LIMIT,
        pageSize: COMMENT_REFRESH_PAGE_SIZE,
      })
      .all();

    logger.debug('Fetched comments for comment cache queue item', {
      postId: item.postId,
      commentId: item.kind === 'comment' ? item.commentId : undefined,
      fetchedCommentCount: comments.length,
    });

    const commentEntities = comments.map(toCommentEntity);

    await dataLayer.comments.upsertMany(commentEntities);

    const enqueuedCommentParentCount = await enqueueQueueItems(
      redisClient,
      queueKeys.commentQueue,
      comments
        .map((comment) => createCommentQueueMember(comment.postId, comment.id))
        .filter((member): member is CommentQueueMember => member !== null),
      now()
    );

    return {
      fetchedCommentCount: comments.length,
      cachedCommentCount: commentEntities.length,
      enqueuedCommentParentCount,
      failed: false,
    };
  } catch (error) {
    logger.warn('Unable to refresh comments for comment cache queue item', {
      postId: item.postId,
      commentId: item.kind === 'comment' ? item.commentId : undefined,
      error: getErrorMessage(error),
    });

    return {
      fetchedCommentCount: 0,
      cachedCommentCount: 0,
      enqueuedCommentParentCount: 0,
      failed: true,
    };
  }
};

const createCommentQueueMember = (
  postId: string,
  commentId: string
): CommentQueueMember | null =>
  isPostId(postId) && isCommentId(commentId) ? `${postId}:${commentId}` : null;

const toCommentEntity = (comment: Comment): CommentEntity => {
  const bodyPreview = createCommentBodyPreview(comment.body);

  return {
    id: comment.id,
    postId: comment.postId,
    authorName: comment.authorName,
    score: comment.score,
    bodyPreview: bodyPreview.bodyPreview,
    bodyPreviewKind: bodyPreview.bodyPreviewKind,
    createdAt: comment.createdAt.toISOString(),
    permalink: comment.permalink,
  };
};

const toChartComment = (comment: CommentWithAuthor): ChartComment => ({
  id: comment.id,
  postId: comment.postId,
  authorName: comment.authorName,
  authorAvatarUrl: resolveUserAvatarUrl(comment.author?.avatarUrl),
  score: comment.score,
  bodyPreview: comment.bodyPreview,
  bodyPreviewKind: comment.bodyPreviewKind,
  createdAt: comment.createdAt,
  permalink: comment.permalink,
});

const createCommentBodyPreview = (body: string): CommentBodyPreview => {
  const normalized = normalizeCommentBody(body);
  const mediaKind = getMediaOnlyCommentPreviewKind(normalized);

  if (mediaKind) {
    return {
      bodyPreview: '',
      bodyPreviewKind: mediaKind,
    };
  }

  return {
    bodyPreview: truncateCommentPreview(normalized),
    bodyPreviewKind: 'text',
  };
};

const truncateCommentPreview = (normalized: string): string => {
  const symbols = Array.from(normalized);

  if (symbols.length <= COMMENT_PREVIEW_LENGTH) {
    return normalized;
  }

  return `${symbols.slice(0, COMMENT_PREVIEW_LENGTH - 3).join('')}...`;
};

const normalizeCommentBody = (body: string): string =>
  body.replace(/\s+/g, ' ').trim();

const getMediaOnlyCommentPreviewKind = (
  normalized: string
): Exclude<CommentBodyPreviewKind, 'text'> | null => {
  if (isGiphyMarkdownComment(normalized)) {
    return 'gif';
  }

  if (isImageUrlComment(normalized)) {
    return 'image';
  }

  return null;
};

const isGiphyMarkdownComment = (normalized: string): boolean => {
  const match = /^!\[\s*gif\s*\]\(([^)\s]+)\)$/iu.exec(normalized);
  const target = match?.[1];

  if (!target) {
    return false;
  }

  if (target.startsWith('giphy|')) {
    return true;
  }

  return isUrlWithHost(
    target,
    (host) => host === 'giphy.com' || host.endsWith('.giphy.com')
  );
};

const isImageUrlComment = (normalized: string): boolean =>
  isUrlWithHost(normalized, (host, url) => {
    if (host === 'preview.redd.it' || host === 'i.redd.it') {
      return true;
    }

    return /\.(?:avif|jpe?g|png|webp)$/iu.test(url.pathname);
  });

const isUrlWithHost = (
  value: string,
  predicate: (host: string, url: URL) => boolean
): boolean => {
  try {
    const url = new URL(value);

    return (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      predicate(url.hostname, url)
    );
  } catch {
    return false;
  }
};

const isPostId = (value: unknown): value is PostId =>
  typeof value === 'string' && value.startsWith('t3_') && value.length > 3;

const isCommentId = (value: unknown): value is CommentId =>
  typeof value === 'string' && value.startsWith('t1_') && value.length > 3;

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
