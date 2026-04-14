import { context } from '@devvit/web/server';
import { Hono } from 'hono';
import { refreshPostCache } from '../core/post-cache';

export const cache = new Hono();

cache.post('/refresh-post-cache', async (c) => {
  try {
    const result = await refreshPostCache(context.subredditName);

    return c.json(
      {
        status: 'ok',
        result,
      },
      200
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to refresh post cache.';
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
