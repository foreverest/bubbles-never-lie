import type { DataZoomComponentOption } from 'echarts/components';

import type { ResolvedTheme } from '../../types';
import type { EChartsCoreOption } from '../echarts';
import { formatCompactUpvoteCount } from '../formatting';
import { formatXAxisLabel } from '../timeAxis';
import type {
  GetVisibleTimeRange,
  RippleColorOption,
  SymbolSizeOption,
} from '../types';
import { CHART_MAX_ZOOM_MIN_SPAN } from '../zoom';

export const SOAP_BUBBLE_FILL_ALPHA = 0.9;
export const COMMENT_BUBBLE_FILL_ALPHA = 0.94;

type TooltipVariant = 'light' | 'dark';
type AxisLabelFormatter = (value: number) => string;
type AxisLabelAlignment = 'left' | 'center' | 'right';
type AxisLabelOverrides = Partial<{
  margin: number;
  lineHeight: number;
  textMargin: [number, number];
  hideOverlap: boolean;
  showMinLabel: boolean;
  alignMinLabel: AxisLabelAlignment;
  showMaxLabel: boolean;
  alignMaxLabel: AxisLabelAlignment;
}>;

export type ChartTheme = {
  mode: ResolvedTheme;
  backgroundColor: string;
  gridLineColor: string;
  axisLineColor: string;
  axisLabelColor: string;
  tooltipBackgroundColor: string;
  tooltipTextColor: string;
  tooltipExtraCss: string;
  tooltipVariant: TooltipVariant;
  bubbleBorderColor: string;
  bubbleEmphasisBorderColor: string;
  bubbleEmphasisShadowColor: string;
};

const CHART_THEMES: Record<ResolvedTheme, ChartTheme> = {
  light: {
    mode: 'light',
    backgroundColor: '#ffffff',
    gridLineColor: '#edf1f4',
    axisLineColor: '#c6d1d8',
    axisLabelColor: '#56636d',
    tooltipBackgroundColor: '#ffffff',
    tooltipTextColor: '#0f1419',
    tooltipExtraCss:
      'border-radius:8px;box-shadow:0 18px 44px rgba(15,23,42,0.18);padding:0;',
    tooltipVariant: 'light',
    bubbleBorderColor: 'rgba(255, 255, 255, 0.88)',
    bubbleEmphasisBorderColor: 'rgba(255, 255, 255, 0.98)',
    bubbleEmphasisShadowColor: 'rgba(15, 23, 42, 0.18)',
  },
  dark: {
    mode: 'dark',
    backgroundColor: '#171d1b',
    gridLineColor: '#28332f',
    axisLineColor: '#3a4642',
    axisLabelColor: '#a9b5af',
    tooltipBackgroundColor: '#151b19',
    tooltipTextColor: '#eef3ef',
    tooltipExtraCss:
      'border-radius:8px;box-shadow:0 18px 44px rgba(0,0,0,0.42);padding:0;',
    tooltipVariant: 'dark',
    bubbleBorderColor: 'rgba(238, 243, 239, 0.72)',
    bubbleEmphasisBorderColor: 'rgba(255, 255, 255, 0.95)',
    bubbleEmphasisShadowColor: 'rgba(0, 0, 0, 0.36)',
  },
};

const LIGHT_CHART_THEME = CHART_THEMES.light;
const CURRENT_USER_RIPPLE_SERIES_Z = 4;
const TIME_AXIS_SPLIT_NUMBER = 6;
const NARROW_TIME_AXIS_MAX_WIDTH = 240;
const NARROW_TIME_AXIS_SPLIT_NUMBER = 1;
const CURRENT_USER_RIPPLE_EFFECT = {
  brushType: 'fill',
  scale: 3,
  period: 3,
  number: 3,
} as const;

export function createChartGrid(
  overrides: Partial<{
    top: number;
    right: number;
    bottom: number;
    left: number;
  }> = {}
) {
  return {
    top: 24,
    right: 18,
    bottom: 16,
    left: 20,
    outerBoundsMode: 'same',
    outerBoundsContain: 'axisLabel',
    ...overrides,
  };
}

