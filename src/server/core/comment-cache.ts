import { reddit, scheduler } from '@devvit/web/server';
import type { Comment } from '@devvit/web/server';
import { resolveUserAvatarUrl, type ChartComment } from '../../shared/api';
import { createBubbleStatsDataLayer } from '../data';
import type { CommentEntity, HydratedComment } from '../data';
import { readCachedPostIdsForTimeframe } from './post-cache';

const COMMENT_REFRESH_POST_CHUNK_SIZE = 50;
const COMMENT_REFRESH_CHUNK_JOB_DELAY_MS = 60 * 1000;
export const COMMENT_REFRESH_CHUNK_JOB_NAME = 'refreshCommentCacheChunk';
const COMMENT_PREVIEW_LENGTH = 20;
const DAY_MS = 24 * 60 * 60 * 1000;
const PARENT_POST_LOOKBACK_MS = 90 * DAY_MS;

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
  scheduledPostCount: number;
  scheduledJobCount: number;
  scheduledJobIds: string[];
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
  generatedAt: string;
};

type PostCommentsRefreshResult = {
  fetchedCommentCount: number;
  cachedCommentCount: number;
  failed: boolean;
};

type CommentWithAuthor = HydratedComment<{ authors: true }>;

export const readCommentsForTimeframe = async ({
  subredditName,
  startTime,
  endTime,
}: CommentCacheReadOptions): Promise<CommentCacheReadResult> => {
  const dataLayer = createBubbleStatsDataLayer(subredditName);
  const comments = await dataLayer.comments.getInTimeRange({ startTime, endTime });
  const hydratedComments = await dataLayer.hydrateCommentRelations(comments, {
    authors: true,
  });

  return {
    comments: hydratedComments
      .map(toChartComment)
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)),
  };
};

export const readCommentCountForTimeframe = async ({
  subredditName,
  startTime,
  endTime,
}: CommentCacheReadOptions): Promise<CommentCountReadResult> => {
  const dataLayer = createBubbleStatsDataLayer(subredditName);
  const comments = await dataLayer.comments.getInTimeRange({ startTime, endTime });

  return {
    commentCount: comments.length,
  };
};

export const refreshCommentCache = async (
  subredditName: string
): Promise<CommentCacheRefreshResult> => {
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

  return {
    parentPostCount: parentPostIds.length,
    scheduledPostCount: postIdChunks.reduce((total, postIds) => total + postIds.length, 0),
    scheduledJobCount: scheduledJobIds.length,
    scheduledJobIds,
    generatedAt: new Date().toISOString(),
  };
};

export const refreshCommentCacheChunk = async ({
  subredditName,
  postIds,
}: CommentCacheChunkRefreshData): Promise<CommentCacheChunkRefreshResult> => {
  const dataLayer = createBubbleStatsDataLayer(subredditName);
  const refreshResults: PostCommentsRefreshResult[] = [];

  console.log(
    `Refreshing comment cache chunk for r/${subredditName}. Found ${postIds.length} parent posts in this chunk.`
  );

  for (const postId of postIds) {
    refreshResults.push(await refreshPostComments(dataLayer, postId));
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
  });

  return cachedPostIds.postIds;
};

const refreshPostComments = async (
  dataLayer: ReturnType<typeof createBubbleStatsDataLayer>,
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
    const commentEntities = comments.map(toCommentEntity);

    await dataLayer.comments.upsertMany(commentEntities);

    return {
      fetchedCommentCount: comments.length,
      cachedCommentCount: commentEntities.length,
      failed: false,
    };
  } catch (error) {
    console.warn(`Unable to refresh comments for ${postId}: ${getErrorMessage(error)}`);

    return {
      fetchedCommentCount: 0,
      cachedCommentCount: 0,
      failed: true,
    };
  }
};

const toCommentEntity = (comment: Comment): CommentEntity => ({
  id: comment.id,
  postId: comment.postId,
  authorName: comment.authorName,
  score: comment.score,
  bodyPreview: createCommentPreview(comment.body),
  createdAt: comment.createdAt.toISOString(),
  permalink: comment.permalink,
});

const toChartComment = (comment: CommentWithAuthor): ChartComment => ({
  id: comment.id,
  postId: comment.postId,
  authorName: comment.authorName,
  authorAvatarUrl: resolveUserAvatarUrl(comment.author?.avatarUrl),
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
