import { context } from '@devvit/web/server';
import { Hono } from 'hono';
import {
  processContributorCacheQueue,
  refreshContributorCache,
} from '../core/contributor-cache';
import {
  processCommentCacheQueue,
  refreshCommentCache,
} from '../core/comment-cache';
import { refreshPostCache } from '../core/post-cache';
import { refreshCurrentSubredditIconCache } from '../core/subreddit-icons';
import { resolveActiveRefreshSubredditName } from '../core/subreddits';
import { createLogger } from '../logging/logger';

export const cache = new Hono();
const cachePostsLogger = createLogger('cache:posts');
const cacheCommentsLogger = createLogger('cache:comments');
const cacheCommentQueueLogger = createLogger('cache:comments-queue');
const cacheContributorsLogger = createLogger('cache:contributors');
const cacheContributorQueueLogger = createLogger('cache:contributors-queue');
const cacheSubredditIconsLogger = createLogger('cache:subreddit-icons');
const cacheAppLogger = createLogger('cache:app');
const CACHE_QUEUE_WORKER_ROUTE_DURATION_MS = 25 * 1000;

cache.post('/refresh-post-cache', async (c) => {
  cachePostsLogger.info(
    'Received post cache refresh request',
    createContextLogMetadata()
  );

  try {
    const results = await refreshPostCachesForActiveSubreddit();
    cachePostsLogger.info('Completed post cache refresh request', {
      ...createContextLogMetadata(),
      subredditCount: results.length,
      results: results.map(({ subredditName, result }) => ({
        subredditName,
        fetchedPostCount: result.fetchedPostCount,
        cachedPostCount: result.cachedPostCount,
      })),
    });

    return c.json(
      {
        status: 'ok',
        results,
      },
      200
    );
  } catch (error) {
    const message = getErrorMessage(error);
    cachePostsLogger.error('Post cache refresh request failed', {
      ...createContextLogMetadata(),
      error: message,
    });

    return c.json(
      {
        status: 'error',
        message,
      },
      500
    );
  }
});

cache.post('/refresh-comment-cache', async (c) => {
  cacheCommentsLogger.info(
    'Received comment cache refresh request',
    createContextLogMetadata()
  );

  try {
    const results = await refreshCommentCachesForActiveSubreddit();

    cacheCommentsLogger.info('Completed comment cache refresh request', {
      ...createContextLogMetadata(),
      subredditCount: results.length,
      results: results.map(({ subredditName, result }) => ({
        subredditName,
        parentPostCount: result.parentPostCount,
        enqueuedPostCount: result.enqueuedPostCount,
      })),
    });
    return c.json(
      {
        status: 'ok',
        results,
      },
      200
    );
  } catch (error) {
    const message = getErrorMessage(error);
    cacheCommentsLogger.error('Comment cache refresh request failed', {
      ...createContextLogMetadata(),
      error: message,
    });

    return c.json(
      {
        status: 'error',
        message,
      },
      500
    );
  }
});

cache.post('/refresh-comment-cache-queue', async (c) => {
  cacheCommentQueueLogger.info(
    'Received comment cache queue refresh request',
    createContextLogMetadata()
  );

  try {
    const results = await processCommentCacheQueuesForActiveSubreddit();

    cacheCommentQueueLogger.info(
      'Completed comment cache queue refresh request',
      {
        ...createContextLogMetadata(),
        subredditCount: results.length,
        results: results.map(({ subredditName, result }) => ({
          subredditName,
          processedPostCount: result.processedPostCount,
          processedCommentParentCount: result.processedCommentParentCount,
          failedItemCount: result.failedItemCount,
          invalidQueueItemCount: result.invalidQueueItemCount,
          fetchedCommentCount: result.fetchedCommentCount,
          cachedCommentCount: result.cachedCommentCount,
          enqueuedCommentParentCount: result.enqueuedCommentParentCount,
          queueEmpty: result.queueEmpty,
        })),
      }
    );
    return c.json(
      {
        status: 'ok',
        results,
      },
      200
    );
  } catch (error) {
    const message = getErrorMessage(error);
    cacheCommentQueueLogger.error(
      'Comment cache queue refresh request failed',
      {
        ...createContextLogMetadata(),
        error: message,
      }
    );

    return c.json(
      {
        status: 'error',
        message,
      },
      500
    );
  }
});

