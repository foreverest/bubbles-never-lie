import { expect, test } from 'vitest';

import { formatXAxisLabel } from './timeAxis';

test('formats boundary ticks with dates and non-boundary ticks with time', () => {
  const start = new Date(2024, 0, 1, 0, 0, 0, 0).getTime();
  const middle = new Date(2024, 0, 1, 1, 0, 0, 0).getTime();
  const end = new Date(2024, 0, 1, 2, 0, 0, 0).getTime();

  expect(formatXAxisLabel(start, 0, { start, end }, null)).toBe('Jan 01');
  expect(formatXAxisLabel(middle, 1, { start, end }, null)).toBe('01:00');
});

test('uses visible zoom range edges as boundary labels', () => {
  const start = new Date(2024, 0, 1, 0, 0, 0, 0).getTime();
  const visibleStart = new Date(2024, 0, 1, 1, 0, 0, 0).getTime();
  const end = new Date(2024, 0, 1, 2, 0, 0, 0).getTime();

  expect(
    formatXAxisLabel(
      visibleStart,
      1,
      { start, end },
      { start: visibleStart, end }
    )
  ).toBe('Jan 01\n01:00');
});

test('formats end boundary ticks without rounding to the next minute', () => {
  const start = new Date(2024, 0, 1, 0, 0, 0, 0).getTime();
  const end = new Date(2024, 0, 1, 1, 59, 59, 999).getTime();

  expect(formatXAxisLabel(end, 1, { start, end }, null)).toBe('Jan 01\n01:59');
});
