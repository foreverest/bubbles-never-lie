import type { Form, JsonObject } from '@devvit/web/shared';
import type { TimeframePostData } from '../../shared/api';
import { TEST_DATA_SOURCE_SUBREDDIT_NAME } from './subreddits';

const minYear = 2026;
const maxYear = 2030;
const defaultStartHour = 0;
const defaultDurationDays = 1;
const defaultTimeZone = 'UTC';
const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

export type DateRange = {
  startDate: string;
  endDate: string;
  startIso: string;
  endIso: string;
  timeZone: string;
  startHour: number;
  durationDays: number;
};

type SelectValue = string | string[] | undefined;

export type TimeframeFormValues = {
  startYear?: SelectValue;
  startMonth?: SelectValue;
  startDay?: SelectValue;
  startHour?: SelectValue;
  timeZone?: SelectValue;
  durationDays?: SelectValue;
  title?: string;
  useTestDataSource?: boolean;
};

export type TimeframeFormOptions = {
  allowTestDataSource?: boolean;
  currentTimeZone?: string;
  defaultValues?: TimeframeFormValues;
};

export type ValidatedTimeframePostData = {
  postData: TimeframePostData;
  start: Date;
  end: Date;
  createdAt: Date;
};

type DateParts = {
  year: number;
  month: number;
  day: number;
};

type TimeframeParts = DateParts & {
  startHour: number;
  timeZone: string;
  durationDays: number;
};

export const defaultTimeframeFormValues = (timeZoneHint?: string): TimeframeFormValues => {
  const timeZone = resolveCurrentTimeZone(timeZoneHint);
  const currentDate = getDatePartsInTimeZone(new Date(), timeZone);
  const year = clamp(currentDate.year, minYear, maxYear);
  const day = Math.min(currentDate.day, getDaysInMonth(year, currentDate.month));

  return {
    startYear: [String(year)],
    startMonth: [String(currentDate.month)],
    startDay: [String(day)],
    startHour: [String(defaultStartHour)],
    timeZone: [timeZone],
    durationDays: [String(defaultDurationDays)],
  };
};

