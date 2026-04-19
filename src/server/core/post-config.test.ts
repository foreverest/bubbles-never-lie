import { expect, test } from 'vitest';

import {
  createPostData,
  createPostForm,
  parseFormDateRange,
  readPostConfig,
  type CreatePostFormValues,
} from './post-config';

const formValues: CreatePostFormValues = {
  startYear: ['2026'],
  startMonth: ['1'],
  startDay: ['2'],
  timeZone: ['Asia/Tokyo'],
  durationDays: ['1'],
};

test('parses selected day from midnight in the selected timezone', () => {
  expect(parseFormDateRange(formValues)).toEqual({
    startIso: '2026-01-01T15:00:00.000Z',
    endIso: '2026-01-02T15:00:00.000Z',
  });
});

test('create post form omits hour and prioritizes timezone options', () => {
  const form = createPostForm({
    currentTimeZone: 'America/Los_Angeles',
  });
  const fieldNames = form.fields.flatMap((field) =>
    field.type === 'group' ? [] : [field.name]
  );
  const timeZoneField = form.fields.find(
    (field) => field.type !== 'group' && field.name === 'timeZone'
  );

  expect(fieldNames).not.toContain('startHour');
  expect(timeZoneField).toMatchObject({
    type: 'select',
    defaultValue: ['UTC'],
  });

  if (!timeZoneField || timeZoneField.type !== 'select') {
    throw new Error('Expected timezone select field.');
  }

  expect(timeZoneField.options[0]).toEqual({ label: 'UTC', value: 'UTC' });
  expect(timeZoneField.options[1]).toEqual({
    label: 'America/Los Angeles (your timezone)',
    value: 'America/Los_Angeles',
  });
  expect(
    timeZoneField.options.filter((option) => option.value === 'UTC')
  ).toHaveLength(1);
  expect(
    timeZoneField.options.filter(
      (option) => option.value === 'America/Los_Angeles'
    )
  ).toHaveLength(1);

  const remainingTimeZones = timeZoneField.options
    .slice(2)
    .map((option) => option.value);
  expect(remainingTimeZones).toEqual([...remainingTimeZones].sort());
});

test('timezone selector marks UTC as current when it is the current timezone', () => {
  const form = createPostForm({
    currentTimeZone: 'UTC',
    defaultValues: {
      startYear: ['2026'],
      startMonth: ['1'],
      startDay: ['2'],
      timeZone: ['UTC'],
      durationDays: ['1'],
    },
  });
  const timeZoneField = form.fields.find(
    (field) => field.type !== 'group' && field.name === 'timeZone'
  );

  if (!timeZoneField || timeZoneField.type !== 'select') {
    throw new Error('Expected timezone select field.');
  }

  expect(timeZoneField.options[0]).toEqual({
    label: 'UTC (your timezone)',
    value: 'UTC',
  });
  expect(
    timeZoneField.options.filter((option) => option.value === 'UTC')
  ).toHaveLength(1);
});

test('validates post config with nested date range', () => {
  const dateRange = parseFormDateRange(formValues);
  const postConfig = createPostData(dateRange);

  expect(postConfig).toEqual({
    type: 'post-config',
    dateRange,
  });
  expect(readPostConfig(postConfig)).toEqual({
    config: postConfig,
    start: new Date('2026-01-01T15:00:00.000Z'),
    end: new Date('2026-01-02T15:00:00.000Z'),
  });

  expect(readPostConfig({ type: postConfig.type })).toBeNull();
  expect(
    readPostConfig({
      ...postConfig,
      dateRange: { ...postConfig.dateRange, startIso: 'not-a-date' },
    })
  ).toBeNull();
  expect(
    readPostConfig({
      ...postConfig,
      dateRange: {
        ...postConfig.dateRange,
        startIso: '2026-01-03T00:00:00.000Z',
        endIso: '2026-01-02T00:00:00.000Z',
      },
    })
  ).toBeNull();
  expect(
    readPostConfig({
      ...postConfig,
      dataSourceSubredditName: 'unexpected',
    })
  ).toBeNull();
});
