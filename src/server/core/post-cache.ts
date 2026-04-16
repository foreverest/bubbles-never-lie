import { reddit } from '@devvit/web/server';
import type { Post } from '@devvit/web/server';
import {
  resolveUserAvatarUrl,
  type AuthorSubredditKarmaBucket,
  type ChartPost,
} from '../../shared/api';
import { createBubbleStatsDataLayer } from '../data';
import type { AuthorEntity, HydratedPost, PostEntity } from '../data';
import { createAuthorKarmaBuckets } from './author-karma';

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

export type CachedPostIdReadResult = {
  postIds: `t3_${string}`[];
};

type PostWithAuthor = HydratedPost<{ authors: true }>;

export const readPostsForTimeframe = async ({
  subredditName,
  startTime,
  endTime,
}: PostCacheReadOptions): Promise<PostCacheReadResult> => {
  const dataLayer = createBubbleStatsDataLayer(subredditName);
  const posts = await dataLayer.posts.getInTimeRange({ startTime, endTime });
  const hydratedPosts = await dataLayer.hydratePostRelations(posts, { authors: true });
  const authorKarmaBuckets = createAuthorKarmaBuckets(
    getUniqueAuthors(hydratedPosts)
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
  const dataLayer = createBubbleStatsDataLayer(subredditName);
  const posts = await dataLayer.posts.getInTimeRange({ startTime, endTime });

  return {
    postCount: posts.length,
  };
};

export const refreshPostCache = async (
  subredditName: string
): Promise<PostCacheRefreshResult> => {
  const dataLayer = createBubbleStatsDataLayer(subredditName);
  const posts = await reddit
    .getNewPosts({
      subredditName,
      limit: 1000,
      pageSize: 100,
    })
    .all();
  const postEntities = posts.map(toPostEntity);
  const generatedAt = new Date().toISOString();

  await dataLayer.posts.upsertMany(postEntities);

  return {
    fetchedPostCount: posts.length,
    cachedPostCount: postEntities.length,
    generatedAt,
  };
};

export const readCachedPostIdsForTimeframe = async ({
  subredditName,
  startTime,
  endTime,
}: CachedPostIdReadOptions): Promise<CachedPostIdReadResult> => {
  const dataLayer = createBubbleStatsDataLayer(subredditName);
  const postIds = (
    await dataLayer.posts.getIdsInTimeRange({ startTime, endTime })
  ).filter(isPostId);

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
  authorSubredditKarmaBucket: AuthorSubredditKarmaBucket | null
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

const getUniqueAuthors = (posts: PostWithAuthor[]): AuthorEntity[] => {
  const authorsByName = new Map<string, AuthorEntity>();

  posts.forEach((post) => {
    if (post.author) {
      authorsByName.set(post.authorName, post.author);
    }
  });

  return [...authorsByName.values()];
};

const isPostId = (value: string): value is `t3_${string}` =>
  value.startsWith('t3_') && value.length > 3;
