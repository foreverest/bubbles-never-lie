import type { TimeframePostData } from '../../shared/api';

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_ONLY_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

type RelativeAgeLabelStyle = 'short' | 'long';

export function formatTimeframeDatePhrase(timeframe: TimeframePostData): string {
  const startDate = formatDateOnly(timeframe.startDate);
  const endDate = formatDateOnly(timeframe.endDate);

  return timeframe.startDate === timeframe.endDate
    ? `on ${startDate}`
    : `from ${startDate} through ${endDate}`;
}

export function formatTimeframeDateRangeLabel(timeframe: TimeframePostData): string {
  const startDate = formatDateOnly(timeframe.startDate);
  const endDate = formatDateOnly(timeframe.endDate);

  return timeframe.startDate === timeframe.endDate ? startDate : `${startDate} - ${endDate}`;
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
  const secondsAgo = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  const useLongLabels = options.labelStyle === 'long';
  const units = [
    { seconds: 31_536_000, shortLabel: 'yr.', singularLabel: 'year', pluralLabel: 'years' },
    { seconds: 2_592_000, shortLabel: 'mo.', singularLabel: 'month', pluralLabel: 'months' },
    { seconds: 604_800, shortLabel: 'wk.', singularLabel: 'week', pluralLabel: 'weeks' },
    { seconds: 86_400, shortLabel: 'd.', singularLabel: 'day', pluralLabel: 'days' },
    { seconds: 3_600, shortLabel: 'hr.', singularLabel: 'hour', pluralLabel: 'hours' },
    { seconds: 60, shortLabel: 'min.', singularLabel: 'minute', pluralLabel: 'minutes' },
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
