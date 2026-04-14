import { context } from '@devvit/web/server';
import { Hono } from 'hono';
import type { ChartDataResponse, ErrorResponse } from '../../shared/api';
import { readPostsForTimeframe } from '../core/post-cache';
import { readCachedSubredditIconUrl } from '../core/subreddit-icons';
import { resolveChartDataSubredditName } from '../core/subreddits';
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

  const subredditName = resolveChartDataSubredditName(
    context.subredditName,
    timeframe.postData.dataSourceSubredditName
  );
  const startTime = timeframe.start.getTime();
  const endTime = timeframe.end.getTime();

  try {
    const [cachedPosts, subredditIconUrl] = await Promise.all([
      readPostsForTimeframe({
        subredditName,
        startTime,
        endTime,
        excludedPostId: context.postId ?? null,
      }),
      readCachedSubredditIconUrl(subredditName),
    ]);

    if (!cachedPosts.lastSuccessAt) {
      if (cachedPosts.lastError) {
        console.warn(`Post cache is not warm. Last refresh error: ${cachedPosts.lastError}`);
      }

      return c.json<ErrorResponse>(
        {
          status: 'error',
          message: 'The post cache is warming. Try again shortly.',
        },
        503
      );
    }

    return c.json<ChartDataResponse>(
      {
        type: 'chart-data',
        subredditName,
        subredditIconUrl,
        timeframe: timeframe.postData,
        generatedAt: new Date().toISOString(),
        sampledPostCount: cachedPosts.sampledPostCount,
        posts: cachedPosts.posts,
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
