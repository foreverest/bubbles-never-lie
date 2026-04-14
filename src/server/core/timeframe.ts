import type { Form, JsonObject } from '@devvit/web/shared';
import type { TimeframePostData } from '../../shared/api';
import { TEST_DATA_SOURCE_SUBREDDIT_NAME } from './subreddits';

const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

export type DateRange = {
  startDate: string;
  endDate: string;
  startIso: string;
  endIso: string;
};

export type TimeframeFormValues = {
  startDate?: string;
  endDate?: string;
  title?: string;
  useTestDataSource?: boolean;
};

export type TimeframeFormOptions = {
  allowTestDataSource?: boolean;
};

export type ValidatedTimeframePostData = {
  postData: TimeframePostData;
  start: Date;
  end: Date;
  createdAt: Date;
};

export const defaultDateRange = (): Pick<DateRange, 'startDate' | 'endDate'> => {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 7);

  return {
    startDate: toDateInputValue(start),
    endDate: toDateInputValue(end),
  };
};

export const createTimeframeForm = (options: TimeframeFormOptions = {}): Form => {
  const fields: Form['fields'] = [
    {
      type: 'string',
      name: 'title',
      label: 'Post title',
      placeholder: 'Subreddit bubble stats',
    },
    {
      type: 'string',
      name: 'startDate',
      label: 'Start date',
      required: true,
      placeholder: 'YYYY-MM-DD',
    },
    {
      type: 'string',
      name: 'endDate',
      label: 'End date',
      required: true,
      placeholder: 'YYYY-MM-DD',
    },
  ];

  if (options.allowTestDataSource) {
    fields.push({
      type: 'boolean',
      name: 'useTestDataSource',
      label: `Use r/${TEST_DATA_SOURCE_SUBREDDIT_NAME} as data source`,
      defaultValue: false,
    });
  }

  return {
    title: 'Create bubble stats post',
    description:
      'Use YYYY-MM-DD dates. The chart samples the newest subreddit posts and filters them to that range.',
    acceptLabel: 'Create post',
    cancelLabel: 'Cancel',
    fields,
  };
};

export const parseFormDateRange = (values: TimeframeFormValues): DateRange => {
  const startDate = normalizeDateInput(values.startDate);
  const endDate = normalizeDateInput(values.endDate);

  const start = parseDateOnly(startDate, 'startDate');
  const end = parseDateOnly(endDate, 'endDate');

  if (start.getTime() > end.getTime()) {
    throw new Error('Start date must be on or before end date.');
  }

  return {
    startDate,
    endDate,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
};

export const createPostData = (
  range: DateRange,
  options: { useTestDataSource?: boolean } = {}
): TimeframePostData => {
  const postData: TimeframePostData = {
    type: 'bubble-stats-timeframe',
    ...range,
    createdAt: new Date().toISOString(),
  };

  if (options.useTestDataSource) {
    postData.dataSourceSubredditName = TEST_DATA_SOURCE_SUBREDDIT_NAME;
  }

  return postData;
};

export const readTimeframePostData = (
  postDataValue: JsonObject | undefined
): ValidatedTimeframePostData | null => {
  if (!postDataValue || postDataValue.type !== 'bubble-stats-timeframe') {
    return null;
  }

  const data = postDataValue as Partial<TimeframePostData>;
  if (
    typeof data.startDate !== 'string' ||
    typeof data.endDate !== 'string' ||
    typeof data.startIso !== 'string' ||
    typeof data.endIso !== 'string' ||
    typeof data.createdAt !== 'string'
  ) {
    return null;
  }

  if (
    data.dataSourceSubredditName !== undefined &&
    data.dataSourceSubredditName !== TEST_DATA_SOURCE_SUBREDDIT_NAME
  ) {
    return null;
  }

  const start = tryParseDateOnly(data.startDate, 'startDate');
  const end = tryParseDateOnly(data.endDate, 'endDate');
  const startIso = tryParseIsoDate(data.startIso);
  const endIso = tryParseIsoDate(data.endIso);
  const createdAt = tryParseIsoDate(data.createdAt);

  if (
    !start ||
    !end ||
    !startIso ||
    !endIso ||
    !createdAt ||
    start.getTime() > end.getTime() ||
    start.getTime() !== startIso.getTime() ||
    end.getTime() !== endIso.getTime()
  ) {
    return null;
  }

  const validatedPostData: TimeframePostData = {
    type: 'bubble-stats-timeframe',
    startDate: data.startDate,
    endDate: data.endDate,
    startIso: data.startIso,
    endIso: data.endIso,
    createdAt: data.createdAt,
  };

  if (data.dataSourceSubredditName === TEST_DATA_SOURCE_SUBREDDIT_NAME) {
    validatedPostData.dataSourceSubredditName = data.dataSourceSubredditName;
  }

  return {
    postData: validatedPostData,
    start,
    end,
    createdAt,
  };
};

export const normalizeTitle = (value: string | undefined): string => {
  const title = typeof value === 'string' ? value.trim() : '';
  return title || 'Subreddit bubble stats';
};

const normalizeDateInput = (value: string | undefined): string => {
  const normalized = typeof value === 'string' ? value.trim() : '';

  if (!dateOnlyPattern.test(normalized)) {
    throw new Error('Use YYYY-MM-DD for both dates.');
  }

  return normalized;
};

const parseDateOnly = (value: string, fieldName: string): Date => {
  const [yearText, monthText, dayText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = fieldName === 'endDate' ? 23 : 0;
  const minute = fieldName === 'endDate' ? 59 : 0;
  const second = fieldName === 'endDate' ? 59 : 0;
  const millisecond = fieldName === 'endDate' ? 999 : 0;
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Invalid ${fieldName}.`);
  }

  return date;
};

const tryParseDateOnly = (value: string, fieldName: string): Date | null => {
  if (!dateOnlyPattern.test(value)) {
    return null;
  }

  try {
    return parseDateOnly(value, fieldName);
  } catch {
    return null;
  }
};

const tryParseIsoDate = (value: string): Date | null => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toDateInputValue = (date: Date): string => date.toISOString().slice(0, 10);
