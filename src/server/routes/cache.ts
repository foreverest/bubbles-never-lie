import { context } from '@devvit/web/server';
import { Hono, type HonoRequest } from 'hono';
import { refreshContributorCache } from '../core/contributor-cache';
import {
  refreshCommentCache,
  refreshCommentCacheChunk,
  type CommentCacheChunkRefreshData,
} from '../core/comment-cache';
import { refreshPostCache } from '../core/post-cache';
import { refreshCurrentSubredditIconCache } from '../core/subreddit-icons';
import { getCacheRefreshSubredditNames } from '../core/subreddits';
import { createLogger } from '../logging/logger';

export const cache = new Hono();
const cachePostsLogger = createLogger('cache:posts');
const cacheCommentsLogger = createLogger('cache:comments');
const cacheCommentChunkLogger = createLogger('cache:comments-chunk');
const cacheContributorsLogger = createLogger('cache:contributors');
const cacheSubredditIconsLogger = createLogger('cache:subreddit-icons');
const cacheAppLogger = createLogger('cache:app');

cache.post('/refresh-post-cache', async (c) => {
  cachePostsLogger.info('Received post cache refresh request', createContextLogMetadata());

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
  cacheCommentsLogger.info('Received comment cache refresh request', createContextLogMetadata());

  try {
    const results = await refreshCommentCachesForCurrentSubreddits();

    cacheCommentsLogger.info('Completed comment cache refresh request', {
      ...createContextLogMetadata(),
      subredditCount: results.length,
      results: results.map(({ subredditName, result }) => ({
        subredditName,
        parentPostCount: result.parentPostCount,
        scheduledPostCount: result.scheduledPostCount,
        scheduledJobCount: result.scheduledJobCount,
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

cache.post('/refresh-comment-cache-chunk', async (c) => {
  cacheCommentChunkLogger.info(
    'Received comment cache chunk refresh request',
    createContextLogMetadata()
  );

  try {
    const data = await readCommentCacheChunkRefreshData(c.req);
    cacheCommentChunkLogger.info('Starting comment cache chunk refresh request', {
      ...createContextLogMetadata(),
      subredditName: data.subredditName,
      postCount: data.postIds.length,
    });
    const result = await refreshCommentCacheChunk(data);

    cacheCommentChunkLogger.info('Completed comment cache chunk refresh request', {
      ...createContextLogMetadata(),
      subredditName: data.subredditName,
      refreshedPostCount: result.refreshedPostCount,
      failedPostCount: result.failedPostCount,
      fetchedCommentCount: result.fetchedCommentCount,
      cachedCommentCount: result.cachedCommentCount,
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
    cacheCommentChunkLogger.error('Comment cache chunk refresh request failed', {
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

cache.post('/refresh-contributor-cache', async (c) => {
  cacheContributorsLogger.info(
    'Received contributor cache refresh request',
    createContextLogMetadata()
  );

  try {
    const results = await refreshContributorCachesForCurrentSubreddits();
    cacheContributorsLogger.info('Completed contributor cache refresh request', {
      ...createContextLogMetadata(),
      subredditCount: results.length,
      results: results.map(({ subredditName, result }) => ({
        subredditName,
        candidateContributorCount: result.candidateContributorCount,
        refreshedContributorCount: result.refreshedContributorCount,
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
    const result = await refreshCurrentSubredditIconCache(context.subredditName);
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
  cacheAppLogger.info('Received app cache refresh request', createContextLogMetadata());

  try {
    const postCaches = await refreshPostCachesForCurrentSubreddits();
    const commentCaches = await refreshCommentCachesForCurrentSubreddits();
    const contributorCaches = await refreshContributorCachesForCurrentSubreddits();
    const subredditIcon = await refreshCurrentSubredditIconCache(context.subredditName);
    cacheAppLogger.info('Completed app cache refresh request', {
      ...createContextLogMetadata(),
      postCacheSubredditCount: postCaches.length,
      commentCacheSubredditCount: commentCaches.length,
      contributorCacheSubredditCount: contributorCaches.length,
      subredditIconName: subredditIcon.subredditName,
      hasSubredditIconUrl: subredditIcon.subredditIconUrl !== null,
    });

    return c.json(
      {
        status: 'ok',
        postCaches,
        commentCaches,
        contributorCaches,
        subredditIcon,
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
      cachePostsLogger.info('Refreshing post cache for subreddit', { subredditName });
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
      cacheCommentsLogger.info('Refreshing comment cache for subreddit', { subredditName });
      const result = await refreshCommentCache(subredditName);
      results.push({ subredditName, result });
      cacheCommentsLogger.info('Refreshed comment cache for subreddit', {
        subredditName,
        parentPostCount: result.parentPostCount,
        scheduledPostCount: result.scheduledPostCount,
        scheduledJobCount: result.scheduledJobCount,
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
    throw new Error(`Unable to refresh comment cache for ${failures.join(', ')}`);
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
      cacheContributorsLogger.info('Refreshing contributor cache for subreddit', {
        subredditName,
      });
      const result = await refreshContributorCache(subredditName);
      results.push({ subredditName, result });
      cacheContributorsLogger.info('Refreshed contributor cache for subreddit', {
        subredditName,
        candidateContributorCount: result.candidateContributorCount,
        refreshedContributorCount: result.refreshedContributorCount,
      });
    } catch (error) {
      const message = getErrorMessage(error);
      cacheContributorsLogger.warn('Contributor cache refresh failed for subreddit', {
        subredditName,
        error: message,
      });
      failures.push(`r/${subredditName}: ${message}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Unable to refresh contributor cache for ${failures.join(', ')}`);
  }

  return results;
};

const readCommentCacheChunkRefreshData = async (
  req: HonoRequest
): Promise<CommentCacheChunkRefreshData> => {
  const body = await req.json().catch(() => null);
  const data = isRecord(body) && 'data' in body ? body.data : body;

  if (!isCommentCacheChunkRefreshData(data)) {
    cacheCommentChunkLogger.warn('Invalid comment cache chunk refresh payload', {
      ...createContextLogMetadata(),
    });
    throw new Error('Invalid comment cache chunk refresh payload.');
  }

  return data;
};

const isCommentCacheChunkRefreshData = (value: unknown): value is CommentCacheChunkRefreshData =>
  isRecord(value) &&
  typeof value.subredditName === 'string' &&
  Array.isArray(value.postIds) &&
  value.postIds.every(isPostId);

const isPostId = (value: unknown): value is `t3_${string}` =>
  typeof value === 'string' && value.startsWith('t3_') && value.length > 3;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const createContextLogMetadata = (): Record<string, unknown> => ({
  currentSubredditName: context.subredditName,
});

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error) || 'Unable to refresh post cache.';
