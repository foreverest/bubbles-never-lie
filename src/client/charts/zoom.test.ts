import { SVGRenderer } from 'echarts/renderers';
import { expect, test } from 'vitest';

import { echarts } from './echarts';
import { calculateZoomRange, zoomChart } from './zoom';

echarts.use([SVGRenderer]);

test('zooms in from the full range', () => {
  expect(calculateZoomRange({ start: 0, end: 100, minSpan: 10 }, 'in')).toEqual(
    {
      start: 15,
      end: 85,
      minSpan: 10,
    }
  );
});

test('zooms out from a partial range', () => {
  const range = calculateZoomRange({ start: 25, end: 75, minSpan: 10 }, 'out');

  expect(range.start).toBeCloseTo(14.285714);
  expect(range.end).toBeCloseTo(85.714286);
  expect(range.minSpan).toBe(10);
});

test('clamps zoom out at the full range', () => {
  expect(
    calculateZoomRange({ start: 0, end: 100, minSpan: 10 }, 'out')
  ).toEqual({
    start: 0,
    end: 100,
    minSpan: 10,
  });
});

test('snaps zoom out to the full range near the end', () => {
  expect(calculateZoomRange({ start: 2, end: 95, minSpan: 10 }, 'out')).toEqual(
    {
      start: 0,
      end: 100,
      minSpan: 10,
    }
  );
});

test('respects minimum span while zooming in', () => {
  expect(calculateZoomRange({ start: 20, end: 31, minSpan: 10 }, 'in')).toEqual(
    {
      start: 20.5,
      end: 30.5,
      minSpan: 10,
    }
  );
});

test('preserves centered ranges near edges when possible', () => {
  expect(calculateZoomRange({ start: 5, end: 25, minSpan: 0 }, 'in')).toEqual({
    start: 8,
    end: 22,
    minSpan: 0,
  });
});

test('enables pan after zooming in and disables pan at full range', () => {
  const chart = echarts.init(null, undefined, {
    renderer: 'svg',
    ssr: true,
    width: 220,
    height: 240,
  });

  try {
    chart.setOption({
      grid: {},
      dataZoom: [
        {
          type: 'inside',
          xAxisIndex: 0,
          start: 0,
          end: 100,
          minSpan: 10,
          disabled: true,
          zoomLock: true,
          zoomOnMouseWheel: false,
          moveOnMouseMove: false,
          moveOnMouseWheel: false,
          preventDefaultMouseMove: false,
        },
        {
          type: 'inside',
          yAxisIndex: 0,
          start: 0,
          end: 100,
          minSpan: 10,
          disabled: true,
          zoomLock: true,
          zoomOnMouseWheel: false,
          moveOnMouseMove: false,
          moveOnMouseWheel: false,
          preventDefaultMouseMove: false,
        },
      ],
      xAxis: {
        type: 'value',
        min: 0,
        max: 100,
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 100,
      },
      series: [],
    });

    zoomChart(chart, 'in');

    const dataZoom = chart.getOption().dataZoom;
    expect(Array.isArray(dataZoom)).toBe(true);

    if (!Array.isArray(dataZoom)) {
      return;
    }

    expect(readOptionNumber(dataZoom[0], 'start')).toBe(15);
    expect(readOptionNumber(dataZoom[0], 'end')).toBe(85);
    expect(readOptionNumber(dataZoom[0], 'xAxisIndex')).toBe(0);
    expect(readOptionBoolean(dataZoom[0], 'disabled')).toBe(false);
    expect(readOptionBoolean(dataZoom[0], 'moveOnMouseMove')).toBe(true);
    expect(readOptionBoolean(dataZoom[0], 'preventDefaultMouseMove')).toBe(
      true
    );
    expect(readOptionNumber(dataZoom[1], 'start')).toBe(15);
    expect(readOptionNumber(dataZoom[1], 'end')).toBe(85);
    expect(readOptionNumber(dataZoom[1], 'yAxisIndex')).toBe(0);
    expect(readOptionBoolean(dataZoom[1], 'disabled')).toBe(false);

    zoomChart(chart, 'out');

    const resetDataZoom = chart.getOption().dataZoom;
    expect(Array.isArray(resetDataZoom)).toBe(true);

    if (!Array.isArray(resetDataZoom)) {
      return;
    }

    expect(readOptionNumber(resetDataZoom[0], 'start')).toBe(0);
    expect(readOptionNumber(resetDataZoom[0], 'end')).toBe(100);
    expect(readOptionBoolean(resetDataZoom[0], 'disabled')).toBe(true);
    expect(readOptionBoolean(resetDataZoom[0], 'moveOnMouseMove')).toBe(false);
    expect(readOptionBoolean(resetDataZoom[0], 'preventDefaultMouseMove')).toBe(
      false
    );
  } finally {
    chart.dispose();
  }
});

type OptionRecord = {
  readonly [key: string]: unknown;
};

function readOptionNumber(value: unknown, key: string): number | null {
  if (!isOptionRecord(value)) {
    return null;
  }

  const property = value[key];
  return typeof property === 'number' ? property : null;
}

function readOptionBoolean(value: unknown, key: string): boolean | null {
  if (!isOptionRecord(value)) {
    return null;
  }

  const property = value[key];
  return typeof property === 'boolean' ? property : null;
}

function isOptionRecord(value: unknown): value is OptionRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
