import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { createBubbleStatsPost } from '../core/post';
import type { TimeframeFormValues } from '../core/timeframe';

export const forms = new Hono();

forms.post('/create-chart-submit', async (c) => {
  try {
    const values = await c.req.json<TimeframeFormValues>();
    const post = await createBubbleStatsPost(values);

    return c.json<UiResponse>(
      {
        showToast: 'Bubble stats post created',
        navigateTo: `https://www.reddit.com${post.permalink}`,
      },
      200
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create post.';
    console.error(`Create bubble stats post error: ${message}`);

    return c.json<UiResponse>(
      {
        showToast: message,
      },
      400
    );
  }
});
