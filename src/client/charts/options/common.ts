import type { ResolvedTheme } from '../../types';
import type { EChartsCoreOption } from '../echarts';
import { formatCompactUpvoteCount } from '../formatting';
import { formatXAxisLabel } from '../timeAxis';
import type {
  GetVisibleTimeRange,
  RippleColorOption,
  SymbolSizeOption,
} from '../types';

export const SOAP_BUBBLE_FILL_ALPHA = 0.9;
export const COMMENT_BUBBLE_FILL_ALPHA = 0.94;

type TooltipVariant = 'light' | 'dark';
type AxisLabelFormatter = (value: number) => string;

export type ChartTheme = {
  mode: ResolvedTheme;
  backgroundColor: string;
  gridLineColor: string;
  axisLineColor: string;
  axisLabelColor: string;
  axisNameColor: string;
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
    axisNameColor: '#697780',
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
    axisNameColor: '#b7c2bd',
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
    right: 10,
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
    name: 'Upvotes',
    nameLocation: 'middle',
    nameGap: 40,
    nameTextStyle: createAxisNameTextStyle(theme),
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
    name,
    min,
    max,
    nameGap,
  }: {
    name: string;
    min: number;
    max: number;
    nameGap: number;
  },
  theme = LIGHT_CHART_THEME
) {
  return {
    name,
    nameLocation: 'middle',
    nameGap,
    nameTextStyle: createAxisNameTextStyle(theme),
    type: 'value',
    min,
    max,
    minInterval: 1,
    splitLine: createSplitLine(theme),
    axisLine: createAxisLine(theme),
    axisTick: {
      show: false,
    },
    axisLabel: createAxisLabel(theme, formatCompactUpvoteCount),
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

export function enableSingleAxisZoom(
  option: EChartsCoreOption,
  minSpan = 10
): void {
  option.dataZoom = createSingleAxisDataZoom(minSpan);
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

function createAxisLabel(theme: ChartTheme, formatter?: AxisLabelFormatter) {
  const axisLabel = {
    color: theme.axisLabelColor,
    fontSize: 12,
    fontWeight: 600,
  };

  return formatter ? { ...axisLabel, formatter } : axisLabel;
}

function createAxisNameTextStyle(theme: ChartTheme) {
  return {
    color: theme.axisNameColor,
    fontSize: 12,
    fontWeight: 700,
  };
}
