import { cache as devvitCache, context } from '@devvit/web/server';
import { Hono } from 'hono';
import type {
  ContributorsChartDataResponse,
  ChartResponseMetadata,
  CommentsChartDataResponse,
  ErrorResponse,
  InsightsDataResponse,
  PostsChartDataResponse,
} from '../../shared/api';
import {
  readContributorCountInDateRange,
  readContributorsInDateRange,
} from '../core/contributor-chart';
import {
  readCommentCountInDateRange,
  readCommentsInDateRange,
} from '../core/comment-cache';
import {
  readPostCountInDateRange,
  readPostsInDateRange,
} from '../core/post-cache';
import { readCachedSubredditIconUrl } from '../core/subreddit-icons';
import { resolveChartDataSubredditName } from '../core/subreddits';
import type { ValidatedPostConfig } from '../core/post-config';
import { readPostConfig } from '../core/post-config';
import { createLogger, type ComponentLogger } from '../logging/logger';
import {
  createChartDataCacheKey,
  type ChartDataCacheEndpoint,
} from './chart-response-cache';

export const api = new Hono();
const postsApiLogger = createLogger('posts-api');
const commentsApiLogger = createLogger('comments-api');
const contributorsApiLogger = createLogger('contributors-api');
const insightsApiLogger = createLogger('insights-api');
const chartDataCacheTtlSeconds = 30;
const missingDateRangeMessage =
  'This post is missing a Bubbles Never Lie date range.';
const postsErrorMessage =
  'Unable to load subreddit post chart data. Try again shortly.';
const commentsErrorMessage =
  'Unable to load subreddit comment chart data. Try again shortly.';
const contributorsErrorMessage =
  'Unable to load subreddit contributor chart data. Try again shortly.';
const insightsErrorMessage =
  'Unable to load subreddit insights data. Try again shortly.';

api.get('/posts', async (c) => {
  const logger = postsApiLogger;
  const chartContext = readChartContext();
  logger.info('Received posts chart data request', createRequestLogMetadata());

  if (!chartContext) {
    logger.warn(
      'Missing date range for posts chart data request',
      createRequestLogMetadata()
    );

    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: missingDateRangeMessage,
      },
      400
    );
  }

  try {
    const response = await readCachedChartDataResponse(
      'posts',
      chartContext,
      logger,
      async () => {
        const cachedPosts = await readPostsInDateRange({
          subredditName: chartContext.subredditName,
          startTime: chartContext.startTime,
          endTime: chartContext.endTime,
        });

        return {
          ...(await createChartMetadata(chartContext)),
          type: 'posts-chart-data',
          posts: cachedPosts.posts,
        };
      }
    );

    logger.info('Loaded posts chart data', {
      ...createChartLogMetadata(chartContext),
      postCount: response.posts.length,
    });

    return c.json<PostsChartDataResponse>(response, 200);
  } catch (error) {
    const message = getErrorMessage(error, postsErrorMessage);
    logger.error('Post chart data request failed', {
      ...createChartLogMetadata(chartContext),
      error: message,
    });

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
  const logger = commentsApiLogger;
  const chartContext = readChartContext();
  logger.info(
    'Received comments chart data request',
    createRequestLogMetadata()
  );

  if (!chartContext) {
    logger.warn(
      'Missing date range for comments chart data request',
      createRequestLogMetadata()
    );

    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: missingDateRangeMessage,
      },
      400
    );
  }

  try {
    const response = await readCachedChartDataResponse(
      'comments',
      chartContext,
      logger,
      async () => {
        const cachedComments = await readCommentsInDateRange({
          subredditName: chartContext.subredditName,
          startTime: chartContext.startTime,
          endTime: chartContext.endTime,
        });

        return {
          ...(await createChartMetadata(chartContext)),
          type: 'comments-chart-data',
          comments: cachedComments.comments,
        };
      }
    );

    logger.info('Loaded comments chart data', {
      ...createChartLogMetadata(chartContext),
      commentCount: response.comments.length,
    });

    return c.json<CommentsChartDataResponse>(response, 200);
  } catch (error) {
    const message = getErrorMessage(error, commentsErrorMessage);
    logger.error('Comment chart data request failed', {
      ...createChartLogMetadata(chartContext),
      error: message,
    });

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
  const logger = contributorsApiLogger;
  const chartContext = readChartContext();
  logger.info(
    'Received contributors chart data request',
    createRequestLogMetadata()
  );

  if (!chartContext) {
    logger.warn(
      'Missing date range for contributors chart data request',
      createRequestLogMetadata()
    );

    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: missingDateRangeMessage,
      },
      400
    );
  }

  try {
    const response = await readCachedChartDataResponse(
      'contributors',
      chartContext,
      logger,
      async () => {
        const cachedContributors = await readContributorsInDateRange({
          subredditName: chartContext.subredditName,
          startTime: chartContext.startTime,
          endTime: chartContext.endTime,
        });

        return {
          ...(await createChartMetadata(chartContext)),
          type: 'contributors-chart-data',
          contributors: cachedContributors.contributors,
        };
      }
    );

    logger.info('Loaded contributors chart data', {
      ...createChartLogMetadata(chartContext),
      contributorCount: response.contributors.length,
    });

    return c.json<ContributorsChartDataResponse>(response, 200);
  } catch (error) {
    const message = getErrorMessage(error, contributorsErrorMessage);
    logger.error('Contributor chart data request failed', {
      ...createChartLogMetadata(chartContext),
      error: message,
    });

    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: contributorsErrorMessage,
      },
      500
    );
  }
});

