import { cache as devvitCache, context } from '@devvit/web/server';
import { Hono } from 'hono';
import type {
  ContributorsChartDataResponse,
  ChartResponseMetadata,
  CommentsChartDataResponse,
  ErrorResponse,
  PostsChartDataResponse,
  StatsDataResponse,
} from '../../shared/api';
import {
  readContributorCountForTimeframe,
  readContributorsForTimeframe,
} from '../core/contributor-chart';
import { readCommentCountForTimeframe, readCommentsForTimeframe } from '../core/comment-cache';
import { readPostCountForTimeframe, readPostsForTimeframe } from '../core/post-cache';
import { readCachedSubredditIconUrl } from '../core/subreddit-icons';
import { resolveChartDataSubredditName } from '../core/subreddits';
import type { ValidatedTimeframePostData } from '../core/timeframe';
import { readTimeframePostData } from '../core/timeframe';
import { createChartDataCacheKey, type ChartDataCacheEndpoint } from './chart-response-cache';

export const api = new Hono();
const chartDataCacheTtlSeconds = 30;
const missingTimeframeMessage = 'This post is missing a bubble stats date range.';
const postsErrorMessage = 'Unable to load subreddit post chart data. Try again shortly.';
const commentsErrorMessage = 'Unable to load subreddit comment chart data. Try again shortly.';
const contributorsErrorMessage =
  'Unable to load subreddit contributor chart data. Try again shortly.';
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
    const response = await readCachedChartDataResponse('posts', chartContext, async () => {
      const cachedPosts = await readPostsForTimeframe({
        subredditName: chartContext.subredditName,
        startTime: chartContext.startTime,
        endTime: chartContext.endTime,
      });

      return {
        ...(await createChartMetadata(chartContext)),
        type: 'posts-chart-data',
        posts: cachedPosts.posts,
      };
    });

    return c.json<PostsChartDataResponse>(response, 200);
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
    const response = await readCachedChartDataResponse('comments', chartContext, async () => {
      const cachedComments = await readCommentsForTimeframe({
        subredditName: chartContext.subredditName,
        startTime: chartContext.startTime,
        endTime: chartContext.endTime,
      });

      return {
        ...(await createChartMetadata(chartContext)),
        type: 'comments-chart-data',
        comments: cachedComments.comments,
      };
    });

    return c.json<CommentsChartDataResponse>(response, 200);
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

api.get('/contributors', async (c) => {
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
    const response = await readCachedChartDataResponse('contributors', chartContext, async () => {
      const cachedContributors = await readContributorsForTimeframe({
        subredditName: chartContext.subredditName,
        startTime: chartContext.startTime,
        endTime: chartContext.endTime,
      });

      return {
        ...(await createChartMetadata(chartContext)),
        type: 'contributors-chart-data',
        contributors: cachedContributors.contributors,
      };
    });

    return c.json<ContributorsChartDataResponse>(response, 200);
  } catch (error) {
    console.error(
      `Contributor chart data error: ${getErrorMessage(error, contributorsErrorMessage)}`
    );

    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: contributorsErrorMessage,
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
    const response = await readCachedChartDataResponse('stats', chartContext, async () => {
      const [posts, comments, contributors] = await Promise.all([
        readPostCountForTimeframe({
          subredditName: chartContext.subredditName,
          startTime: chartContext.startTime,
          endTime: chartContext.endTime,
        }),
        readCommentCountForTimeframe({
          subredditName: chartContext.subredditName,
          startTime: chartContext.startTime,
          endTime: chartContext.endTime,
        }),
        readContributorCountForTimeframe({
          subredditName: chartContext.subredditName,
          startTime: chartContext.startTime,
          endTime: chartContext.endTime,
        }),
      ]);

      return {
        type: 'stats-data',
        postCount: posts.postCount,
        commentCount: comments.commentCount,
        contributorCount: contributors.contributorCount,
      };
    });

    return c.json<StatsDataResponse>(response, 200);
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
};

type CacheableChartDataResponse =
  | PostsChartDataResponse
  | CommentsChartDataResponse
  | ContributorsChartDataResponse
  | StatsDataResponse;
type CacheableJsonValue =
  | boolean
  | null
  | number
  | string
  | CacheableJsonValue[]
  | { [key: string]: CacheableJsonValue };

const readCachedChartDataResponse = async <Response extends CacheableChartDataResponse>(
  endpoint: ChartDataCacheEndpoint,
  chartContext: ChartContext,
  createResponse: () => Promise<Response>,
  ttl = chartDataCacheTtlSeconds
): Promise<Response> =>
  (await devvitCache(async () => (await createResponse()) as unknown as CacheableJsonValue, {
    key: createChartDataCacheKey({
      endpoint,
      postId: context.postId,
      subredditName: chartContext.subredditName,
      startTime: chartContext.startTime,
      endTime: chartContext.endTime,
    }),
    ttl,
  })) as unknown as Response;

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

const getErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : String(error) || fallback;
