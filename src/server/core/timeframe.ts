import type { Form, JsonObject } from '@devvit/web/shared';
import type { TimeframePostData } from '../../shared/api';

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

export const createTimeframeForm = (): Form => ({
  title: 'Create bubble stats post',
  description:
    'Use YYYY-MM-DD dates. The chart samples the newest subreddit posts and filters them to that range.',
  acceptLabel: 'Create post',
  cancelLabel: 'Cancel',
  fields: [
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
  ],
});

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

export const createPostData = (range: DateRange): TimeframePostData => ({
  type: 'bubble-stats-timeframe',
  ...range,
  createdAt: new Date().toISOString(),
});

export const readTimeframePostData = (
  postData: JsonObject | undefined
): TimeframePostData | null => {
  if (!postData || postData.type !== 'bubble-stats-timeframe') {
    return null;
  }

  const data = postData as Partial<TimeframePostData>;
  if (
    typeof data.startDate !== 'string' ||
    typeof data.endDate !== 'string' ||
    typeof data.startIso !== 'string' ||
    typeof data.endIso !== 'string' ||
    typeof data.createdAt !== 'string'
  ) {
    return null;
  }

  return {
    type: 'bubble-stats-timeframe',
    startDate: data.startDate,
    endDate: data.endDate,
    startIso: data.startIso,
    endIso: data.endIso,
    createdAt: data.createdAt,
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

const toDateInputValue = (date: Date): string => date.toISOString().slice(0, 10);