api.get('/insights', async (c) => {
  const logger = insightsApiLogger;
  const chartContext = readChartContext();
  logger.info('Received insights data request', createRequestLogMetadata());

  if (!chartContext) {
    logger.warn(
      'Missing date range for insights data request',
      createRequestLogMetadata()
    );

    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: missingDateRangeMessage,
      },
      400
    );
  }

  try {
    const response = await readCachedChartDataResponse(
      'insights',
      chartContext,
      logger,
      async () => {
        const [posts, comments, contributors] = await Promise.all([
          readPostCountInDateRange({
            subredditName: chartContext.subredditName,
            startTime: chartContext.startTime,
            endTime: chartContext.endTime,
          }),
          readCommentCountInDateRange({
            subredditName: chartContext.subredditName,
            startTime: chartContext.startTime,
            endTime: chartContext.endTime,
          }),
          readContributorCountInDateRange({
            subredditName: chartContext.subredditName,
            startTime: chartContext.startTime,
            endTime: chartContext.endTime,
          }),
        ]);

        return {
          type: 'insights-data',
          postCount: posts.postCount,
          commentCount: comments.commentCount,
          contributorCount: contributors.contributorCount,
        };
      }
    );

    logger.info('Loaded insights data', {
      ...createChartLogMetadata(chartContext),
      postCount: response.postCount,
      commentCount: response.commentCount,
      contributorCount: response.contributorCount,
    });

    return c.json<InsightsDataResponse>(response, 200);
  } catch (error) {
    const message = getErrorMessage(error, insightsErrorMessage);
    logger.error('Insights data request failed', {
      ...createChartLogMetadata(chartContext),
      error: message,
    });

    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: insightsErrorMessage,
      },
      500
    );
  }
});

type ChartContext = {
  subredditName: string;
  postConfig: ValidatedPostConfig;
  startTime: number;
  endTime: number;
};

type CacheableChartDataResponse =
  | PostsChartDataResponse
  | CommentsChartDataResponse
  | ContributorsChartDataResponse
  | InsightsDataResponse;
type CacheableJsonValue =
  | boolean
  | null
  | number
  | string
  | CacheableJsonValue[]
  | { [key: string]: CacheableJsonValue };

const readCachedChartDataResponse = async <
  Response extends CacheableChartDataResponse,
>(
  endpoint: ChartDataCacheEndpoint,
  chartContext: ChartContext,
  logger: ComponentLogger,
  createResponse: () => Promise<Response>,
  ttl = chartDataCacheTtlSeconds
): Promise<Response> => {
  const cacheKey = createChartDataCacheKey({
    endpoint,
    postId: context.postId,
    subredditName: chartContext.subredditName,
    startTime: chartContext.startTime,
    endTime: chartContext.endTime,
  });

  return (await devvitCache(
    async () => {
      logger.info('Chart data cache miss; creating response', {
        endpoint,
        cacheKey,
        ttl,
      });

      return (await createResponse()) as unknown as CacheableJsonValue;
    },
    {
      key: cacheKey,
      ttl,
    }
  )) as unknown as Response;
};

const readChartContext = (): ChartContext | null => {
  const postConfig = readPostConfig(context.postData);

  if (!postConfig) {
    return null;
  }

  return {
    subredditName: resolveChartDataSubredditName(
      context.subredditName,
      postConfig.config.dataSourceSubredditName
    ),
    postConfig,
    startTime: postConfig.start.getTime(),
    endTime: postConfig.end.getTime(),
  };
};

const createChartMetadata = async ({
  subredditName,
  postConfig,
}: ChartContext): Promise<ChartResponseMetadata> => ({
  subredditName,
  subredditIconUrl: await readCachedSubredditIconUrl(subredditName),
  dateRange: postConfig.config.dateRange,
  generatedAt: new Date().toISOString(),
});

const createRequestLogMetadata = (): Record<string, unknown> => ({
  currentSubredditName: context.subredditName,
  postId: context.postId ?? null,
});

const createChartLogMetadata = ({
  subredditName,
  startTime,
  endTime,
}: ChartContext): Record<string, unknown> => ({
  ...createRequestLogMetadata(),
  subredditName,
  startTime: new Date(startTime).toISOString(),
  endTime: new Date(endTime).toISOString(),
});

const getErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : String(error) || fallback;
