import { context } from '@devvit/web/server';
import { Hono } from 'hono';
import type { MenuItemRequest, UiResponse } from '@devvit/web/shared';
import { createTimeframeForm, defaultDateRange } from '../core/timeframe';
import { canUseTestDataSource } from '../core/subreddits';

export const menu = new Hono();

menu.post('/create-chart', async (c) => {
  await c.req.json<MenuItemRequest>();
  const defaults = defaultDateRange();
  const allowTestDataSource = canUseTestDataSource(context.subredditName);

  return c.json<UiResponse>(
    {
      showForm: {
        name: 'timeframeForm',
        form: createTimeframeForm({ allowTestDataSource }),
        data: {
          title: 'Subreddit bubble stats',
          startDate: defaults.startDate,
          endDate: defaults.endDate,
          ...(allowTestDataSource ? { useTestDataSource: false } : {}),
        },
      },
    },
    200
  );
});
