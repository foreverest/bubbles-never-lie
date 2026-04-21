import { context } from '@devvit/web/server';
import { Hono } from 'hono';
import type { MenuItemRequest, UiResponse } from '@devvit/web/shared';
import {
  createPostForm,
  defaultCreatePostFormValues,
  resolveCurrentTimeZone,
} from '../core/post-config';
import { canConfigurePostDataSource } from '../core/subreddits';
import { createLogger } from '../logging/logger';

export const menu = new Hono();
const timeZoneHeader = 'devvit-accept-timezone';
const logger = createLogger('menu:create-post');

menu.post('/create-post', async (c) => {
  await c.req.json<MenuItemRequest>();
  const currentTimeZone = resolveCurrentTimeZone(
    context.metadata[timeZoneHeader]?.values[0]
  );
  const defaults = defaultCreatePostFormValues();
  const formDefaults = {
    title: 'Subreddit Activity Charts',
    ...defaults,
  };
  const showDataSourceSubredditField = canConfigurePostDataSource(
    context.subredditName
  );
  logger.info('Opened create post form', {
    subredditName: context.subredditName,
    currentTimeZone,
    showDataSourceSubredditField,
  });

  return c.json<UiResponse>(
    {
      showForm: {
        name: 'createPostForm',
        form: createPostForm({
          showDataSourceSubredditField,
          currentTimeZone,
          defaultValues: formDefaults,
        }),
      },
    },
    200
  );
});
