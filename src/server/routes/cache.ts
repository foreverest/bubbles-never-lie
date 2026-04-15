import { context } from '@devvit/web/server';
import { Hono } from 'hono';
import { refreshCommentCache } from '../core/comment-cache';
import { refreshPostCache } from '../core/post-cache';
import { refreshCurrentSubredditIconCache } from '../core/subreddit-icons';
import { getCacheRefreshSubredditNames } from '../core/subreddits';

export const cache = new Hono();

cache.post('/refresh-post-cache', async (c) => {
  try {
    const results = await refreshPostCachesForCurrentSubreddits();

    return c.json(
      {
        status: 'ok',
        results,
      },
      200
    );
  } catch (error) {
    const message = getErrorMessage(error);
    console.error(`Post cache refresh error: ${message}`);

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
  console.log('Received request to refresh comment cache.');
  try {
    const results = await refreshCommentCachesForCurrentSubreddits();

    console.log('Comment cache refresh results:', results);
    return c.json(
      {
        status: 'ok',
        results,
      },
      200
    );
  } catch (error) {
    const message = getErrorMessage(error);
    console.error(`Comment cache refresh error: ${message}`);

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
  try {
    const result = await refreshCurrentSubredditIconCache(context.subredditName);

    return c.json(
      {
        status: 'ok',
        result,
      },
      200
    );
  } catch (error) {
    const message = getErrorMessage(error);
    console.error(`Subreddit icon refresh error: ${message}`);

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
  try {
    const postCaches = await refreshPostCachesForCurrentSubreddits();
    const commentCaches = await refreshCommentCachesForCurrentSubreddits();
    const subredditIcon = await refreshCurrentSubredditIconCache(context.subredditName);

    return c.json(
      {
        status: 'ok',
        postCaches,
        commentCaches,
        subredditIcon,
      },
      200
    );
  } catch (error) {
    const message = getErrorMessage(error);
    console.error(`App cache refresh error: ${message}`);

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
  const results: Array<{
    subredditName: string;
    result: Awaited<ReturnType<typeof refreshPostCache>>;
  }> = [];
  const failures: string[] = [];

  for (const subredditName of subredditNames) {
    try {
      results.push({
        subredditName,
        result: await refreshPostCache(subredditName),
      });
    } catch (error) {
      failures.push(`r/${subredditName}: ${getErrorMessage(error)}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Unable to refresh post cache for ${failures.join(', ')}`);
  }

  return results;
};

const refreshCommentCachesForCurrentSubreddits = async () => {
  const subredditNames = getCacheRefreshSubredditNames(context.subredditName);
  console.log('Refreshing comment cache for subreddits:', subredditNames);
  const results: Array<{
    subredditName: string;
    result: Awaited<ReturnType<typeof refreshCommentCache>>;
  }> = [];
  const failures: string[] = [];

  for (const subredditName of subredditNames) {
    try {
      results.push({
        subredditName,
        result: await refreshCommentCache(subredditName),
      });
    } catch (error) {
      failures.push(`r/${subredditName}: ${getErrorMessage(error)}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Unable to refresh comment cache for ${failures.join(', ')}`);
  }

  return results;
};

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error) || 'Unable to refresh post cache.';