cache.post('/refresh-contributor-cache', async (c) => {
  cacheContributorsLogger.info(
    'Received contributor cache refresh request',
    createContextLogMetadata()
  );

  try {
    const results = await refreshContributorCachesForActiveSubreddit();
    cacheContributorsLogger.info(
      'Completed contributor cache refresh request',
      {
        ...createContextLogMetadata(),
        subredditCount: results.length,
        results: results.map(({ subredditName, result }) => ({
          subredditName,
          candidateContributorCount: result.candidateContributorCount,
          enqueuedContributorCount: result.enqueuedContributorCount,
        })),
      }
    );

    return c.json(
      {
        status: 'ok',
        results,
      },
      200
    );
  } catch (error) {
    const message = getErrorMessage(error);
    cacheContributorsLogger.error('Contributor cache refresh request failed', {
      ...createContextLogMetadata(),
      error: message,
    });

    return c.json(
      {
        status: 'error',
        message,
      },
      500
    );
  }
});

cache.post('/refresh-contributor-cache-queue', async (c) => {
  cacheContributorQueueLogger.info(
    'Received contributor cache queue refresh request',
    createContextLogMetadata()
  );

  try {
    const results = await processContributorCacheQueuesForActiveSubreddit();
    cacheContributorQueueLogger.info(
      'Completed contributor cache queue refresh request',
      {
        ...createContextLogMetadata(),
        subredditCount: results.length,
        results: results.map(({ subredditName, result }) => ({
          subredditName,
          processedContributorCount: result.processedContributorCount,
          refreshedContributorCount: result.refreshedContributorCount,
          failedItemCount: result.failedItemCount,
          invalidQueueItemCount: result.invalidQueueItemCount,
          queueEmpty: result.queueEmpty,
        })),
      }
    );

    return c.json(
      {
        status: 'ok',
        results,
      },
      200
    );
  } catch (error) {
    const message = getErrorMessage(error);
    cacheContributorQueueLogger.error(
      'Contributor cache queue refresh request failed',
      {
        ...createContextLogMetadata(),
        error: message,
      }
    );

    return c.json(
      {
        status: 'error',
        message,
      },
      500
    );
  }
});

cache.post('/refresh-subreddit-icons', async (c) => {
  cacheSubredditIconsLogger.info(
    'Received subreddit icon refresh request',
    createContextLogMetadata()
  );

  try {
    const result = await refreshCurrentSubredditIconCache(
      resolveActiveRefreshSubredditName(context.subredditName)
    );
    cacheSubredditIconsLogger.info('Completed subreddit icon refresh request', {
      ...createContextLogMetadata(),
      subredditName: result.subredditName,
      hasSubredditIconUrl: result.subredditIconUrl !== null,
    });

    return c.json(
      {
        status: 'ok',
        result,
      },
      200
    );
  } catch (error) {
    const message = getErrorMessage(error);
    cacheSubredditIconsLogger.error('Subreddit icon refresh request failed', {
      ...createContextLogMetadata(),
      error: message,
    });

    return c.json(
      {
        status: 'error',
        message,
      },
      500
    );
  }
});

