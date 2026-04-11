import { Hono } from 'hono';
import type { MenuItemRequest, UiResponse } from '@devvit/web/shared';
import { createTimeframeForm, defaultDateRange } from '../core/timeframe';

export const menu = new Hono();

menu.post('/create-chart', async (c) => {
  await c.req.json<MenuItemRequest>();
  const defaults = defaultDateRange();

  return c.json<UiResponse>(
    {
      showForm: {
        name: 'timeframeForm',
        form: createTimeframeForm(),
        data: {
          title: 'Subreddit bubble stats',
          startDate: defaults.startDate,
          endDate: defaults.endDate,
        },
      },
    },
    200
  );
});
