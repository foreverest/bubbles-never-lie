import type { ChartResponseMetadata } from '../../../shared/api';
import type { ResolvedTheme } from '../../types';
import { getBubbleFillColor, getKarmaBucketColor } from '../colors';
import { isPostBubbleDatum } from '../data';
import type { EChartsCoreOption } from '../echarts';
import { getPostBubbleSize } from '../sizing';
import { renderPostTooltip } from '../tooltips';
import type { GetVisibleTimeRange, PostBubbleDatum } from '../types';
import {
  SOAP_BUBBLE_FILL_ALPHA,
  createChartGrid,
  createChartTooltip,
  createCurrentUserRippleSeries,
  createSingleAxisDataZoom,
  createTimeXAxis,
  createUpvotesYAxis,
  enableNarrowTimeAxisMedia,
  getChartTheme,
} from './common';

const CURRENT_USER_POST_RIPPLE_SERIES_ID = 'current-user-post-ripple';

export function createPostsOption(
  data: PostBubbleDatum[],
  chartData: ChartResponseMetadata,
  currentUserRippleEnabled: boolean,
  getVisibleTimeRange?: GetVisibleTimeRange,
  resolvedTheme: ResolvedTheme = 'light'
): EChartsCoreOption {
  const chartTheme = getChartTheme(resolvedTheme);
  const minScore = Math.min(0, ...data.map((datum) => datum.score));
  const maxComments = Math.max(1, ...data.map((datum) => datum.comments));
  const startTime = Date.parse(chartData.dateRange.startIso);
  const endTime = Date.parse(chartData.dateRange.endIso);
  const currentUserData = data.filter((datum) => datum.isCurrentUser);
  const getPostSymbolSize = (_value: unknown, params?: { data?: unknown }) => {
    const datum = isPostBubbleDatum(params?.data) ? params.data : null;
    const comments = datum ? Math.max(0, datum.comments) : 0;
    return getPostBubbleSize(comments, maxComments);
  };
  const getPostBubbleColor = (params: { data?: unknown }) => {
    const datum = isPostBubbleDatum(params.data) ? params.data : null;
    return getBubbleFillColor(
      getKarmaBucketColor(datum?.authorSubredditKarmaBucket ?? null),
      SOAP_BUBBLE_FILL_ALPHA
    );
  };

  const option: EChartsCoreOption = {
    backgroundColor: chartTheme.backgroundColor,
    darkMode: chartTheme.mode === 'dark',
    grid: createChartGrid(),
    tooltip: createChartTooltip((params) => {
      const datum = isPostBubbleDatum(params.data) ? params.data : null;
      return datum ? renderPostTooltip(datum, chartTheme.tooltipVariant) : '';
    }, chartTheme),
    dataZoom: createSingleAxisDataZoom(10),
    xAxis: createTimeXAxis(startTime, endTime, getVisibleTimeRange, chartTheme),
    yAxis: {
      ...createUpvotesYAxis(chartTheme),
      min: minScore,
    },
    series: [
      {
        name: 'Posts',
        type: 'scatter',
        cursor: 'pointer',
        data,
        symbolSize: getPostSymbolSize,
        itemStyle: {
          borderColor: chartTheme.bubbleBorderColor,
          borderWidth: 1.5,
          color: getPostBubbleColor,
          opacity: 0.82,
        },
        emphasis: {
          scale: 1.35,
          itemStyle: {
            borderColor: chartTheme.bubbleEmphasisBorderColor,
            borderWidth: 1.5,
            opacity: 0.96,
            shadowBlur: 14,
            shadowColor: chartTheme.bubbleEmphasisShadowColor,
          },
        },
      },
      ...(currentUserRippleEnabled && currentUserData.length > 0
        ? [
            createCurrentUserRippleSeries({
              id: CURRENT_USER_POST_RIPPLE_SERIES_ID,
              name: 'Posts',
              data: currentUserData,
              symbolSize: getPostSymbolSize,
              color: getPostBubbleColor,
            }),
          ]
        : []),
    ],
  };

  enableNarrowTimeAxisMedia(option);

  return option;
}
