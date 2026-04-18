import { context } from '@devvit/web/server';
import { Hono } from 'hono';
import { refreshContributorCache } from '../core/contributor-cache';
import {
  processCommentCacheQueue,
  refreshCommentCache,
} from '../core/comment-cache';
import { refreshPostCache } from '../core/post-cache';
import { refreshCurrentSubredditIconCache } from '../core/subreddit-icons';
import { getCacheRefreshSubredditNames } from '../core/subreddits';
import { createLogger } from '../logging/logger';

export const cache = new Hono();
const cachePostsLogger = createLogger('cache:posts');
const cacheCommentsLogger = createLogger('cache:comments');
const cacheCommentQueueLogger = createLogger('cache:comments-queue');
const cacheContributorsLogger = createLogger('cache:contributors');
const cacheSubredditIconsLogger = createLogger('cache:subreddit-icons');
const cacheAppLogger = createLogger('cache:app');
const COMMENT_QUEUE_WORKER_ROUTE_DURATION_MS = 25 * 1000;

cache.post('/refresh-post-cache', async (c) => {
  cachePostsLogger.info(
    'Received post cache refresh request',
    createContextLogMetadata()
  );

  try {
    const results = await refreshPostCachesForCurrentSubreddits();
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
    const results = await refreshCommentCachesForCurrentSubreddits();

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
    const results = await processCommentCacheQueuesForCurrentSubreddits();

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
    const results = await refreshContributorCachesForCurrentSubreddits();
    cacheContributorsLogger.info(
      'Completed contributor cache refresh request',
      {
        ...createContextLogMetadata(),
        subredditCount: results.length,
        results: results.map(({ subredditName, result }) => ({
          subredditName,
          candidateContributorCount: result.candidateContributorCount,
          refreshedContributorCount: result.refreshedContributorCount,
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

cache.post('/refresh-subreddit-icons', async (c) => {
  cacheSubredditIconsLogger.info(
    'Received subreddit icon refresh request',
    createContextLogMetadata()
  );

  try {
    const result = await refreshCurrentSubredditIconCache(
      context.subredditName
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
    const result = await refreshAppCachesForCurrentSubreddits();
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

export const refreshAppCachesForCurrentSubreddits =
  async (): Promise<AppCacheRefreshResult> => {
    const postCaches = await refreshPostCachesForCurrentSubreddits();
    const commentCaches = await refreshCommentCachesForCurrentSubreddits();
    const contributorCaches =
      await refreshContributorCachesForCurrentSubreddits();
    const subredditIcon = await refreshCurrentSubredditIconCache(
      context.subredditName
    );

    return {
      postCaches,
      commentCaches,
      contributorCaches,
      subredditIcon,
    };
  };

const refreshPostCachesForCurrentSubreddits = async () => {
  const subredditNames = getCacheRefreshSubredditNames(context.subredditName);
  cachePostsLogger.info('Refreshing post cache for subreddits', {
    ...createContextLogMetadata(),
    subredditNames,
  });
  const results: Array<{
    subredditName: string;
    result: Awaited<ReturnType<typeof refreshPostCache>>;
  }> = [];
  const failures: string[] = [];

  for (const subredditName of subredditNames) {
    try {
      cachePostsLogger.info('Refreshing post cache for subreddit', {
        subredditName,
      });
      const result = await refreshPostCache(subredditName);
      results.push({ subredditName, result });
      cachePostsLogger.info('Refreshed post cache for subreddit', {
        subredditName,
        fetchedPostCount: result.fetchedPostCount,
        cachedPostCount: result.cachedPostCount,
      });
    } catch (error) {
      const message = getErrorMessage(error);
      cachePostsLogger.warn('Post cache refresh failed for subreddit', {
        subredditName,
        error: message,
      });
      failures.push(`r/${subredditName}: ${message}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Unable to refresh post cache for ${failures.join(', ')}`);
  }

  return results;
};

const refreshCommentCachesForCurrentSubreddits = async () => {
  const subredditNames = getCacheRefreshSubredditNames(context.subredditName);
  cacheCommentsLogger.info('Refreshing comment cache for subreddits', {
    ...createContextLogMetadata(),
    subredditNames,
  });
  const results: Array<{
    subredditName: string;
    result: Awaited<ReturnType<typeof refreshCommentCache>>;
  }> = [];
  const failures: string[] = [];

  for (const subredditName of subredditNames) {
    try {
      cacheCommentsLogger.info('Refreshing comment cache for subreddit', {
        subredditName,
      });
      const result = await refreshCommentCache(subredditName);
      results.push({ subredditName, result });
      cacheCommentsLogger.info('Refreshed comment cache for subreddit', {
        subredditName,
        parentPostCount: result.parentPostCount,
        enqueuedPostCount: result.enqueuedPostCount,
      });
    } catch (error) {
      const message = getErrorMessage(error);
      cacheCommentsLogger.warn('Comment cache refresh failed for subreddit', {
        subredditName,
        error: message,
      });
      failures.push(`r/${subredditName}: ${message}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `Unable to refresh comment cache for ${failures.join(', ')}`
    );
  }

  return results;
};

const processCommentCacheQueuesForCurrentSubreddits = async () => {
  const subredditNames = getCacheRefreshSubredditNames(context.subredditName);
  const startedAt = Date.now();
  cacheCommentQueueLogger.info(
    'Processing comment cache queues for subreddits',
    {
      ...createContextLogMetadata(),
      subredditNames,
    }
  );
  const results: Array<{
    subredditName: string;
    result: Awaited<ReturnType<typeof processCommentCacheQueue>>;
  }> = [];
  const failures: string[] = [];

  for (const subredditName of subredditNames) {
    const elapsedMs = Date.now() - startedAt;
    const remainingDurationMs = Math.max(
      0,
      COMMENT_QUEUE_WORKER_ROUTE_DURATION_MS - elapsedMs
    );

    if (remainingDurationMs <= 0) {
      cacheCommentQueueLogger.info(
        'Skipping comment cache queue because route budget is exhausted',
        {
          subredditName,
        }
      );
      break;
    }

    try {
      cacheCommentQueueLogger.info(
        'Processing comment cache queue for subreddit',
        {
          subredditName,
          remainingDurationMs,
        }
      );
      const result = await processCommentCacheQueue({
        subredditName,
        maxDurationMs: remainingDurationMs,
      });
      results.push({ subredditName, result });
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
    } catch (error) {
      const message = getErrorMessage(error);
      cacheCommentQueueLogger.warn(
        'Comment cache queue processing failed for subreddit',
        {
          subredditName,
          error: message,
        }
      );
      failures.push(`r/${subredditName}: ${message}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `Unable to process comment cache queue for ${failures.join(', ')}`
    );
  }

  return results;
};

const refreshContributorCachesForCurrentSubreddits = async () => {
  const subredditNames = getCacheRefreshSubredditNames(context.subredditName);
  cacheContributorsLogger.info('Refreshing contributor cache for subreddits', {
    ...createContextLogMetadata(),
    subredditNames,
  });
  const results: Array<{
    subredditName: string;
    result: Awaited<ReturnType<typeof refreshContributorCache>>;
  }> = [];
  const failures: string[] = [];

  for (const subredditName of subredditNames) {
    try {
      cacheContributorsLogger.info(
        'Refreshing contributor cache for subreddit',
        {
          subredditName,
        }
      );
      const result = await refreshContributorCache(subredditName);
      results.push({ subredditName, result });
      cacheContributorsLogger.info(
        'Refreshed contributor cache for subreddit',
        {
          subredditName,
          candidateContributorCount: result.candidateContributorCount,
          refreshedContributorCount: result.refreshedContributorCount,
        }
      );
    } catch (error) {
      const message = getErrorMessage(error);
      cacheContributorsLogger.warn(
        'Contributor cache refresh failed for subreddit',
        {
          subredditName,
          error: message,
        }
      );
      failures.push(`r/${subredditName}: ${message}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `Unable to refresh contributor cache for ${failures.join(', ')}`
    );
  }

  return results;
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
