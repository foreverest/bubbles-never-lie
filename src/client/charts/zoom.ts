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

const MIN_PERCENT = 0;
const MAX_PERCENT = 100;
export const CHART_MAX_ZOOM_MULTIPLIER = 8;
export const CHART_MAX_ZOOM_MIN_SPAN = MAX_PERCENT / CHART_MAX_ZOOM_MULTIPLIER;
const FULL_RANGE_TOLERANCE = 0.001;
const ZOOM_MULTIPLIERS = [1, 2, 4, CHART_MAX_ZOOM_MULTIPLIER];
const REVERSED_ZOOM_MULTIPLIERS = [CHART_MAX_ZOOM_MULTIPLIER, 4, 2, 1];

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

export function resetChartZoom(chart: EChartsInstance): void {
  const dataZoomRanges = collectDataZoomRanges(chart.getOption().dataZoom);
  if (dataZoomRanges.length === 0) {
    return;
  }

  const nextRanges = dataZoomRanges.map(({ dataZoomIndex }) => ({
    dataZoomIndex,
    start: MIN_PERCENT,
    end: MAX_PERCENT,
  }));

  chart.dispatchAction({
    type: 'dataZoom',
    batch: nextRanges,
  });
  syncDataZoomPan(chart, nextRanges);
}

export function readChartZoomMultiplier(chart: EChartsInstance): number | null {
  return calculateZoomMultiplier(
    collectDataZoomRanges(chart.getOption().dataZoom)
  );
}

export function calculateZoomMultiplier(
  ranges: readonly ZoomRange[]
): number | null {
  const spans = ranges.map(({ start, end }) => {
    const normalizedStart = clampPercent(Math.min(start, end));
    const normalizedEnd = clampPercent(Math.max(start, end));

    return normalizedEnd - normalizedStart;
  });

  if (
    spans.length === 0 ||
    spans.every((span) => span >= MAX_PERCENT - FULL_RANGE_TOLERANCE)
  ) {
    return null;
  }

  const visibleSpan = Math.max(Math.min(...spans), FULL_RANGE_TOLERANCE);
  const zoomMultiplier = MAX_PERCENT / visibleSpan;

  return findNearestVisibleZoomMultiplier(zoomMultiplier);
}

export function calculateZoomRange(
  range: ZoomRange,
  direction: ChartZoomDirection
): ZoomRange {
  const start = clampPercent(Math.min(range.start, range.end));
  const end = clampPercent(Math.max(range.start, range.end));
  const minSpan = calculateEffectiveMinSpan(range.minSpan);
  const currentSpan = clamp(end - start, minSpan, MAX_PERCENT);
  const currentMultiplier = MAX_PERCENT / currentSpan;
  const nextMultiplier = calculateNextZoomMultiplier(
    currentMultiplier,
    direction
  );
  const nextSpan =
    nextMultiplier === 1
      ? MAX_PERCENT
      : Math.max(MAX_PERCENT / nextMultiplier, minSpan);
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
      minSpan: CHART_MAX_ZOOM_MIN_SPAN,
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

function calculateNextZoomMultiplier(
  currentMultiplier: number,
  direction: ChartZoomDirection
): number {
  if (direction === 'in') {
    for (const zoomMultiplier of ZOOM_MULTIPLIERS) {
      if (zoomMultiplier > currentMultiplier + FULL_RANGE_TOLERANCE) {
        return zoomMultiplier;
      }
    }

    return CHART_MAX_ZOOM_MULTIPLIER;
  }

  for (const zoomMultiplier of REVERSED_ZOOM_MULTIPLIERS) {
    if (zoomMultiplier < currentMultiplier - FULL_RANGE_TOLERANCE) {
      return zoomMultiplier;
    }
  }

  return 1;
}

function findNearestVisibleZoomMultiplier(currentMultiplier: number): number {
  return ZOOM_MULTIPLIERS.slice(1).reduce((nearest, zoomMultiplier) => {
    const nearestDistance = Math.abs(currentMultiplier - nearest);
    const zoomMultiplierDistance = Math.abs(currentMultiplier - zoomMultiplier);

    return zoomMultiplierDistance < nearestDistance ? zoomMultiplier : nearest;
  }, 2);
}

function calculateEffectiveMinSpan(minSpan: number | undefined): number {
  const normalizedMinSpan = clampPercent(minSpan ?? CHART_MAX_ZOOM_MIN_SPAN);

  return Math.min(normalizedMinSpan, CHART_MAX_ZOOM_MIN_SPAN);
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
