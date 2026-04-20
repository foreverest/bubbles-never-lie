import { SVGRenderer } from 'echarts/renderers';
import { expect, test } from 'vitest';

import { echarts } from './echarts';
import { formatXAxisLabel, readVisibleTimeRange } from './timeAxis';

echarts.use([SVGRenderer]);

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

test('reads visible time range from percent data zoom', () => {
  const start = new Date(2024, 0, 1, 0, 0, 0, 0).getTime();
  const end = new Date(2024, 0, 1, 4, 0, 0, 0).getTime();
  const chart = echarts.init(null, undefined, {
    renderer: 'svg',
    ssr: true,
    width: 220,
    height: 240,
  });

  try {
    chart.setOption({
      grid: {},
      dataZoom: {
        type: 'inside',
        start: 25,
        end: 75,
      },
      xAxis: {
        type: 'time',
        min: start,
        max: end,
      },
      yAxis: {},
      series: [],
    });

    expect(readVisibleTimeRange(chart)).toEqual({
      start: new Date(2024, 0, 1, 1, 0, 0, 0).getTime(),
      end: new Date(2024, 0, 1, 3, 0, 0, 0).getTime(),
    });
  } finally {
    chart.dispose();
  }
});

test('formats end boundary ticks without rounding to the next minute', () => {
  const start = new Date(2024, 0, 1, 0, 0, 0, 0).getTime();
  const end = new Date(2024, 0, 1, 1, 59, 59, 999).getTime();

  expect(formatXAxisLabel(end, 1, { start, end }, null)).toBe('Jan 01\n01:59');
});
