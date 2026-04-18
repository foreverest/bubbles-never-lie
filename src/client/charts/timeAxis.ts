import type { EChartsInstance } from './echarts';
import { echarts } from './echarts';
import type { TimeRange } from './types';

const TIME_EDGE_TOLERANCE_MS = 1_000;

export function readVisibleTimeRange(chart: EChartsInstance): TimeRange | null {
  const option = chart.getOption() as { dataZoom?: unknown };
  const dataZoomOptions = Array.isArray(option.dataZoom)
    ? option.dataZoom
    : [option.dataZoom];
  const dataZoomOption = dataZoomOptions.find(isDataZoomRangeOption);

  return dataZoomOption
    ? {
        start: dataZoomOption.startValue,
        end: dataZoomOption.endValue,
      }
    : null;
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

function isDataZoomRangeOption(
  value: unknown
): value is { startValue: number; endValue: number } {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const option = value as Partial<Record<'startValue' | 'endValue', unknown>>;
  return (
    typeof option.startValue === 'number' &&
    typeof option.endValue === 'number' &&
    Number.isFinite(option.startValue) &&
    Number.isFinite(option.endValue)
  );
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
