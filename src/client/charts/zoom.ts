import type { EChartsInstance } from './echarts';

export type ChartZoomDirection = 'in' | 'out';

export type ZoomRange = {
  start: number;
  end: number;
  minSpan?: number;
};

type DataZoomRangeSnapshot = {
  dataZoomIndex: number;
  start: number;
  end: number;
  minSpan: number;
};

const CHART_ZOOM_IN_FACTOR = 0.7;
const ZOOM_OUT_FULL_RANGE_THRESHOLD = 96;
const FULL_RANGE_TOLERANCE = 0.001;
const MIN_PERCENT = 0;
const MAX_PERCENT = 100;

export function zoomChart(
  chart: EChartsInstance,
  direction: ChartZoomDirection
): void {
  const dataZoomRanges = collectDataZoomRanges(chart.getOption().dataZoom);
  if (dataZoomRanges.length === 0) {
    return;
  }

  const nextRanges = dataZoomRanges.map(({ dataZoomIndex, ...range }) => {
    const nextRange = calculateZoomRange(range, direction);

    return {
      dataZoomIndex,
      start: nextRange.start,
      end: nextRange.end,
    };
  });

  chart.dispatchAction({
    type: 'dataZoom',
    batch: nextRanges,
  });
  syncDataZoomPan(chart, nextRanges);
}

export function calculateZoomRange(
  range: ZoomRange,
  direction: ChartZoomDirection
): ZoomRange {
  const start = clampPercent(Math.min(range.start, range.end));
  const end = clampPercent(Math.max(range.start, range.end));
  const minSpan = clampPercent(range.minSpan ?? MIN_PERCENT);
  const currentSpan = Math.max(end - start, minSpan);
  const targetSpan =
    direction === 'in'
      ? currentSpan * CHART_ZOOM_IN_FACTOR
      : currentSpan / CHART_ZOOM_IN_FACTOR;
  const nextSpan =
    direction === 'out' && targetSpan >= ZOOM_OUT_FULL_RANGE_THRESHOLD
      ? MAX_PERCENT
      : clamp(targetSpan, minSpan, MAX_PERCENT);
  const center = (start + end) / 2;

  return createCenteredRange(center, nextSpan, minSpan);
}

function syncDataZoomPan(
  chart: EChartsInstance,
  ranges: { start: number; end: number }[]
): void {
  const isFullRange = ranges.every(
    ({ start, end }) =>
      start <= MIN_PERCENT + FULL_RANGE_TOLERANCE &&
      end >= MAX_PERCENT - FULL_RANGE_TOLERANCE
  );
  const panEnabled = !isFullRange;

  chart.setOption({
    dataZoom: ranges.map(({ start, end }) => ({
      type: 'inside',
      start,
      end,
      disabled: !panEnabled,
      zoomLock: true,
      zoomOnMouseWheel: false,
      moveOnMouseMove: panEnabled,
      moveOnMouseWheel: false,
      preventDefaultMouseMove: panEnabled,
    })),
  });
}

function collectDataZoomRanges(value: unknown): DataZoomRangeSnapshot[] {
  if (Array.isArray(value)) {
    return value.reduce<DataZoomRangeSnapshot[]>((ranges, option, index) => {
      const range = readDataZoomRange(option, index);
      return range ? [...ranges, range] : ranges;
    }, []);
  }

  const range = readDataZoomRange(value, 0);
  return range ? [range] : [];
}

function readDataZoomRange(
  value: unknown,
  dataZoomIndex: number
): DataZoomRangeSnapshot | null {
  if (!isOptionRecord(value)) {
    return null;
  }

  return {
    dataZoomIndex,
    start: clampPercent(readFiniteNumber(value, 'start') ?? MIN_PERCENT),
    end: clampPercent(readFiniteNumber(value, 'end') ?? MAX_PERCENT),
    minSpan: clampPercent(readFiniteNumber(value, 'minSpan') ?? MIN_PERCENT),
  };
}

function createCenteredRange(
  center: number,
  span: number,
  minSpan: number
): ZoomRange {
  const normalizedSpan = clamp(span, minSpan, MAX_PERCENT);
  let start = center - normalizedSpan / 2;
  let end = center + normalizedSpan / 2;

  if (start < MIN_PERCENT) {
    end += MIN_PERCENT - start;
    start = MIN_PERCENT;
  }

  if (end > MAX_PERCENT) {
    start -= end - MAX_PERCENT;
    end = MAX_PERCENT;
  }

  return {
    start: roundPercent(clampPercent(start)),
    end: roundPercent(clampPercent(end)),
    minSpan,
  };
}

type OptionRecord = {
  readonly [key: string]: unknown;
};

function isOptionRecord(value: unknown): value is OptionRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readFiniteNumber(value: OptionRecord, key: string): number | null {
  const property = value[key];
  return typeof property === 'number' && Number.isFinite(property)
    ? property
    : null;
}

function clampPercent(value: number): number {
  return clamp(value, MIN_PERCENT, MAX_PERCENT);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundPercent(value: number): number {
  return Number(value.toFixed(6));
}
