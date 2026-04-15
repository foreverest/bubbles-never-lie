import { context } from '@devvit/web/server';
import { Hono } from 'hono';
import type {
  ChartResponseMetadata,
  CommentsChartDataResponse,
  ErrorResponse,
  PostsChartDataResponse,
  StatsDataResponse,
} from '../../shared/api';
import { readCommentCountForTimeframe, readCommentsForTimeframe } from '../core/comment-cache';
import { readPostCountForTimeframe, readPostsForTimeframe } from '../core/post-cache';
import { readCachedSubredditIconUrl } from '../core/subreddit-icons';
import { resolveChartDataSubredditName } from '../core/subreddits';
import type { ValidatedTimeframePostData } from '../core/timeframe';
import { readTimeframePostData } from '../core/timeframe';

export const api = new Hono();
const missingTimeframeMessage = 'This post is missing a bubble stats date range.';
const postsErrorMessage = 'Unable to load subreddit post chart data. Try again shortly.';
const commentsErrorMessage = 'Unable to load subreddit comment chart data. Try again shortly.';
const statsErrorMessage = 'Unable to load subreddit stats data. Try again shortly.';

api.get('/posts', async (c) => {
  const chartContext = readChartContext();

  if (!chartContext) {
    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: missingTimeframeMessage,
      },
      400
    );
  }

  try {
    const cachedPosts = await readPostsForTimeframe({
      subredditName: chartContext.subredditName,
      startTime: chartContext.startTime,
      endTime: chartContext.endTime,
      excludedPostId: chartContext.excludedPostId,
    });

    if (!cachedPosts.lastSuccessAt) {
      logCacheWarming('Post', cachedPosts.lastError);

      return c.json<ErrorResponse>(
        {
          status: 'error',
          message: 'The post cache is warming. Try again shortly.',
        },
        503
      );
    }

    return c.json<PostsChartDataResponse>(
      {
        ...(await createChartMetadata(chartContext)),
        type: 'posts-chart-data',
        posts: cachedPosts.posts,
      },
      200
    );
  } catch (error) {
    console.error(`Post chart data error: ${getErrorMessage(error, postsErrorMessage)}`);

    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: postsErrorMessage,
      },
      500
    );
  }
});

api.get('/comments', async (c) => {
  const chartContext = readChartContext();

  if (!chartContext) {
    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: missingTimeframeMessage,
      },
      400
    );
  }

  try {
    const cachedComments = await readCommentsForTimeframe({
      subredditName: chartContext.subredditName,
      startTime: chartContext.startTime,
      endTime: chartContext.endTime,
      excludedPostId: chartContext.excludedPostId,
    });

    return c.json<CommentsChartDataResponse>(
      {
        ...(await createChartMetadata(chartContext)),
        type: 'comments-chart-data',
        comments: cachedComments.comments,
      },
      200
    );
  } catch (error) {
    console.error(`Comment chart data error: ${getErrorMessage(error, commentsErrorMessage)}`);

    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: commentsErrorMessage,
      },
      500
    );
  }
});

api.get('/stats', async (c) => {
  const chartContext = readChartContext();

  if (!chartContext) {
    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: missingTimeframeMessage,
      },
      400
    );
  }

  try {
    const [posts, comments] = await Promise.all([
      readPostCountForTimeframe({
        subredditName: chartContext.subredditName,
        startTime: chartContext.startTime,
        endTime: chartContext.endTime,
        excludedPostId: chartContext.excludedPostId,
      }),
      readCommentCountForTimeframe({
        subredditName: chartContext.subredditName,
        startTime: chartContext.startTime,
        endTime: chartContext.endTime,
        excludedPostId: chartContext.excludedPostId,
      }),
    ]);

    if (!posts.lastSuccessAt) {
      logCacheWarming('Post', posts.lastError);

      return c.json<ErrorResponse>(
        {
          status: 'error',
          message: 'The post cache is warming. Try again shortly.',
        },
        503
      );
    }

    return c.json<StatsDataResponse>(
      {
        type: 'stats-data',
        postCount: posts.postCount,
        commentCount: comments.commentCount,
      },
      200
    );
  } catch (error) {
    console.error(`Stats data error: ${getErrorMessage(error, statsErrorMessage)}`);

    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: statsErrorMessage,
      },
      500
    );
  }
});

type ChartContext = {
  subredditName: string;
  timeframe: ValidatedTimeframePostData;
  startTime: number;
  endTime: number;
  excludedPostId: string | null;
};

const readChartContext = (): ChartContext | null => {
  const timeframe = readTimeframePostData(context.postData);

  if (!timeframe) {
    return null;
  }

  return {
    subredditName: resolveChartDataSubredditName(
      context.subredditName,
      timeframe.postData.dataSourceSubredditName
    ),
    timeframe,
    startTime: timeframe.start.getTime(),
    endTime: timeframe.end.getTime(),
    excludedPostId: context.postId ?? null,
  };
};

const createChartMetadata = async ({
  subredditName,
  timeframe,
}: ChartContext): Promise<ChartResponseMetadata> => ({
  subredditName,
  subredditIconUrl: await readCachedSubredditIconUrl(subredditName),
  timeframe: timeframe.postData,
  generatedAt: new Date().toISOString(),
});

const logCacheWarming = (cacheName: 'Post', lastError: string | null): void => {
  if (!lastError) {
    return;
  }

  console.warn(`${cacheName} cache is not warm. Last refresh error: ${lastError}`);
};

const getErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : String(error) || fallback;
