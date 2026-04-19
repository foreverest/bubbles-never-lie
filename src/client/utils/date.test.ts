import { expect, test, vi } from 'vitest';

import type { DateRange } from '../../shared/api';
import {
  formatDateOnly,
  formatDateRangeLabel,
  formatDateRangeLabels,
  formatDateRangePhrase,
  formatRelativeAge,
} from './date';

const baseDateRange: DateRange = {
  startIso: new Date(2024, 1, 29, 8, 30).toISOString(),
  endIso: new Date(2024, 1, 29, 18, 45).toISOString(),
};
const localDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});
const localDateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

test('formats valid date-only values and leaves invalid values unchanged', () => {
  expect(formatDateOnly('2024-02-29')).toBe('Feb 29, 2024');
  expect(formatDateOnly('2024-02-31')).toBe('2024-02-31');
  expect(formatDateOnly('not-a-date')).toBe('not-a-date');
});

test('formats single-day and multi-day date range labels', () => {
  const start = new Date(baseDateRange.startIso);
  const end = new Date(baseDateRange.endIso);

  expect(formatDateRangePhrase(baseDateRange)).toBe(
    `on ${localDateFormatter.format(start)}`
  );
  expect(formatDateRangeLabel(baseDateRange)).toBe(
    `${localDateTimeFormatter.format(start)} - ${localDateTimeFormatter.format(end)}`
  );
  expect(formatDateRangeLabels(baseDateRange)).toEqual({
    compactLabel: localDateFormatter.format(start),
    fullLabel: `${localDateTimeFormatter.format(start)} - ${localDateTimeFormatter.format(end)}`,
  });

  const extendedDateRange: DateRange = {
    ...baseDateRange,
    endIso: new Date(2024, 2, 2, 18, 45).toISOString(),
  };
  const rangeEnd = new Date(extendedDateRange.endIso);

  expect(formatDateRangePhrase(extendedDateRange)).toBe(
    `from ${localDateFormatter.format(start)} through ${localDateFormatter.format(rangeEnd)}`
  );
  expect(formatDateRangeLabels(extendedDateRange)).toEqual({
    compactLabel: `${localDateFormatter.format(start)} - ${localDateFormatter.format(rangeEnd)}`,
    fullLabel: `${localDateTimeFormatter.format(start)} - ${localDateTimeFormatter.format(
      rangeEnd
    )}`,
  });
});

test('formats relative ages with short and long labels', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2024-02-29T12:00:00.000Z'));

  try {
    expect(formatRelativeAge(new Date('2024-02-29T11:00:00.000Z'))).toBe(
      '1 hr. ago'
    );
    expect(
      formatRelativeAge(new Date('2024-02-28T12:00:00.000Z'), {
        labelStyle: 'long',
      })
    ).toBe('1 day ago');
  } finally {
    vi.useRealTimers();
  }
});
