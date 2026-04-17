import type { ChartResponseMetadata } from '../../../shared/api';
import { getBubbleFillColor, getKarmaBucketColor } from '../colors';
import { isPostBubbleDatum } from '../data';
import type { EChartsCoreOption } from '../echarts';
import { getPostBubbleSize } from '../sizing';
import { renderPostTooltip } from '../tooltips';
import type { GetVisibleTimeRange, PostBubbleDatum } from '../types';
import {
  SOAP_BUBBLE_BORDER_COLOR,
  SOAP_BUBBLE_EMPHASIS_BORDER_COLOR,
  SOAP_BUBBLE_EMPHASIS_SHADOW_COLOR,
  SOAP_BUBBLE_FILL_ALPHA,
  createChartGrid,
  createChartTooltip,
  createCurrentUserRippleSeries,
  createTimeXAxis,
  createUpvotesYAxis,
  enableSingleAxisZoom,
} from './common';

const CURRENT_USER_POST_RIPPLE_SERIES_ID = 'current-user-post-ripple';

export function createPostsOption(
  data: PostBubbleDatum[],
  chartData: ChartResponseMetadata,
  zoomEnabled: boolean,
  currentUserRippleEnabled: boolean,
  getVisibleTimeRange?: GetVisibleTimeRange
): EChartsCoreOption {
  const minScore = Math.min(0, ...data.map((datum) => datum.score));
  const maxComments = Math.max(1, ...data.map((datum) => datum.comments));
  const startTime = Date.parse(chartData.timeframe.startIso);
  const endTime = Date.parse(chartData.timeframe.endIso);
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
    grid: createChartGrid(),
    tooltip: createChartTooltip((params) => {
      const datum = isPostBubbleDatum(params.data) ? params.data : null;
      return datum ? renderPostTooltip(datum) : '';
    }),
    xAxis: createTimeXAxis(startTime, endTime, getVisibleTimeRange),
    yAxis: {
      ...createUpvotesYAxis(),
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
          borderColor: SOAP_BUBBLE_BORDER_COLOR,
          borderWidth: 1.5,
          color: getPostBubbleColor,
          opacity: 0.82,
        },
        emphasis: {
          scale: 1.35,
          itemStyle: {
            borderColor: SOAP_BUBBLE_EMPHASIS_BORDER_COLOR,
            borderWidth: 1.5,
            opacity: 0.96,
            shadowBlur: 14,
            shadowColor: SOAP_BUBBLE_EMPHASIS_SHADOW_COLOR,
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

  if (zoomEnabled) {
    enableSingleAxisZoom(option);
  }

  return option;
}