cache.post('/refresh-app-cache', async (c) => {
  cacheAppLogger.info(
    'Received app cache refresh request',
    createContextLogMetadata()
  );

  try {
    const result = await refreshAppCachesForActiveSubreddit();
    cacheAppLogger.info('Completed app cache refresh request', {
      ...createContextLogMetadata(),
      ...createAppCacheRefreshLogMetadata(result),
    });

    return c.json(
      {
        status: 'ok',
        ...result,
      },
      200
    );
  } catch (error) {
    const message = getErrorMessage(error);
    cacheAppLogger.error('App cache refresh request failed', {
      ...createContextLogMetadata(),
      error: message,
    });

    return c.json(
      {
        status: 'error',
        message,
      },
      500
    );
  }
});

export type AppCacheRefreshResult = {
  postCaches: Array<{
    subredditName: string;
    result: Awaited<ReturnType<typeof refreshPostCache>>;
  }>;
  commentCaches: Array<{
    subredditName: string;
    result: Awaited<ReturnType<typeof refreshCommentCache>>;
  }>;
  contributorCaches: Array<{
    subredditName: string;
    result: Awaited<ReturnType<typeof refreshContributorCache>>;
  }>;
  subredditIcon: Awaited<ReturnType<typeof refreshCurrentSubredditIconCache>>;
};

export const refreshAppCachesForActiveSubreddit =
  async (): Promise<AppCacheRefreshResult> => {
    const postCaches = await refreshPostCachesForActiveSubreddit();
    const commentCaches = await refreshCommentCachesForActiveSubreddit();
    const contributorCaches =
      await refreshContributorCachesForActiveSubreddit();
    const subredditIcon = await refreshCurrentSubredditIconCache(
      resolveActiveRefreshSubredditName(context.subredditName)
    );

    return {
      postCaches,
      commentCaches,
      contributorCaches,
      subredditIcon,
    };
  };

const refreshPostCachesForActiveSubreddit = async () => {
  const subredditName = resolveActiveRefreshSubredditName(
    context.subredditName
  );
  cachePostsLogger.info('Refreshing post cache for subreddit', {
    ...createContextLogMetadata(),
    subredditName,
  });

  try {
    const result = await refreshPostCache(subredditName);
    cachePostsLogger.info('Refreshed post cache for subreddit', {
      subredditName,
      fetchedPostCount: result.fetchedPostCount,
      cachedPostCount: result.cachedPostCount,
    });

    return [{ subredditName, result }];
  } catch (error) {
    const message = getErrorMessage(error);
    cachePostsLogger.warn('Post cache refresh failed for subreddit', {
      subredditName,
      error: message,
    });
    throw new Error(
      `Unable to refresh post cache for r/${subredditName}: ${message}`
    );
  }
};

const refreshCommentCachesForActiveSubreddit = async () => {
  const subredditName = resolveActiveRefreshSubredditName(
    context.subredditName
  );
  cacheCommentsLogger.info('Refreshing comment cache for subreddit', {
    ...createContextLogMetadata(),
    subredditName,
  });

  try {
    const result = await refreshCommentCache(subredditName);
    cacheCommentsLogger.info('Refreshed comment cache for subreddit', {
      subredditName,
      parentPostCount: result.parentPostCount,
      enqueuedPostCount: result.enqueuedPostCount,
    });

    return [{ subredditName, result }];
  } catch (error) {
    const message = getErrorMessage(error);
    cacheCommentsLogger.warn('Comment cache refresh failed for subreddit', {
      subredditName,
      error: message,
    });
    throw new Error(
      `Unable to refresh comment cache for r/${subredditName}: ${message}`
    );
  }
};

