import { Hono } from 'hono';
import { context } from '@devvit/web/server';
import type { JsonObject, UiResponse } from '@devvit/web/shared';
import { createPost } from '../core/post';
import {
  createPostForm,
  isPostFormValidationError,
  resolveCurrentTimeZone,
  type CreatePostFormValues,
} from '../core/post-config';
import { canUseTestDataSource } from '../core/subreddits';
import { createLogger } from '../logging/logger';

export const forms = new Hono();
const logger = createLogger('forms:create-post');

forms.post('/create-post-submit', async (c) => {
  let values: CreatePostFormValues | undefined;

  try {
    values = await c.req.json<CreatePostFormValues>();
    logger.info(
      'Received create post form submission',
      createFormLogMetadata(values)
    );

    const post = await createPost(values);
    logger.info('Created Bubbles Never Lie post', {
      permalink: post.permalink,
    });

    return c.json<UiResponse>(
      {
        showToast: 'Bubbles Never Lie: Post created',
        navigateTo: `https://www.reddit.com${post.permalink}`,
      },
      200
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to create post.';

    if (values && isPostFormValidationError(error)) {
      logger.warn('Create Bubbles Never Lie post validation failed', {
        ...createFormLogMetadata(values),
        error: message,
      });

      return c.json<UiResponse>(
        {
          showToast: message,
          showForm: {
            name: 'createPostForm',
            form: createPostForm({
              allowTestDataSource: canUseTestDataSource(context.subredditName),
              currentTimeZone: resolveCurrentTimeZone(
                readSingleFormValue(values.timeZone)
              ),
              defaultValues: values,
            }),
            data: createFormData(values),
          },
        },
        200
      );
    }

    logger.error('Create Bubbles Never Lie post failed', { error: message });

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

const createFormData = (values: CreatePostFormValues): JsonObject => {
  const data: JsonObject = {};

  copyFormValue(data, 'title', values.title);
  copyFormValue(data, 'startYear', values.startYear);
  copyFormValue(data, 'startMonth', values.startMonth);
  copyFormValue(data, 'startDay', values.startDay);
  copyFormValue(data, 'timeZone', values.timeZone);
  copyFormValue(data, 'durationDays', values.durationDays);

  if (values.useTestDataSource !== undefined) {
    data.useTestDataSource = values.useTestDataSource;
  }

  return data;
};

const copyFormValue = (
  data: JsonObject,
  key: string,
  value: string | string[] | undefined
): void => {
  if (value !== undefined) {
    data[key] = value;
  }
};

const readSingleFormValue = (
  value: string | string[] | undefined
): string | undefined => {
  const selectedValue = Array.isArray(value) ? value[0] : value;
  return typeof selectedValue === 'string' ? selectedValue : undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
