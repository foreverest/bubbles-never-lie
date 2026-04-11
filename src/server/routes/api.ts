import { context, reddit } from '@devvit/web/server';
import type { Post } from '@devvit/web/server';
import { Hono } from 'hono';
import type { ChartDataResponse, ChartPost, ErrorResponse } from '../../shared/api';
import { readTimeframePostData } from '../core/timeframe';

export const api = new Hono();

api.get('/posts', async (c) => {
  const timeframe = readTimeframePostData(context.postData);

  if (!timeframe) {
    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: 'This post is missing a bubble stats date range.',
      },
      400
    );
  }

  const subredditName = context.subredditName;
  const startTime = Date.parse(timeframe.startIso);
  const endTime = Date.parse(timeframe.endIso);
  const rangeDuration = Math.max(endTime - startTime, 1);

  try {
    const posts = await reddit
      .getNewPosts({
        subredditName,
        limit: 1000,
        pageSize: 100,
      })
      .all();

    const chartPosts: ChartPost[] = posts
      .filter((post) => post.id !== context.postId)
      .map((post) => toChartPost(post, startTime, rangeDuration))
      .filter((post): post is ChartPost => {
        if (!post) {
          return false;
        }

        const createdTime = Date.parse(post.createdAt);
        return createdTime >= startTime && createdTime <= endTime;
      })
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

    return c.json<ChartDataResponse>(
      {
        type: 'chart-data',
        subredditName,
        timeframe,
        generatedAt: new Date().toISOString(),
        sampledPostCount: posts.length,
        posts: chartPosts,
      },
      200
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load subreddit posts.';
    console.error(`Chart data error: ${message}`);

    return c.json<ErrorResponse>(
      {
        status: 'error',
        message,
      },
      500
    );
  }
});

const toChartPost = (
  post: Post,
  startTime: number,
  rangeDuration: number
): ChartPost | null => {
  const createdAt = normalizeCreatedAt(post.createdAt);
  if (!createdAt) {
    return null;
  }

  const createdTime = Date.parse(createdAt);

  return {
    id: post.id,
    title: post.title,
    authorName: post.authorName,
    comments: post.numberOfComments,
    score: post.score,
    createdAt,
    permalink: post.permalink,
    ageRatio: clamp((createdTime - startTime) / rangeDuration, 0, 1),
  };
};

const normalizeCreatedAt = (createdAt: Post['createdAt']): string | null => {
  if (createdAt instanceof Date) {
    return createdAt.toISOString();
  }

  if (typeof createdAt === 'string') {
    const date = new Date(createdAt);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  if (typeof createdAt === 'number') {
    const date = new Date(createdAt);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  return null;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);