const processCommentCacheQueuesForActiveSubreddit = async () => {
  const subredditName = resolveActiveRefreshSubredditName(
    context.subredditName
  );
  cacheCommentQueueLogger.info('Processing comment cache queue for subreddit', {
    ...createContextLogMetadata(),
    subredditName,
  });

  try {
    const result = await processCommentCacheQueue({
      subredditName,
      maxDurationMs: CACHE_QUEUE_WORKER_ROUTE_DURATION_MS,
    });
    cacheCommentQueueLogger.info(
      'Processed comment cache queue for subreddit',
      {
        subredditName,
        processedPostCount: result.processedPostCount,
        processedCommentParentCount: result.processedCommentParentCount,
        failedItemCount: result.failedItemCount,
        invalidQueueItemCount: result.invalidQueueItemCount,
        fetchedCommentCount: result.fetchedCommentCount,
        cachedCommentCount: result.cachedCommentCount,
        enqueuedCommentParentCount: result.enqueuedCommentParentCount,
        queueEmpty: result.queueEmpty,
      }
    );

    return [{ subredditName, result }];
  } catch (error) {
    const message = getErrorMessage(error);
    cacheCommentQueueLogger.warn(
      'Comment cache queue processing failed for subreddit',
      {
        subredditName,
        error: message,
      }
    );
    throw new Error(
      `Unable to process comment cache queue for r/${subredditName}: ${message}`
    );
  }
};

const refreshContributorCachesForActiveSubreddit = async () => {
  const subredditName = resolveActiveRefreshSubredditName(
    context.subredditName
  );
  cacheContributorsLogger.info(
    'Seeding contributor cache refresh queue for subreddit',
    {
      ...createContextLogMetadata(),
      subredditName,
    }
  );

  try {
    const result = await refreshContributorCache(subredditName);
    cacheContributorsLogger.info(
      'Seeded contributor cache refresh queue for subreddit',
      {
        subredditName,
        candidateContributorCount: result.candidateContributorCount,
        enqueuedContributorCount: result.enqueuedContributorCount,
      }
    );

    return [{ subredditName, result }];
  } catch (error) {
    const message = getErrorMessage(error);
    cacheContributorsLogger.warn(
      'Contributor cache refresh queue seed failed for subreddit',
      {
        subredditName,
        error: message,
      }
    );
    throw new Error(
      `Unable to seed contributor cache refresh queue for r/${subredditName}: ${message}`
    );
  }
};

const processContributorCacheQueuesForActiveSubreddit = async () => {
  const subredditName = resolveActiveRefreshSubredditName(
    context.subredditName
  );
  cacheContributorQueueLogger.info(
    'Processing contributor cache queue for subreddit',
    {
      ...createContextLogMetadata(),
      subredditName,
    }
  );

  try {
    const result = await processContributorCacheQueue({
      subredditName,
      maxDurationMs: CACHE_QUEUE_WORKER_ROUTE_DURATION_MS,
    });
    cacheContributorQueueLogger.info(
      'Processed contributor cache queue for subreddit',
      {
        subredditName,
        processedContributorCount: result.processedContributorCount,
        refreshedContributorCount: result.refreshedContributorCount,
        failedItemCount: result.failedItemCount,
        invalidQueueItemCount: result.invalidQueueItemCount,
        queueEmpty: result.queueEmpty,
      }
    );

    return [{ subredditName, result }];
  } catch (error) {
    const message = getErrorMessage(error);
    cacheContributorQueueLogger.warn(
      'Contributor cache queue processing failed for subreddit',
      {
        subredditName,
        error: message,
      }
    );
    throw new Error(
      `Unable to process contributor cache queue for r/${subredditName}: ${message}`
    );
  }
};

const createContextLogMetadata = (): Record<string, unknown> => ({
  currentSubredditName: context.subredditName,
});

export const createAppCacheRefreshLogMetadata = ({
  postCaches,
  commentCaches,
  contributorCaches,
  subredditIcon,
}: AppCacheRefreshResult): Record<string, unknown> => ({
  postCacheSubredditCount: postCaches.length,
  commentCacheSubredditCount: commentCaches.length,
  contributorCacheSubredditCount: contributorCaches.length,
  subredditIconName: subredditIcon.subredditName,
  hasSubredditIconUrl: subredditIcon.subredditIconUrl !== null,
});

const getErrorMessage = (error: unknown): string =>
  error instanceof Error
    ? error.message
    : String(error) || 'Unable to refresh post cache.';
