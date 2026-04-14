import { context } from '@devvit/web/server';
import { Hono } from 'hono';
import { refreshPostCache } from '../core/post-cache';
import { getCacheRefreshSubredditNames } from '../core/subreddits';

export const cache = new Hono();

cache.post('/refresh-post-cache', async (c) => {
  try {
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
    const failures = settledResults.flatMap((settledResult, index) =>
      settledResult.status === 'rejected'
        ? [`r/${subredditNames[index] ?? 'unknown'}: ${getErrorMessage(settledResult.reason)}`]
        : []
    );

    if (failures.length > 0) {
      throw new Error(`Unable to refresh post cache for ${failures.join(', ')}`);
    }

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

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error) || 'Unable to refresh post cache.';
