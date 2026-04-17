import type { EChartsCoreOption } from '../echarts';
import { formatXAxisLabel } from '../timeAxis';
import type { GetVisibleTimeRange, RippleColorOption, SymbolSizeOption } from '../types';

export const SOAP_BUBBLE_BORDER_COLOR = 'rgba(255, 255, 255, 0.88)';
export const SOAP_BUBBLE_EMPHASIS_BORDER_COLOR = 'rgba(255, 255, 255, 0.98)';
export const SOAP_BUBBLE_EMPHASIS_SHADOW_COLOR = 'rgba(15, 23, 42, 0.18)';
export const SOAP_BUBBLE_FILL_ALPHA = 0.9;
export const COMMENT_BUBBLE_FILL_ALPHA = 0.94;

const CHART_GRID_LINE_COLOR = '#edf1f4';
const CHART_AXIS_LINE_COLOR = '#c6d1d8';
const CHART_AXIS_LABEL_COLOR = '#56636d';
const CHART_AXIS_NAME_COLOR = '#697780';
const CHART_TOOLTIP_BACKGROUND_COLOR = '#ffffff';
const CHART_TOOLTIP_EXTRA_CSS =
  'border-radius:8px;box-shadow:0 18px 44px rgba(15,23,42,0.18);padding:0;';
const CURRENT_USER_RIPPLE_SERIES_Z = 4;
const CURRENT_USER_RIPPLE_EFFECT = {
  brushType: 'fill',
  scale: 3,
  period: 3,
  number: 3,
} as const;

export function createChartGrid(
  overrides: Partial<{ top: number; right: number; bottom: number; left: number }> = {}
) {
  return {
    top: 34,
    right: 28,
    bottom: 40,
    left: 48,
    containLabel: true,
    ...overrides,
  };
}

export function createChartTooltip(formatter: (params: { data?: unknown }) => string) {
  return {
    trigger: 'item',
    confine: true,
    borderWidth: 0,
    backgroundColor: CHART_TOOLTIP_BACKGROUND_COLOR,
    textStyle: {
      color: '#0f1419',
    },
    extraCssText: CHART_TOOLTIP_EXTRA_CSS,
    formatter,
  };
}

export function createTimeXAxis(
  startTime: number,
  endTime: number,
  getVisibleTimeRange?: GetVisibleTimeRange
) {
  return {
    type: 'time',
    min: startTime,
    max: endTime,
    splitLine: createSplitLine(),
    axisLine: createAxisLine(),
    axisTick: {
      show: false,
    },
    axisLabel: {
      color: CHART_AXIS_LABEL_COLOR,
      fontSize: 12,
      fontWeight: 600,
      margin: 14,
      formatter: (value: number, tickIndex: number) =>
        formatXAxisLabel(
          value,
          tickIndex,
          { start: startTime, end: endTime },
          getVisibleTimeRange?.() ?? null
        ),
      showMinLabel: true,
      alignMinLabel: 'center',
      showMaxLabel: true,
      alignMaxLabel: 'center',
    },
  };
}

export function createUpvotesYAxis() {
  return {
    name: 'Upvotes',
    nameLocation: 'middle',
    nameGap: 40,
    nameTextStyle: createAxisNameTextStyle(),
    type: 'value',
    minInterval: 1,
    splitLine: createSplitLine(),
    axisLine: createAxisLine(),
    axisTick: {
      show: false,
    },
    axisLabel: createAxisLabel(),
  };
}

export function createValueAxis({
  name,
  min,
  max,
  nameGap,
}: {
  name: string;
  min: number;
  max: number;
  nameGap: number;
}) {
  return {
    name,
    nameLocation: 'middle',
    nameGap,
    nameTextStyle: createAxisNameTextStyle(),
    type: 'value',
    min,
    max,
    minInterval: 1,
    splitLine: createSplitLine(),
    axisLine: createAxisLine(),
    axisTick: {
      show: false,
    },
    axisLabel: createAxisLabel(),
  };
}

export function createSingleAxisDataZoom(minSpan: number) {
  return {
    type: 'inside',
    filterMode: 'none',
    minSpan,
  };
}

export function createDualAxisDataZoom() {
  return [
    {
      type: 'inside',
      xAxisIndex: 0,
      filterMode: 'none',
      minSpan: 1,
    },
    {
      type: 'inside',
      yAxisIndex: 0,
      filterMode: 'none',
      minSpan: 1,
    },
  ];
}

export function createCurrentUserRippleSeries({
  id,
  name,
  data,
  symbolSize,
  color,
  encode,
}: {
  id: string;
  name: string;
  data: unknown[];
  symbolSize: SymbolSizeOption;
  color: RippleColorOption;
  encode?: { x: number; y: number };
}) {
  return {
    id,
    name,
    type: 'effectScatter',
    cursor: 'default',
    silent: true,
    data,
    ...(encode ? { encode } : {}),
    symbolSize,
    showEffectOn: 'render',
    rippleEffect: CURRENT_USER_RIPPLE_EFFECT,
    itemStyle: {
      color,
      opacity: 0,
    },
    emphasis: {
      disabled: true,
    },
    tooltip: {
      show: false,
    },
    z: CURRENT_USER_RIPPLE_SERIES_Z,
  };
}

export function enableSingleAxisZoom(option: EChartsCoreOption, minSpan = 10): void {
  option.dataZoom = createSingleAxisDataZoom(minSpan);
}

function createSplitLine() {
  return {
    show: true,
    lineStyle: {
      type: 'solid',
      color: CHART_GRID_LINE_COLOR,
    },
  };
}

function createAxisLine() {
  return {
    show: true,
    lineStyle: {
      color: CHART_AXIS_LINE_COLOR,
    },
  };
}

function createAxisLabel() {
  return {
    color: CHART_AXIS_LABEL_COLOR,
    fontSize: 12,
    fontWeight: 600,
  };
}

function createAxisNameTextStyle() {
  return {
    color: CHART_AXIS_NAME_COLOR,
    fontSize: 12,
    fontWeight: 700,
  };
}
