import { SVGRenderer } from 'echarts/renderers';
import { expect, test } from 'vitest';

import { echarts } from './echarts';
import {
  CHART_MAX_ZOOM_MIN_SPAN,
  calculateZoomMultiplier,
  calculateZoomRange,
  readChartZoomMultiplier,
  resetChartZoom,
  zoomChart,
} from './zoom';

echarts.use([SVGRenderer]);

test('zooms in from the full range', () => {
  expect(
    calculateZoomRange(
      { start: 0, end: 100, minSpan: CHART_MAX_ZOOM_MIN_SPAN },
      'in'
    )
  ).toEqual({
    start: 25,
    end: 75,
    minSpan: CHART_MAX_ZOOM_MIN_SPAN,
  });
});

test('zooms in through fixed multipliers', () => {
  expect(
    calculateZoomRange(
      { start: 25, end: 75, minSpan: CHART_MAX_ZOOM_MIN_SPAN },
      'in'
    )
  ).toEqual({
    start: 37.5,
    end: 62.5,
    minSpan: CHART_MAX_ZOOM_MIN_SPAN,
  });
  expect(
    calculateZoomRange(
      { start: 37.5, end: 62.5, minSpan: CHART_MAX_ZOOM_MIN_SPAN },
      'in'
    )
  ).toEqual({
    start: 43.75,
    end: 56.25,
    minSpan: CHART_MAX_ZOOM_MIN_SPAN,
  });
});

test('zooms out through fixed multipliers', () => {
  expect(
    calculateZoomRange(
      { start: 37.5, end: 62.5, minSpan: CHART_MAX_ZOOM_MIN_SPAN },
      'out'
    )
  ).toEqual({
    start: 25,
    end: 75,
    minSpan: CHART_MAX_ZOOM_MIN_SPAN,
  });
});

test('clamps zoom out at the full range', () => {
  expect(
    calculateZoomRange(
      { start: 0, end: 100, minSpan: CHART_MAX_ZOOM_MIN_SPAN },
      'out'
    )
  ).toEqual({
    start: 0,
    end: 100,
    minSpan: CHART_MAX_ZOOM_MIN_SPAN,
  });
});

test('clamps zoom in at 8x', () => {
  expect(
    calculateZoomRange(
      { start: 43.75, end: 56.25, minSpan: CHART_MAX_ZOOM_MIN_SPAN },
      'in'
    )
  ).toEqual({
    start: 43.75,
    end: 56.25,
    minSpan: CHART_MAX_ZOOM_MIN_SPAN,
  });
});

test('preserves centered ranges near edges when possible', () => {
  expect(
    calculateZoomRange(
      { start: 0, end: 50, minSpan: CHART_MAX_ZOOM_MIN_SPAN },
      'in'
    )
  ).toEqual({
    start: 12.5,
    end: 37.5,
    minSpan: CHART_MAX_ZOOM_MIN_SPAN,
  });
});

test('hides zoom multiplier at the full range', () => {
  expect(calculateZoomMultiplier([{ start: 0, end: 100 }])).toBeNull();
});

test('calculates zoom multiplier from the visible range', () => {
  expect(calculateZoomMultiplier([{ start: 25, end: 75 }])).toBe(2);
});

test('uses the most zoomed range for zoom multiplier', () => {
  expect(
    calculateZoomMultiplier([
      { start: 0, end: 100 },
      { start: 37.5, end: 62.5 },
    ])
  ).toBe(4);
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
          minSpan: CHART_MAX_ZOOM_MIN_SPAN,
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
          minSpan: CHART_MAX_ZOOM_MIN_SPAN,
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

    expect(readChartZoomMultiplier(chart)).toBeNull();

    zoomChart(chart, 'in');
    expect(readChartZoomMultiplier(chart)).toBe(2);

    const dataZoom = chart.getOption().dataZoom;
    expect(Array.isArray(dataZoom)).toBe(true);

    if (!Array.isArray(dataZoom)) {
      return;
    }

    expect(readOptionNumber(dataZoom[0], 'start')).toBe(25);
    expect(readOptionNumber(dataZoom[0], 'end')).toBe(75);
    expect(readOptionNumber(dataZoom[0], 'xAxisIndex')).toBe(0);
    expect(readOptionNumber(dataZoom[0], 'minSpan')).toBe(
      CHART_MAX_ZOOM_MIN_SPAN
    );
    expect(readOptionBoolean(dataZoom[0], 'disabled')).toBe(false);
    expect(readOptionBoolean(dataZoom[0], 'moveOnMouseMove')).toBe(true);
    expect(readOptionBoolean(dataZoom[0], 'preventDefaultMouseMove')).toBe(
      true
    );
    expect(readOptionNumber(dataZoom[1], 'start')).toBe(25);
    expect(readOptionNumber(dataZoom[1], 'end')).toBe(75);
    expect(readOptionNumber(dataZoom[1], 'yAxisIndex')).toBe(0);
    expect(readOptionBoolean(dataZoom[1], 'disabled')).toBe(false);

    resetChartZoom(chart);
    expect(readChartZoomMultiplier(chart)).toBeNull();

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