export function getChartTheme(
  resolvedTheme: ResolvedTheme = 'light'
): ChartTheme {
  return CHART_THEMES[resolvedTheme];
}

export function createChartTooltip(
  formatter: (params: { data?: unknown }) => string,
  theme = LIGHT_CHART_THEME
) {
  return {
    trigger: 'item',
    confine: true,
    borderWidth: 0,
    backgroundColor: theme.tooltipBackgroundColor,
    textStyle: {
      color: theme.tooltipTextColor,
    },
    extraCssText: theme.tooltipExtraCss,
    formatter,
  };
}

export function createTimeXAxis(
  startTime: number,
  endTime: number,
  getVisibleTimeRange?: GetVisibleTimeRange,
  theme = LIGHT_CHART_THEME
) {
  return {
    type: 'time',
    min: startTime,
    max: endTime,
    splitNumber: TIME_AXIS_SPLIT_NUMBER,
    splitLine: createSplitLine(theme),
    axisLine: createAxisLine(theme),
    axisTick: {
      show: false,
    },
    axisLabel: {
      color: theme.axisLabelColor,
      fontSize: 12,
      fontWeight: 600,
      margin: 14,
      textMargin: [0, 4],
      hideOverlap: true,
      formatter: (value: number, tickIndex: number) =>
        formatXAxisLabel(
          value,
          tickIndex,
          { start: startTime, end: endTime },
          getVisibleTimeRange?.() ?? null
        ),
      showMinLabel: true,
      alignMinLabel: 'right',
      showMaxLabel: true,
      alignMaxLabel: 'left',
    },
  };
}

export function enableNarrowTimeAxisMedia(option: EChartsCoreOption): void {
  option.media = [
    {
      query: {
        maxWidth: NARROW_TIME_AXIS_MAX_WIDTH,
      },
      option: {
        xAxis: {
          splitNumber: NARROW_TIME_AXIS_SPLIT_NUMBER,
        },
      },
    },
  ];
}

export function createUpvotesYAxis(theme = LIGHT_CHART_THEME) {
  return {
    type: 'value',
    minInterval: 1,
    splitLine: createSplitLine(theme),
    axisLine: createAxisLine(theme),
    axisTick: {
      show: false,
    },
    axisLabel: createAxisLabel(theme, formatCompactUpvoteCount),
  };
}

export function createValueAxis(
  {
    min,
    max,
    axisLabelOverrides,
  }: {
    min: number;
    max?: number;
    axisLabelOverrides?: AxisLabelOverrides;
  },
  theme = LIGHT_CHART_THEME
) {
  return {
    type: 'value',
    min,
    ...(max === undefined ? {} : { max }),
    minInterval: 1,
    splitLine: createSplitLine(theme),
    axisLine: createAxisLine(theme),
    axisTick: {
      show: false,
    },
    axisLabel: createAxisLabel(
      theme,
      formatCompactUpvoteCount,
      axisLabelOverrides
    ),
  };
}

export function createSingleAxisDataZoom(
  minSpan = CHART_MAX_ZOOM_MIN_SPAN
): DataZoomComponentOption {
  return {
    type: 'inside',
    xAxisIndex: 0,
    filterMode: 'none',
    minSpan,
    disabled: true,
    zoomLock: true,
    zoomOnMouseWheel: false,
    moveOnMouseMove: false,
    moveOnMouseWheel: false,
    preventDefaultMouseMove: false,
  };
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

function createSplitLine(theme: ChartTheme) {
  return {
    show: true,
    lineStyle: {
      type: 'solid',
      color: theme.gridLineColor,
    },
  };
}

function createAxisLine(theme: ChartTheme) {
  return {
    show: true,
    lineStyle: {
      color: theme.axisLineColor,
    },
  };
}

function createAxisLabel(
  theme: ChartTheme,
  formatter?: AxisLabelFormatter,
  overrides: AxisLabelOverrides = {}
) {
  const axisLabel = {
    color: theme.axisLabelColor,
    fontSize: 12,
    fontWeight: 600,
    ...overrides,
  };

  return formatter ? { ...axisLabel, formatter } : axisLabel;
}
