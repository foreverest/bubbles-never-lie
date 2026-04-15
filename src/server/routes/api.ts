import { context } from '@devvit/web/server';
import { Hono } from 'hono';
import type { ChartDataResponse, ErrorResponse } from '../../shared/api';
import { readCommentsForTimeframe } from '../core/comment-cache';
import { readPostsForTimeframe } from '../core/post-cache';
import { readCachedSubredditIconUrl } from '../core/subreddit-icons';
import { resolveChartDataSubredditName } from '../core/subreddits';
import { readTimeframePostData } from '../core/timeframe';

export const api = new Hono();
const chartDataErrorMessage = 'Unable to load subreddit chart data. Try again shortly.';

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
    const cachedPosts = await readPostsForTimeframe({
      subredditName,
      startTime,
      endTime,
      excludedPostId: context.postId ?? null,
    });

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

    const cachedComments = await readCommentsForTimeframe({
      subredditName,
      startTime,
      endTime,
      excludedPostId: context.postId ?? null,
    });

    if (!cachedComments.lastSuccessAt) {
      if (cachedComments.lastError) {
        console.warn(
          `Comment cache is not warm. Last refresh error: ${cachedComments.lastError}`
        );
      }

      return c.json<ErrorResponse>(
        {
          status: 'error',
          message: 'The comment cache is warming. Try again shortly.',
        },
        503
      );
    }

    const subredditIconUrl = await readCachedSubredditIconUrl(subredditName);

    return c.json<ChartDataResponse>(
      {
        type: 'chart-data',
        subredditName,
        subredditIconUrl,
        timeframe: timeframe.postData,
        generatedAt: new Date().toISOString(),
        sampledPostCount: cachedPosts.sampledPostCount,
        sampledCommentCount: cachedComments.sampledCommentCount,
        posts: cachedPosts.posts,
        comments: cachedComments.comments,
      },
      200
    );
  } catch (error) {
    console.error(`Chart data error: ${getErrorMessage(error)}`);

    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: chartDataErrorMessage,
      },
      500
    );
  }
});

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error) || chartDataErrorMessage;
