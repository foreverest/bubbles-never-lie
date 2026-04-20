import type { EChartsInstance } from './echarts';
import { echarts } from './echarts';
import type { TimeRange } from './types';

const TIME_EDGE_TOLERANCE_MS = 1_000;

export function readVisibleTimeRange(chart: EChartsInstance): TimeRange | null {
  const option = chart.getOption();
  const dataZoomOption = readFirstOptionObject(option.dataZoom);

  if (!dataZoomOption) {
    return null;
  }

  const startValue = readFiniteNumber(dataZoomOption, 'startValue');
  const endValue = readFiniteNumber(dataZoomOption, 'endValue');
  if (startValue !== null && endValue !== null) {
    return {
      start: startValue,
      end: endValue,
    };
  }

  const start = readFiniteNumber(dataZoomOption, 'start');
  const end = readFiniteNumber(dataZoomOption, 'end');
  const xAxisOption = readFirstOptionObject(option.xAxis);
  const min = xAxisOption ? readFiniteNumber(xAxisOption, 'min') : null;
  const max = xAxisOption ? readFiniteNumber(xAxisOption, 'max') : null;

  if (start === null || end === null || min === null || max === null) {
    return null;
  }

  const axisSpan = max - min;
  return {
    start: min + (axisSpan * start) / 100,
    end: min + (axisSpan * end) / 100,
  };
}

export function formatXAxisLabel(
  value: number,
  tickIndex: number,
  chartTimeRange: TimeRange,
  visibleTimeRange: TimeRange | null
): string {
  const currentTimeRange = visibleTimeRange ?? chartTimeRange;
  const isBoundary =
    tickIndex === 0 ||
    isTimeRangeEdge(value, currentTimeRange.start) ||
    isTimeRangeEdge(value, currentTimeRange.end);
  const date = new Date(value);

  if (isBoundary) {
    return isMidnight(date)
      ? echarts.time.format(date.getTime(), '{MMM} {dd}', false)
      : echarts.time.format(date.getTime(), '{MMM} {dd}\n{HH}:{mm}', false);
  }

  return isMidnight(date)
    ? echarts.time.format(value, '{MMM} {dd}', false)
    : echarts.time.format(value, '{HH}:{mm}', false);
}

type OptionRecord = {
  readonly [key: string]: unknown;
};

function readFirstOptionObject(value: unknown): OptionRecord | null {
  if (Array.isArray(value)) {
    return value.find(isOptionRecord) ?? null;
  }

  return isOptionRecord(value) ? value : null;
}

function isOptionRecord(value: unknown): value is OptionRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readFiniteNumber(value: OptionRecord, key: string): number | null {
  const property = value[key];
  return typeof property === 'number' && Number.isFinite(property)
    ? property
    : null;
}

function isTimeRangeEdge(value: number, edge: number): boolean {
  return Math.abs(value - edge) <= TIME_EDGE_TOLERANCE_MS;
}

function isMidnight(date: Date): boolean {
  return (
    date.getHours() === 0 &&
    date.getMinutes() === 0 &&
    date.getSeconds() === 0 &&
    date.getMilliseconds() === 0
  );
}
