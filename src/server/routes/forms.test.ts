import { reddit } from '@devvit/web/server';
import { expect, test, vi, beforeEach } from 'vitest';

import type { CreatePostFormValues } from '../core/post-config';
import { forms } from './forms';

vi.mock('@devvit/web/server', () => ({
  context: {
    subredditName: 'bubblesneverlie_dev',
  },
  reddit: {
    submitCustomPost: vi.fn(),
  },
}));

const submittedValues: CreatePostFormValues = {
  title: 'February report',
  startYear: ['2026'],
  startMonth: ['2'],
  startDay: ['30'],
  timeZone: ['UTC'],
  durationDays: ['3'],
  dataSourceSubredditName: 'r/Funny',
};

beforeEach(() => {
  vi.mocked(reddit.submitCustomPost).mockReset();
});

test('reopens create post form with submitted values when start date is invalid', async () => {
  const response = await forms.request('/create-post-submit', {
    method: 'POST',
    body: JSON.stringify(submittedValues),
    headers: {
      'Content-Type': 'application/json',
    },
  });
  const body: unknown = await response.json();
  const fields = readFormFields(body);
  const fieldNames = fields.flatMap((field) =>
    isRecord(field) && typeof field.name === 'string' ? [field.name] : []
  );

  expect(response.status).toBe(200);
  expect(reddit.submitCustomPost).not.toHaveBeenCalled();
  expect(body).toMatchObject({
    showToast: 'Select a valid start date. February 30, 2026 does not exist.',
    showForm: {
      name: 'createPostForm',
      data: submittedValues,
    },
  });
  expect(fields).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'title',
        defaultValue: 'February report',
      }),
      expect.objectContaining({
        name: 'startYear',
        defaultValue: ['2026'],
      }),
      expect.objectContaining({
        name: 'startMonth',
        defaultValue: ['2'],
      }),
      expect.objectContaining({
        name: 'startDay',
        defaultValue: ['30'],
      }),
      expect.objectContaining({
        name: 'timeZone',
        defaultValue: ['UTC'],
      }),
      expect.objectContaining({
        name: 'durationDays',
        defaultValue: ['3'],
      }),
      expect.objectContaining({
        name: 'dataSourceSubredditName',
        defaultValue: 'r/Funny',
      }),
    ])
  );
  expect(fieldNames).not.toContain('useTestDataSource');
});

const readFormFields = (body: unknown): unknown[] => {
  if (!isRecord(body)) {
    throw new Error('Expected response body.');
  }

  const showForm = body.showForm;
  if (!isRecord(showForm)) {
    throw new Error('Expected showForm response.');
  }

  const form = showForm.form;
  if (!isRecord(form)) {
    throw new Error('Expected form response.');
  }

  const fields = form.fields;
  if (!Array.isArray(fields)) {
    throw new Error('Expected form fields.');
  }

  return fields;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
