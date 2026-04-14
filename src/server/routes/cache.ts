import { context } from '@devvit/web/server';
import { Hono } from 'hono';
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
    const [postCaches, subredditIcon] = await Promise.all([
      refreshPostCachesForCurrentSubreddits(),
      refreshCurrentSubredditIconCache(context.subredditName),
    ]);

    return c.json(
      {
        status: 'ok',
        postCaches,
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
  const settledResults = await Promise.allSettled(
    subredditNames.map(async (subredditName) => ({
      subredditName,
      result: await refreshPostCache(subredditName),
    }))
  );
  const results = settledResults.flatMap((settledResult) =>
    settledResult.status === 'fulfilled' ? [settledResult.value] : []
  );
  const failures = getRefreshFailures(settledResults, subredditNames);

  if (failures.length > 0) {
    throw new Error(`Unable to refresh post cache for ${failures.join(', ')}`);
  }

  return results;
};

const getRefreshFailures = (
  settledResults: PromiseSettledResult<unknown>[],
  subredditNames: string[]
): string[] =>
  settledResults.flatMap((settledResult, index) =>
    settledResult.status === 'rejected'
      ? [`r/${subredditNames[index] ?? 'unknown'}: ${getErrorMessage(settledResult.reason)}`]
      : []
  );

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error) || 'Unable to refresh post cache.';
