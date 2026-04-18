import { expect, test, vi } from 'vitest';

import type { TimeframePostData } from '../../shared/api';
import {
  formatDateOnly,
  formatRelativeAge,
  formatTimeframeDatePhrase,
  formatTimeframeDateRangeLabel,
  formatTimeframeDateRangeLabels,
} from './date';

const baseTimeframe: TimeframePostData = {
  type: 'bubble-stats-timeframe',
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

test('formats single-day and range timeframe labels', () => {
  const start = new Date(baseTimeframe.startIso);
  const end = new Date(baseTimeframe.endIso);

  expect(formatTimeframeDatePhrase(baseTimeframe)).toBe(`on ${localDateFormatter.format(start)}`);
  expect(formatTimeframeDateRangeLabel(baseTimeframe)).toBe(
    `${localDateTimeFormatter.format(start)} - ${localDateTimeFormatter.format(end)}`
  );
  expect(formatTimeframeDateRangeLabels(baseTimeframe)).toEqual({
    compactLabel: localDateFormatter.format(start),
    fullLabel: `${localDateTimeFormatter.format(start)} - ${localDateTimeFormatter.format(end)}`,
  });

  const rangeTimeframe: TimeframePostData = {
    ...baseTimeframe,
    endIso: new Date(2024, 2, 2, 18, 45).toISOString(),
  };
  const rangeEnd = new Date(rangeTimeframe.endIso);

  expect(formatTimeframeDatePhrase(rangeTimeframe)).toBe(
    `from ${localDateFormatter.format(start)} through ${localDateFormatter.format(rangeEnd)}`
  );
  expect(formatTimeframeDateRangeLabels(rangeTimeframe)).toEqual({
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
    expect(formatRelativeAge(new Date('2024-02-29T11:00:00.000Z'))).toBe('1 hr. ago');
    expect(formatRelativeAge(new Date('2024-02-28T12:00:00.000Z'), { labelStyle: 'long' })).toBe(
      '1 day ago'
    );
  } finally {
    vi.useRealTimers();
  }
});
