import { Hono } from 'hono';
import type {
  OnAppInstallRequest,
  OnCommentCreateRequest,
  OnPostCreateRequest,
  TriggerResponse,
} from '@devvit/web/shared';
import { context } from '@devvit/web/server';
import {
  createAppCacheRefreshLogMetadata,
  refreshAppCachesForCurrentSubreddits,
} from './cache';
import {
  cacheCommentCreateEvent,
  cachePostCreateEvent,
  type EventCacheResult,
} from '../core/event-cache';
import { createLogger } from '../logging/logger';

export const triggers = new Hono();
const appInstallLogger = createLogger('triggers:on-app-install');
const postCreateLogger = createLogger('triggers:on-post-create');
const commentCreateLogger = createLogger('triggers:on-comment-create');

triggers.post('/on-app-install', async (c) => {
  const input = await c.req.json<OnAppInstallRequest>();
  appInstallLogger.info('Received app install trigger', {
    currentSubredditName: context.subredditName,
    triggerType: input.type,
  });

  try {
    const result = await refreshAppCachesForCurrentSubreddits();
    appInstallLogger.info('Completed app install cache refresh', {
      currentSubredditName: context.subredditName,
      triggerType: input.type,
      ...createAppCacheRefreshLogMetadata(result),
    });

    return c.json<TriggerResponse>(
      {
        status: 'success',
        message: `Bubbles Never Lie caches refreshed for r/${context.subredditName} (trigger: ${input.type})`,
      },
      200
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    appInstallLogger.error('App install cache refresh failed', {
      currentSubredditName: context.subredditName,
      triggerType: input.type,
      error: message,
    });

    return c.json<TriggerResponse>(
      {
        status: 'error',
        message: 'Failed to refresh Bubbles Never Lie caches',
      },
      400
    );
  }
});

triggers.post('/on-post-create', async (c) => {
  const input = await c.req.json<OnPostCreateRequest>();
  postCreateLogger.info('Received post create trigger', {
    currentSubredditName: context.subredditName,
    triggerType: input.type,
    eventSubredditName: input.subreddit?.name ?? null,
    postId: input.post?.id ?? null,
  });

  try {
    const result = await cachePostCreateEvent(input);

    logEventCacheResult(
      postCreateLogger,
      'Completed post create event cache update',
      result
    );

    return c.json<TriggerResponse>(
      {
        status: 'success',
        message:
          result.status === 'cached'
            ? `Post create event cached for r/${result.subredditName}`
            : `Post create event skipped for r/${result.subredditName}`,
      },
      200
    );
  } catch (error) {
    postCreateLogger.error('Post create event cache update failed', {
      currentSubredditName: context.subredditName,
      triggerType: input.type,
      eventSubredditName: input.subreddit?.name ?? null,
      postId: input.post?.id ?? null,
      error: getErrorMessage(error),
    });

    return c.json<TriggerResponse>(
      {
        status: 'error',
        message: 'Failed to cache post create event',
      },
      500
    );
  }
});

triggers.post('/on-comment-create', async (c) => {
  const input = await c.req.json<OnCommentCreateRequest>();
  commentCreateLogger.info('Received comment create trigger', {
    currentSubredditName: context.subredditName,
    triggerType: input.type,
    eventSubredditName: input.subreddit?.name ?? null,
    postId: input.post?.id ?? input.comment?.postId ?? null,
    commentId: input.comment?.id ?? null,
  });

  try {
    const result = await cacheCommentCreateEvent(input);

    logEventCacheResult(
      commentCreateLogger,
      'Completed comment create event cache update',
      result
    );

    return c.json<TriggerResponse>(
      {
        status: 'success',
        message:
          result.status === 'cached'
            ? `Comment create event cached for r/${result.subredditName}`
            : `Comment create event skipped for r/${result.subredditName}`,
      },
      200
    );
  } catch (error) {
    commentCreateLogger.error('Comment create event cache update failed', {
      currentSubredditName: context.subredditName,
      triggerType: input.type,
      eventSubredditName: input.subreddit?.name ?? null,
      postId: input.post?.id ?? input.comment?.postId ?? null,
      commentId: input.comment?.id ?? null,
      error: getErrorMessage(error),
    });

    return c.json<TriggerResponse>(
      {
        status: 'error',
        message: 'Failed to cache comment create event',
      },
      500
    );
  }
});

const logEventCacheResult = (
  logger: ReturnType<typeof createLogger>,
  message: string,
  result: EventCacheResult
): void => {
  const metadata = {
    currentSubredditName: context.subredditName,
    subredditName: result.subredditName,
    status: result.status,
    cachedPostCount: result.cachedPostCount,
    cachedCommentCount: result.cachedCommentCount,
    refreshedContributorCount: result.refreshedContributorCount,
    generatedAt: result.generatedAt,
    skippedReason: result.skippedReason ?? null,
  };

  if (result.status === 'skipped') {
    logger.warn(message, metadata);
    return;
  }

  logger.info(message, metadata);
};

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
