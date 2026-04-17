import type { ChartResponseMetadata } from '../../../shared/api';
import { getBubbleFillColor, getCommentGroupColor } from '../colors';
import {
  getCurrentUserCommentRippleSeriesId,
  getCommentGroupSeriesId,
  groupCommentsByPost,
  isCommentBubbleDatum,
} from '../data';
import type { EChartsCoreOption } from '../echarts';
import { COMMENT_BUBBLE_SIZE } from '../sizing';
import { renderCommentTooltip } from '../tooltips';
import type { CommentBubbleDatum, GetVisibleTimeRange } from '../types';
import {
  COMMENT_BUBBLE_FILL_ALPHA,
  SOAP_BUBBLE_BORDER_COLOR,
  SOAP_BUBBLE_EMPHASIS_BORDER_COLOR,
  SOAP_BUBBLE_EMPHASIS_SHADOW_COLOR,
  createChartGrid,
  createChartTooltip,
  createCurrentUserRippleSeries,
  createTimeXAxis,
  createUpvotesYAxis,
  enableSingleAxisZoom,
} from './common';

export function createCommentsOption(
  data: CommentBubbleDatum[],
  chartData: ChartResponseMetadata,
  zoomEnabled: boolean,
  currentUserRippleEnabled: boolean,
  getVisibleTimeRange?: GetVisibleTimeRange
): EChartsCoreOption {
  const minScore = Math.min(0, ...data.map((datum) => datum.score));
  const startTime = Date.parse(chartData.timeframe.startIso);
  const endTime = Date.parse(chartData.timeframe.endIso);
  const commentGroups = groupCommentsByPost(data);
  const option: EChartsCoreOption = {
    grid: createChartGrid(),
    tooltip: createChartTooltip((params) => {
      const datum = isCommentBubbleDatum(params.data) ? params.data : null;
      return datum ? renderCommentTooltip(datum) : '';
    }),
    xAxis: createTimeXAxis(startTime, endTime, getVisibleTimeRange),
    yAxis: {
      ...createUpvotesYAxis(),
      min: minScore,
    },
    series: commentGroups.flatMap((group) => {
      const groupColor = getBubbleFillColor(
        getCommentGroupColor(group.postId),
        COMMENT_BUBBLE_FILL_ALPHA
      );
      const currentUserComments = group.comments.filter((datum) => datum.isCurrentUser);

      return [
        {
          id: getCommentGroupSeriesId(group.postId),
          name: group.postId,
          type: 'scatter',
          cursor: 'pointer',
          data: group.comments,
          symbolSize: COMMENT_BUBBLE_SIZE,
          itemStyle: {
            borderColor: SOAP_BUBBLE_BORDER_COLOR,
            borderWidth: 1,
            color: groupColor,
            opacity: 0.78,
          },
          emphasis: {
            focus: 'series',
            scale: 1.8,
            itemStyle: {
              borderColor: SOAP_BUBBLE_EMPHASIS_BORDER_COLOR,
              borderWidth: 1.5,
              opacity: 0.96,
              shadowBlur: 14,
              shadowColor: SOAP_BUBBLE_EMPHASIS_SHADOW_COLOR,
            },
          },
          blur: {
            itemStyle: {
              opacity: 0.16,
            },
          },
        },
        ...(currentUserRippleEnabled && currentUserComments.length > 0
          ? [
              createCurrentUserRippleSeries({
                id: getCurrentUserCommentRippleSeriesId(group.postId),
                name: group.postId,
                data: currentUserComments,
                symbolSize: COMMENT_BUBBLE_SIZE,
                color: groupColor,
              }),
            ]
          : []),
      ];
    }),
  };

  if (zoomEnabled) {
    enableSingleAxisZoom(option);
  }

  return option;
}