export const createTimeframeForm = (options: TimeframeFormOptions = {}): Form => {
  const currentTimeZone = resolveCurrentTimeZone(options.currentTimeZone);
  const defaultValues = options.defaultValues ?? defaultTimeframeFormValues(currentTimeZone);
  const fields: Form['fields'] = [
    {
      type: 'string',
      name: 'title',
      label: 'Post title',
      placeholder: 'Subreddit bubble stats',
      defaultValue: normalizeTitle(defaultValues.title),
    },
    {
      type: 'select',
      name: 'startYear',
      label: 'Year',
      required: true,
      defaultValue: readDefaultSelectValue(defaultValues.startYear),
      options: createRangeOptions(minYear, maxYear),
    },
    {
      type: 'select',
      name: 'startMonth',
      label: 'Month',
      required: true,
      defaultValue: readDefaultSelectValue(defaultValues.startMonth),
      options: [
        { label: 'January', value: '1' },
        { label: 'February', value: '2' },
        { label: 'March', value: '3' },
        { label: 'April', value: '4' },
        { label: 'May', value: '5' },
        { label: 'June', value: '6' },
        { label: 'July', value: '7' },
        { label: 'August', value: '8' },
        { label: 'September', value: '9' },
        { label: 'October', value: '10' },
        { label: 'November', value: '11' },
        { label: 'December', value: '12' },
      ],
    },
    {
      type: 'select',
      name: 'startDay',
      label: 'Day',
      required: true,
      defaultValue: readDefaultSelectValue(defaultValues.startDay),
      options: createRangeOptions(1, 31),
    },
    {
      type: 'select',
      name: 'startHour',
      label: 'Hour',
      required: true,
      defaultValue: readDefaultSelectValue(defaultValues.startHour),
      options: createRangeOptions(0, 23),
    },
    {
      type: 'select',
      name: 'timeZone',
      label: 'Timezone',
      required: true,
      defaultValue: readDefaultSelectValue(defaultValues.timeZone),
      options: createTimeZoneOptions(currentTimeZone),
    },
    {
      type: 'select',
      name: 'durationDays',
      label: 'Chart length',
      required: true,
      defaultValue: readDefaultSelectValue(defaultValues.durationDays),
      options: createRangeOptions(1, 7, (value) => `${value} ${value === 1 ? 'day' : 'days'}`),
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
      'Choose the starting date and hour. The chart samples the newest subreddit posts and filters them to that range.',
    acceptLabel: 'Create post',
    cancelLabel: 'Cancel',
    fields,
  };
};

export const parseFormDateRange = (values: TimeframeFormValues): DateRange => {
  return createDateRangeFromParts({
    year: parseSelectNumber(values.startYear, 'year', minYear, maxYear),
    month: parseSelectNumber(values.startMonth, 'month', 1, 12),
    day: parseSelectNumber(values.startDay, 'day', 1, 31),
    startHour: parseSelectNumber(values.startHour, 'hour', 0, 23),
    timeZone: parseTimeZone(values.timeZone),
    durationDays: parseSelectNumber(values.durationDays, 'chart length', 1, 7),
  });
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
  const isTimeZoneRange =
    data.timeZone !== undefined || data.startHour !== undefined || data.durationDays !== undefined;

  if (
    !start ||
    !end ||
    !startIso ||
    !endIso ||
    !createdAt ||
    startIso.getTime() > endIso.getTime()
  ) {
    return null;
  }

  if (isTimeZoneRange) {
    if (
      typeof data.timeZone !== 'string' ||
      typeof data.startHour !== 'number' ||
      typeof data.durationDays !== 'number' ||
      !Number.isInteger(data.startHour) ||
      !Number.isInteger(data.durationDays) ||
      data.startHour < 0 ||
      data.startHour > 23 ||
      data.durationDays < 1 ||
      data.durationDays > 7 ||
      !isValidTimeZone(data.timeZone)
    ) {
      return null;
    }

    const startDateParts = tryParseDateParts(data.startDate);
    if (!startDateParts) {
      return null;
    }

    const range = tryCreateDateRangeFromParts({
      ...startDateParts,
      startHour: data.startHour,
      timeZone: data.timeZone,
      durationDays: data.durationDays,
    });

    if (
      !range ||
      range.startDate !== data.startDate ||
      range.endDate !== data.endDate ||
      range.startIso !== data.startIso ||
      range.endIso !== data.endIso
    ) {
      return null;
    }
  } else if (start.getTime() !== startIso.getTime() || end.getTime() !== endIso.getTime()) {
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

  if (isTimeZoneRange) {
    validatedPostData.timeZone = data.timeZone;
    validatedPostData.startHour = data.startHour;
    validatedPostData.durationDays = data.durationDays;
  }

  if (data.dataSourceSubredditName === TEST_DATA_SOURCE_SUBREDDIT_NAME) {
    validatedPostData.dataSourceSubredditName = data.dataSourceSubredditName;
  }

  return {
    postData: validatedPostData,
    start: isTimeZoneRange ? startIso : start,
    end: isTimeZoneRange ? endIso : end,
    createdAt,
  };
};

export const normalizeTitle = (value: string | undefined): string => {
  const title = typeof value === 'string' ? value.trim() : '';
  return title || 'Subreddit bubble stats';
};

export const resolveCurrentTimeZone = (timeZoneHint: string | undefined): string => {
  if (timeZoneHint && isValidTimeZone(timeZoneHint)) {
    return timeZoneHint;
  }

  const runtimeTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return runtimeTimeZone && isValidTimeZone(runtimeTimeZone) ? runtimeTimeZone : defaultTimeZone;
};

const createDateRangeFromParts = (parts: TimeframeParts): DateRange => {
  validateDateParts(parts);

  const start = zonedDateTimeToUtc(parts);
  const endExclusiveDate = addCalendarDays(parts, parts.durationDays);
  const endExclusive = zonedDateTimeToUtc({
    ...endExclusiveDate,
    startHour: parts.startHour,
    timeZone: parts.timeZone,
    durationDays: parts.durationDays,
  });
  const end = new Date(endExclusive.getTime() - 1);

  return {
    startDate: formatDateParts(parts),
    endDate: formatDateInTimeZone(end, parts.timeZone),
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    timeZone: parts.timeZone,
    startHour: parts.startHour,
    durationDays: parts.durationDays,
  };
};

const tryCreateDateRangeFromParts = (parts: TimeframeParts): DateRange | null => {
  try {
    return createDateRangeFromParts(parts);
  } catch {
    return null;
  }
};

const parseDateOnly = (value: string, fieldName: string): Date => {
  const { year, month, day } = parseDateParts(value, fieldName);
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

const parseDateParts = (value: string, fieldName: string): DateParts => {
  const [yearText, monthText, dayText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  validateDateParts({ year, month, day }, fieldName);

  return { year, month, day };
};

const tryParseDateParts = (value: string): DateParts | null => {
  if (!dateOnlyPattern.test(value)) {
    return null;
  }

  try {
    return parseDateParts(value, 'startDate');
  } catch {
    return null;
  }
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

const createRangeOptions = (
  start: number,
  end: number,
  createLabel: (value: number) => string = String
): { label: string; value: string }[] =>
  Array.from({ length: end - start + 1 }, (_, index) => {
    const value = start + index;
    return { label: createLabel(value), value: String(value) };
  });

const createTimeZoneOptions = (currentTimeZone: string): { label: string; value: string }[] => {
  const timeZones = new Set([defaultTimeZone, ...getSupportedTimeZones(), currentTimeZone]);
  return [...timeZones].sort().map((timeZone) => ({
    label: timeZone.replaceAll('_', ' '),
    value: timeZone,
  }));
};

const getSupportedTimeZones = (): string[] => {
  if (typeof Intl.supportedValuesOf !== 'function') {
    return [];
  }

  return Intl.supportedValuesOf('timeZone');
};

const parseSelectNumber = (
  value: SelectValue,
  fieldLabel: string,
  min: number,
  max: number
): number => {
  const selectedValue = readSingleSelectValue(value, fieldLabel);
  const selectedNumber = Number(selectedValue);

  if (!Number.isInteger(selectedNumber) || selectedNumber < min || selectedNumber > max) {
    throw new Error(`Select a valid ${fieldLabel}.`);
  }

  return selectedNumber;
};

const parseTimeZone = (value: SelectValue): string => {
  const timeZone = readSingleSelectValue(value, 'timezone');

  if (!isValidTimeZone(timeZone)) {
    throw new Error('Select a valid timezone.');
  }

  return timeZone;
};

const readSingleSelectValue = (value: SelectValue, fieldLabel: string): string => {
  const selectedValue = Array.isArray(value) ? value[0] : value;
  const normalized = typeof selectedValue === 'string' ? selectedValue.trim() : '';

  if (!normalized) {
    throw new Error(`Select a ${fieldLabel}.`);
  }

  return normalized;
};

const readDefaultSelectValue = (value: SelectValue): string[] | undefined => {
  if (Array.isArray(value)) {
    return value;
  }

  return value ? [value] : undefined;
};

const validateDateParts = (parts: DateParts, fieldName = 'date'): void => {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));

  if (
    !Number.isInteger(parts.year) ||
    !Number.isInteger(parts.month) ||
    !Number.isInteger(parts.day) ||
    date.getUTCFullYear() !== parts.year ||
    date.getUTCMonth() !== parts.month - 1 ||
    date.getUTCDate() !== parts.day
  ) {
    throw new Error(`Invalid ${fieldName}.`);
  }
};

const isValidTimeZone = (timeZone: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
};

const zonedDateTimeToUtc = (parts: TimeframeParts): Date => {
  const naiveUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.startHour);
  let utc = naiveUtc;

  for (let iteration = 0; iteration < 3; iteration += 1) {
    const offset = getTimeZoneOffsetMs(new Date(utc), parts.timeZone);
    const adjustedUtc = naiveUtc - offset;

    if (adjustedUtc === utc) {
      break;
    }

    utc = adjustedUtc;
  }

  const date = new Date(utc);
  const actualParts = getDateTimePartsInTimeZone(date, parts.timeZone);

  if (
    actualParts.year !== parts.year ||
    actualParts.month !== parts.month ||
    actualParts.day !== parts.day ||
    actualParts.hour !== parts.startHour
  ) {
    throw new Error('Selected start time does not exist in that timezone.');
  }

  return date;
};

const getTimeZoneOffsetMs = (date: Date, timeZone: string): number => {
  const parts = getDateTimePartsInTimeZone(date, timeZone);
  const dateAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );

  return dateAsUtc - date.getTime();
};

const getDatePartsInTimeZone = (date: Date, timeZone: string): DateParts => {
  const { year, month, day } = getDateTimePartsInTimeZone(date, timeZone);
  return { year, month, day };
};

const getDateTimePartsInTimeZone = (
  date: Date,
  timeZone: string
): DateParts & { hour: number; minute: number; second: number } => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    calendar: 'iso8601',
    numberingSystem: 'latn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const readPart = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((item) => item.type === type);
    return part ? Number(part.value) : Number.NaN;
  };

  return {
    year: readPart('year'),
    month: readPart('month'),
    day: readPart('day'),
    hour: readPart('hour'),
    minute: readPart('minute'),
    second: readPart('second'),
  };
};

const addCalendarDays = (parts: DateParts, days: number): DateParts => {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
};

const getDaysInMonth = (year: number, month: number): number =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

const formatDateInTimeZone = (date: Date, timeZone: string): string =>
  formatDateParts(getDatePartsInTimeZone(date, timeZone));

const formatDateParts = (parts: DateParts): string =>
  `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;

const pad2 = (value: number): string => value.toString().padStart(2, '0');

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);
