import type { Form, JsonObject } from '@devvit/web/shared';
import type { TimeframePostData } from '../../shared/api';
import { TEST_DATA_SOURCE_SUBREDDIT_NAME } from './subreddits';

const minYear = 2026;
const defaultStartHour = 0;
const defaultDurationDays = 1;
const defaultTimeZone = 'UTC';

export type DateRange = {
  startIso: string;
  endIso: string;
};

type SelectValue = string | string[] | undefined;

export type TimeframeFormValues = {
  startYear?: SelectValue;
  startMonth?: SelectValue;
  startDay?: SelectValue;
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
};

type DateParts = {
  year: number;
  month: number;
  day: number;
};

type ZonedDateParts = DateParts & {
  timeZone: string;
};

type TimeframeParts = ZonedDateParts & {
  durationDays: number;
};

export const defaultTimeframeFormValues = (): TimeframeFormValues => {
  const currentDate = getDatePartsInTimeZone(new Date(), defaultTimeZone);
  const year = clamp(currentDate.year, minYear, getMaxYear(defaultTimeZone));
  const day = Math.min(
    currentDate.day,
    getDaysInMonth(year, currentDate.month)
  );

  return {
    startYear: [String(year)],
    startMonth: [String(currentDate.month)],
    startDay: [String(day)],
    timeZone: [defaultTimeZone],
    durationDays: [String(defaultDurationDays)],
  };
};

export const createTimeframeForm = (
  options: TimeframeFormOptions = {}
): Form => {
  const currentTimeZone = resolveCurrentTimeZone(options.currentTimeZone);
  const maxYear = getMaxYear(currentTimeZone);
  const defaultValues = options.defaultValues ?? defaultTimeframeFormValues();
  const fields: Form['fields'] = [
    {
      type: 'string',
      name: 'title',
      label: 'Post title',
      placeholder: 'Bubbles Never Lie: subreddit activity',
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
      options: createRangeOptions(
        1,
        7,
        (value) => `${value} ${value === 1 ? 'day' : 'days'}`
      ),
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
    title: 'Create Bubbles Never Lie post',
    description:
      'Choose the starting date and timezone. The chart samples the newest subreddit posts and filters them to that range.',
    acceptLabel: 'Create post',
    cancelLabel: 'Cancel',
    fields,
  };
};

export const parseFormDateRange = (values: TimeframeFormValues): DateRange => {
  const timeZone = parseTimeZone(values.timeZone);

  return createDateRangeFromParts({
    year: parseSelectNumber(
      values.startYear,
      'year',
      minYear,
      getMaxYear(timeZone)
    ),
    month: parseSelectNumber(values.startMonth, 'month', 1, 12),
    day: parseSelectNumber(values.startDay, 'day', 1, 31),
    timeZone,
    durationDays: parseSelectNumber(values.durationDays, 'chart length', 1, 7),
  });
};

export const createPostData = (
  range: DateRange,
  options: { useTestDataSource?: boolean } = {}
): TimeframePostData => {
  const postData: TimeframePostData = {
    type: 'timeframe',
    ...range,
  };

  if (options.useTestDataSource) {
    postData.dataSourceSubredditName = TEST_DATA_SOURCE_SUBREDDIT_NAME;
  }

  return postData;
};

export const readTimeframePostData = (
  postDataValue: JsonObject | undefined
): ValidatedTimeframePostData | null => {
  if (!postDataValue || postDataValue.type !== 'timeframe') {
    return null;
  }

  const data = postDataValue as Partial<TimeframePostData>;
  if (typeof data.startIso !== 'string' || typeof data.endIso !== 'string') {
    return null;
  }

  if (
    data.dataSourceSubredditName !== undefined &&
    data.dataSourceSubredditName !== TEST_DATA_SOURCE_SUBREDDIT_NAME
  ) {
    return null;
  }

  const start = tryParseIsoDate(data.startIso);
  const end = tryParseIsoDate(data.endIso);

  if (!start || !end || start.getTime() > end.getTime()) {
    return null;
  }

  const validatedPostData: TimeframePostData = {
    type: 'timeframe',
    startIso: data.startIso,
    endIso: data.endIso,
  };

  if (data.dataSourceSubredditName === TEST_DATA_SOURCE_SUBREDDIT_NAME) {
    validatedPostData.dataSourceSubredditName = data.dataSourceSubredditName;
  }

  return {
    postData: validatedPostData,
    start,
    end,
  };
};

export const normalizeTitle = (value: string | undefined): string => {
  const title = typeof value === 'string' ? value.trim() : '';
  return title || 'Bubbles Never Lie: subreddit activity';
};

export const resolveCurrentTimeZone = (
  timeZoneHint: string | undefined
): string => {
  if (timeZoneHint && isValidTimeZone(timeZoneHint)) {
    return timeZoneHint;
  }

  const runtimeTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return runtimeTimeZone && isValidTimeZone(runtimeTimeZone)
    ? runtimeTimeZone
    : defaultTimeZone;
};

const createDateRangeFromParts = (parts: TimeframeParts): DateRange => {
  validateDateParts(parts);

  const start = zonedDateTimeToUtc(parts);
  const endDate = addCalendarDays(parts, parts.durationDays);
  const end = zonedDateTimeToUtc({
    ...endDate,
    timeZone: parts.timeZone,
  });

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
};

const tryParseIsoDate = (value: string): Date | null => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) || date.toISOString() !== value
    ? null
    : date;
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

const createTimeZoneOptions = (
  currentTimeZone: string
): { label: string; value: string }[] => {
  const orderedTimeZones = [
    defaultTimeZone,
    ...(currentTimeZone === defaultTimeZone ? [] : [currentTimeZone]),
    ...getSupportedTimeZones().sort(),
  ];
  const seenTimeZones = new Set<string>();

  return orderedTimeZones.flatMap((timeZone) => {
    if (seenTimeZones.has(timeZone)) {
      return [];
    }

    seenTimeZones.add(timeZone);

    return [
      {
        label:
          timeZone === currentTimeZone
            ? `${formatTimeZoneLabel(timeZone)} (your timezone)`
            : formatTimeZoneLabel(timeZone),
        value: timeZone,
      },
    ];
  });
};

const getSupportedTimeZones = (): string[] => {
  if (typeof Intl.supportedValuesOf !== 'function') {
    return [];
  }

  return Intl.supportedValuesOf('timeZone');
};

const formatTimeZoneLabel = (timeZone: string): string =>
  timeZone.replaceAll('_', ' ');

const parseSelectNumber = (
  value: SelectValue,
  fieldLabel: string,
  min: number,
  max: number
): number => {
  const selectedValue = readSingleSelectValue(value, fieldLabel);
  const selectedNumber = Number(selectedValue);

  if (
    !Number.isInteger(selectedNumber) ||
    selectedNumber < min ||
    selectedNumber > max
  ) {
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

const readSingleSelectValue = (
  value: SelectValue,
  fieldLabel: string
): string => {
  const selectedValue = Array.isArray(value) ? value[0] : value;
  const normalized =
    typeof selectedValue === 'string' ? selectedValue.trim() : '';

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

const zonedDateTimeToUtc = (parts: ZonedDateParts): Date => {
  const naiveUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    defaultStartHour
  );
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
    actualParts.hour !== defaultStartHour
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
  const date = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + days)
  );
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
};

const getDaysInMonth = (year: number, month: number): number =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

const getMaxYear = (timeZone: string): number =>
  Math.max(minYear, getDatePartsInTimeZone(new Date(), timeZone).year + 1);

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);
