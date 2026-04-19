import type { DateRange } from '../../shared/api';

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_ONLY_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});
const LOCAL_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});
const LOCAL_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

type RelativeAgeLabelStyle = 'short' | 'long';
type DateRangeLabels = {
  compactLabel: string;
  fullLabel: string;
};

export function formatDateRangePhrase(dateRange: DateRange): string {
  const range = readLocalDateRange(dateRange);

  if (!range) {
    return `from ${dateRange.startIso} through ${dateRange.endIso}`;
  }

  return range.compactStartDate === range.compactEndDate
    ? `on ${range.compactStartDate}`
    : `from ${range.compactStartDate} through ${range.compactEndDate}`;
}

export function formatDateRangeLabel(dateRange: DateRange): string {
  return formatDateRangeLabels(dateRange).fullLabel;
}

export function formatDateRangeLabels(dateRange: DateRange): DateRangeLabels {
  const range = readLocalDateRange(dateRange);

  if (!range) {
    const fallbackLabel = `${dateRange.startIso} - ${dateRange.endIso}`;
    return {
      compactLabel: fallbackLabel,
      fullLabel: fallbackLabel,
    };
  }

  const compactDateRange =
    range.compactStartDate === range.compactEndDate
      ? range.compactStartDate
      : `${range.compactStartDate} - ${range.compactEndDate}`;

  return {
    compactLabel: compactDateRange,
    fullLabel:
      range.fullStartDate === range.fullEndDate
        ? range.fullStartDate
        : `${range.fullStartDate} - ${range.fullEndDate}`,
  };
}

export function formatDateOnly(value: string): string {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) {
    return value;
  }

  const [, rawYear, rawMonth, rawDay] = match;
  const year = Number(rawYear);
  const month = Number(rawMonth);
  const day = Number(rawDay);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return value;
  }

  return DATE_ONLY_FORMATTER.format(date);
}

export function formatRelativeAge(
  date: Date,
  options: { labelStyle?: RelativeAgeLabelStyle } = {}
): string {
  const secondsAgo = Math.max(
    0,
    Math.floor((Date.now() - date.getTime()) / 1000)
  );
  const useLongLabels = options.labelStyle === 'long';
  const units = [
    {
      seconds: 31_536_000,
      shortLabel: 'yr.',
      singularLabel: 'year',
      pluralLabel: 'years',
    },
    {
      seconds: 2_592_000,
      shortLabel: 'mo.',
      singularLabel: 'month',
      pluralLabel: 'months',
    },
    {
      seconds: 604_800,
      shortLabel: 'wk.',
      singularLabel: 'week',
      pluralLabel: 'weeks',
    },
    {
      seconds: 86_400,
      shortLabel: 'd.',
      singularLabel: 'day',
      pluralLabel: 'days',
    },
    {
      seconds: 3_600,
      shortLabel: 'hr.',
      singularLabel: 'hour',
      pluralLabel: 'hours',
    },
    {
      seconds: 60,
      shortLabel: 'min.',
      singularLabel: 'minute',
      pluralLabel: 'minutes',
    },
  ];

  for (const unit of units) {
    if (secondsAgo >= unit.seconds) {
      const value = Math.floor(secondsAgo / unit.seconds);
      const label = useLongLabels
        ? value === 1
          ? unit.singularLabel
          : unit.pluralLabel
        : unit.shortLabel;

      return `${value} ${label} ago`;
    }
  }

  return 'just now';
}

function readLocalDateRange(dateRange: DateRange): {
  compactStartDate: string;
  compactEndDate: string;
  fullStartDate: string;
  fullEndDate: string;
} | null {
  const start = parseIsoDate(dateRange.startIso);
  const end = parseIsoDate(dateRange.endIso);

  if (!start || !end) {
    return null;
  }

  return {
    compactStartDate: LOCAL_DATE_FORMATTER.format(start),
    compactEndDate: LOCAL_DATE_FORMATTER.format(end),
    fullStartDate: LOCAL_DATE_TIME_FORMATTER.format(start),
    fullEndDate: LOCAL_DATE_TIME_FORMATTER.format(end),
  };
}

function parseIsoDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
