import { context } from '@devvit/web/server';
import { Hono } from 'hono';
import type { MenuItemRequest, UiResponse } from '@devvit/web/shared';
import {
  createTimeframeForm,
  defaultTimeframeFormValues,
  resolveCurrentTimeZone,
} from '../core/timeframe';
import { canUseTestDataSource } from '../core/subreddits';
import { createLogger } from '../logging/logger';

export const menu = new Hono();
const timeZoneHeader = 'devvit-accept-timezone';
const logger = createLogger('menu:create-chart');

menu.post('/create-chart', async (c) => {
  await c.req.json<MenuItemRequest>();
  const currentTimeZone = resolveCurrentTimeZone(
    context.metadata[timeZoneHeader]?.values[0]
  );
  const defaults = defaultTimeframeFormValues();
  const formDefaults = {
    title: 'Bubbles Never Lie: subreddit activity',
    ...defaults,
  };
  const allowTestDataSource = canUseTestDataSource(context.subredditName);
  logger.info('Opened create chart form', {
    subredditName: context.subredditName,
    currentTimeZone,
    allowTestDataSource,
  });

  return c.json<UiResponse>(
    {
      showForm: {
        name: 'timeframeForm',
        form: createTimeframeForm({
          allowTestDataSource,
          currentTimeZone,
          defaultValues: formDefaults,
        }),
      },
    },
    200
  );
});
