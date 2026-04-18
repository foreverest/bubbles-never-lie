import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { createBubbleStatsPost } from '../core/post';
import type { TimeframeFormValues } from '../core/timeframe';
import { createLogger } from '../logging/logger';

export const forms = new Hono();
const logger = createLogger('forms:create-chart');

forms.post('/create-chart-submit', async (c) => {
  try {
    const values = await c.req.json<TimeframeFormValues>();
    logger.info('Received create chart form submission', createFormLogMetadata(values));

    const post = await createBubbleStatsPost(values);
    logger.info('Created bubble stats post', {
      permalink: post.permalink,
    });

    return c.json<UiResponse>(
      {
        showToast: 'Bubble stats post created',
        navigateTo: `https://www.reddit.com${post.permalink}`,
      },
      200
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create post.';
    logger.error('Create bubble stats post failed', { error: message });

    return c.json<UiResponse>(
      {
        showToast: message,
      },
      400
    );
  }
});

const createFormLogMetadata = (values: unknown): Record<string, unknown> => {
  const data = isRecord(values) ? values : {};
  const title = data.title;

  return {
    titleLength: typeof title === 'string' ? title.length : 0,
    useTestDataSource: data.useTestDataSource === true,
    startYear: data.startYear,
    startMonth: data.startMonth,
    startDay: data.startDay,
    durationDays: data.durationDays,
    timeZone: data.timeZone,
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
