import { Hono } from 'hono';
import type { OnAppInstallRequest, TriggerResponse } from '@devvit/web/shared';
import { context } from '@devvit/web/server';
import {
  createAppCacheRefreshLogMetadata,
  refreshAppCachesForCurrentSubreddits,
} from './cache';
import { createLogger } from '../logging/logger';

export const triggers = new Hono();
const logger = createLogger('triggers:on-app-install');

triggers.post('/on-app-install', async (c) => {
  const input = await c.req.json<OnAppInstallRequest>();
  logger.info('Received app install trigger', {
    currentSubredditName: context.subredditName,
    triggerType: input.type,
  });

  try {
    const result = await refreshAppCachesForCurrentSubreddits();
    logger.info('Completed app install cache refresh', {
      currentSubredditName: context.subredditName,
      triggerType: input.type,
      ...createAppCacheRefreshLogMetadata(result),
    });

    return c.json<TriggerResponse>(
      {
        status: 'success',
        message: `Bubble Stats caches refreshed for r/${context.subredditName} (trigger: ${input.type})`,
      },
      200
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('App install cache refresh failed', {
      currentSubredditName: context.subredditName,
      triggerType: input.type,
      error: message,
    });

    return c.json<TriggerResponse>(
      {
        status: 'error',
        message: 'Failed to refresh Bubble Stats caches',
      },
      400
    );
  }
});
