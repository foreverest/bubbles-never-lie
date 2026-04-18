import { reddit } from '@devvit/web/server';
import type { Post } from '@devvit/web/server';
import {
  resolveUserAvatarUrl,
  type ChartPost,
  type SubredditKarmaBucket,
} from '../../shared/api';
import { createDataLayer } from '../data';
import type { ContributorEntity, HydratedPost, PostEntity } from '../data';
import { createLogger } from '../logging/logger';
import { createContributorKarmaBuckets } from './contributor-karma';

const logger = createLogger('post-cache');

export type PostCacheReadOptions = {
  subredditName: string;
  startTime: number;
  endTime: number;
};

export type PostCacheReadResult = {
  posts: ChartPost[];
};

export type PostCountReadResult = {
  postCount: number;
};

export type PostCacheRefreshResult = {
  fetchedPostCount: number;
  cachedPostCount: number;
  generatedAt: string;
};

export type CachedPostIdReadOptions = {
  subredditName: string;
  startTime: number;
  endTime: number;
};

export type LatestCachedPostIdReadOptions = {
  subredditName: string;
  limit: number;
};

export type CachedPostIdReadResult = {
  postIds: `t3_${string}`[];
};

type PostWithAuthor = HydratedPost<{ author: true }>;

export const readPostsForTimeframe = async ({
  subredditName,
  startTime,
  endTime,
}: PostCacheReadOptions): Promise<PostCacheReadResult> => {
  const dataLayer = createDataLayer(subredditName);
  const posts = await dataLayer.posts.getInTimeRange({ startTime, endTime });
  const hydratedPosts = await dataLayer.hydratePostRelations(posts, {
    author: true,
  });
  const authorKarmaBuckets = createContributorKarmaBuckets(
    getUniquePostAuthors(hydratedPosts)
  );

  return {
    posts: hydratedPosts
      .map((post) =>
        toChartPost(post, authorKarmaBuckets.get(post.authorName) ?? null)
      )
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)),
  };
};

export const readPostCountForTimeframe = async ({
  subredditName,
  startTime,
  endTime,
}: PostCacheReadOptions): Promise<PostCountReadResult> => {
  const dataLayer = createDataLayer(subredditName);
  const posts = await dataLayer.posts.getInTimeRange({ startTime, endTime });

  return {
    postCount: posts.length,
  };
};

export const refreshPostCache = async (
  subredditName: string
): Promise<PostCacheRefreshResult> => {
  logger.info('Refreshing post cache', { subredditName });

  try {
    const dataLayer = createDataLayer(subredditName);
    const posts = await reddit
      .getNewPosts({
        subredditName,
        limit: 1000,
        pageSize: 100,
      })
      .all();
    const postEntities = posts.map(toPostEntity);
    const generatedAt = new Date().toISOString();

    logger.info('Fetched posts from Reddit', {
      subredditName,
      fetchedPostCount: posts.length,
    });

    await dataLayer.posts.upsertMany(postEntities);

    logger.info('Stored post cache entries', {
      subredditName,
      cachedPostCount: postEntities.length,
      generatedAt,
    });

    return {
      fetchedPostCount: posts.length,
      cachedPostCount: postEntities.length,
      generatedAt,
    };
  } catch (error) {
    logger.error('Post cache refresh failed', {
      subredditName,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

export const readCachedPostIdsForTimeframe = async ({
  subredditName,
  startTime,
  endTime,
}: CachedPostIdReadOptions): Promise<CachedPostIdReadResult> => {
  const dataLayer = createDataLayer(subredditName);
  const postIds = (
    await dataLayer.posts.getIdsInTimeRange({ startTime, endTime })
  ).filter(isPostId);

  return {
    postIds,
  };
};

export const readLatestCachedPostIds = async ({
  subredditName,
  limit,
}: LatestCachedPostIdReadOptions): Promise<CachedPostIdReadResult> => {
  const dataLayer = createDataLayer(subredditName);
  const postIds = (await dataLayer.posts.getLatestIds(limit)).filter(isPostId);

  return {
    postIds,
  };
};

const toPostEntity = (post: Post): PostEntity => ({
  id: post.id,
  title: post.title,
  authorName: post.authorName,
  comments: post.numberOfComments,
  score: post.score,
  createdAt: post.createdAt.toISOString(),
  permalink: post.permalink,
});

const toChartPost = (
  post: PostWithAuthor,
  authorSubredditKarmaBucket: SubredditKarmaBucket | null
): ChartPost => ({
  id: post.id,
  title: post.title,
  authorName: post.authorName,
  authorAvatarUrl: resolveUserAvatarUrl(post.author?.avatarUrl),
  comments: post.comments,
  score: post.score,
  authorSubredditKarmaBucket,
  createdAt: post.createdAt,
  permalink: post.permalink,
});

const getUniquePostAuthors = (posts: PostWithAuthor[]): ContributorEntity[] => {
  const postAuthorsByName = new Map<string, ContributorEntity>();

  posts.forEach((post) => {
    if (post.author) {
      postAuthorsByName.set(post.authorName, post.author);
    }
  });

  return [...postAuthorsByName.values()];
};

const isPostId = (value: string): value is `t3_${string}` =>
  value.startsWith('t3_') && value.length > 3;

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
