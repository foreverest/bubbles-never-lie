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
  startDate: '2024-02-29',
  endDate: '2024-02-29',
  startIso: '2024-02-29T00:00:00.000Z',
  endIso: '2024-03-01T00:00:00.000Z',
  createdAt: '2024-02-28T12:00:00.000Z',
  timeZone: 'Asia/Tokyo',
  durationDays: 1,
};

test('formats valid date-only values and leaves invalid values unchanged', () => {
  expect(formatDateOnly('2024-02-29')).toBe('Feb 29, 2024');
  expect(formatDateOnly('2024-02-31')).toBe('2024-02-31');
  expect(formatDateOnly('not-a-date')).toBe('not-a-date');
});

test('formats single-day and range timeframe labels', () => {
  expect(formatTimeframeDatePhrase(baseTimeframe)).toBe('on Feb 29, 2024 in Asia/Tokyo');
  expect(formatTimeframeDateRangeLabel(baseTimeframe)).toBe('Feb 29, 2024 in Asia/Tokyo');
  expect(formatTimeframeDateRangeLabels(baseTimeframe)).toEqual({
    compactLabel: 'Feb 29, 2024',
    fullLabel: 'Feb 29, 2024 in Asia/Tokyo',
  });

  const rangeTimeframe: TimeframePostData = {
    ...baseTimeframe,
    endDate: '2024-03-02',
    durationDays: 3,
  };

  expect(formatTimeframeDatePhrase(rangeTimeframe)).toBe(
    'from Feb 29, 2024 through Mar 2, 2024 in Asia/Tokyo'
  );
  expect(formatTimeframeDateRangeLabel(rangeTimeframe)).toBe(
    'Feb 29, 2024 - Mar 2, 2024 in Asia/Tokyo'
  );
  expect(formatTimeframeDateRangeLabels(rangeTimeframe)).toEqual({
    compactLabel: 'Feb 29, 2024 - Mar 2, 2024',
    fullLabel: 'Feb 29, 2024 - Mar 2, 2024 in Asia/Tokyo',
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
