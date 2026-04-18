import { expect, test } from 'vitest';

import {
  createTimeframeForm,
  parseFormDateRange,
  readTimeframePostData,
  type TimeframeFormValues,
} from './timeframe';

const formValues: TimeframeFormValues = {
  startYear: ['2026'],
  startMonth: ['1'],
  startDay: ['2'],
  timeZone: ['Asia/Tokyo'],
  durationDays: ['1'],
};

test('parses selected day from midnight in the selected timezone', () => {
  expect(parseFormDateRange(formValues)).toEqual({
    startDate: '2026-01-02',
    endDate: '2026-01-02',
    startIso: '2026-01-01T15:00:00.000Z',
    endIso: '2026-01-02T14:59:59.999Z',
    timeZone: 'Asia/Tokyo',
    durationDays: 1,
  });
});

test('create timeframe form omits hour and prioritizes timezone options', () => {
  const form = createTimeframeForm({
    currentTimeZone: 'America/Los_Angeles',
  });
  const fieldNames = form.fields.flatMap((field) => (field.type === 'group' ? [] : [field.name]));
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
  expect(timeZoneField.options.filter((option) => option.value === 'UTC')).toHaveLength(1);
  expect(
    timeZoneField.options.filter((option) => option.value === 'America/Los_Angeles')
  ).toHaveLength(1);

  const remainingTimeZones = timeZoneField.options.slice(2).map((option) => option.value);
  expect(remainingTimeZones).toEqual([...remainingTimeZones].sort());
});

test('timezone selector marks UTC as current when it is the current timezone', () => {
  const form = createTimeframeForm({
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

  expect(timeZoneField.options[0]).toEqual({ label: 'UTC (your timezone)', value: 'UTC' });
  expect(timeZoneField.options.filter((option) => option.value === 'UTC')).toHaveLength(1);
});

test('validates day-based timeframe post data', () => {
  const range = parseFormDateRange(formValues);
  const postData = {
    type: 'bubble-stats-timeframe',
    ...range,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  const postDataWithoutTimeZone = {
    type: postData.type,
    startDate: postData.startDate,
    endDate: postData.endDate,
    startIso: postData.startIso,
    endIso: postData.endIso,
    createdAt: postData.createdAt,
    durationDays: postData.durationDays,
  };
  const postDataWithoutDurationDays = {
    type: postData.type,
    startDate: postData.startDate,
    endDate: postData.endDate,
    startIso: postData.startIso,
    endIso: postData.endIso,
    createdAt: postData.createdAt,
    timeZone: postData.timeZone,
  };

  expect(readTimeframePostData(postData)).toEqual({
    postData,
    start: new Date('2026-01-01T15:00:00.000Z'),
    end: new Date('2026-01-02T14:59:59.999Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  });

  expect(readTimeframePostData(postDataWithoutTimeZone)).toBeNull();
  expect(readTimeframePostData(postDataWithoutDurationDays)).toBeNull();
  expect(readTimeframePostData({ ...postData, startHour: 0 })).toBeNull();
  expect(readTimeframePostData({ ...postData, startIso: '2026-01-02T00:00:00.000Z' })).toBeNull();
});
