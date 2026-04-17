import { useCallback, useEffect, useMemo, useRef } from 'react';

import type { CommentsChartDataResponse } from '../../shared/api';
import { useCurrentUsername } from '../hooks/useCurrentUsername';
import { openRedditUrl } from '../utils/navigation';
import { getCommentGroupSeriesId, isCommentBubbleDatum, toCommentBubbleDatum } from './data';
import type { EChartsInstance } from './echarts';
import { createCommentsOption } from './options/comments';
import { COMMENT_BUBBLE_SIZE, COMMENT_GROUP_EMPHASIZED_BUBBLE_SIZE } from './sizing';
import { readVisibleTimeRange } from './timeAxis';
import type { ChartEventParams, CommentBubbleDatum } from './types';
import { useEChart } from './useEChart';

export function CommentsChart({
  data,
  zoomEnabled,
  currentUserRippleEnabled,
}: {
  data: CommentsChartDataResponse;
  zoomEnabled: boolean;
  currentUserRippleEnabled: boolean;
}) {
  const emphasizedCommentGroupRef = useRef<string | null>(null);
  const currentUsername = useCurrentUsername();
  const chartData = useMemo<CommentBubbleDatum[]>(
    () => data.comments.map((comment) => toCommentBubbleDatum(comment, currentUsername)),
    [currentUsername, data.comments]
  );
  const handleChartInit = useCallback((chart: EChartsInstance) => {
    let clearCommentGroupEmphasisFrame = 0;

    const setEmphasizedCommentGroup = (nextPostId: string | null) => {
      const previousPostId = emphasizedCommentGroupRef.current;
      if (previousPostId === nextPostId) {
        return;
      }

      const series: { id: string; symbolSize: number }[] = [];
      if (previousPostId) {
        series.push({
          id: getCommentGroupSeriesId(previousPostId),
          symbolSize: COMMENT_BUBBLE_SIZE,
        });
      }

      if (nextPostId) {
        series.push({
          id: getCommentGroupSeriesId(nextPostId),
          symbolSize: COMMENT_GROUP_EMPHASIZED_BUBBLE_SIZE,
        });
      }

      emphasizedCommentGroupRef.current = nextPostId;

      if (series.length > 0) {
        chart.setOption({ series });
      }
    };

    const cancelPendingCommentGroupClear = () => {
      if (!clearCommentGroupEmphasisFrame) {
        return;
      }

      window.cancelAnimationFrame(clearCommentGroupEmphasisFrame);
      clearCommentGroupEmphasisFrame = 0;
    };

    const handleChartClick = (params: ChartEventParams) => {
      const datum = isCommentBubbleDatum(params.data) ? params.data : null;
      if (!datum) {
        return;
      }

      openRedditUrl(datum.permalink);
    };

    const handleCommentMouseOver = (params: ChartEventParams) => {
      const datum = isCommentBubbleDatum(params.data) ? params.data : null;
      if (!datum) {
        return;
      }

      cancelPendingCommentGroupClear();
      setEmphasizedCommentGroup(datum.postId);
    };

    const handleCommentMouseOut = (params: ChartEventParams) => {
      const datum = isCommentBubbleDatum(params.data) ? params.data : null;
      if (!datum) {
        return;
      }

      cancelPendingCommentGroupClear();
      clearCommentGroupEmphasisFrame = window.requestAnimationFrame(() => {
        clearCommentGroupEmphasisFrame = 0;

        if (emphasizedCommentGroupRef.current === datum.postId) {
          setEmphasizedCommentGroup(null);
        }
      });
    };

    const handleCommentGlobalOut = () => {
      cancelPendingCommentGroupClear();
      setEmphasizedCommentGroup(null);
    };

    chart.on('click', handleChartClick);
    chart.on('mouseover', handleCommentMouseOver);
    chart.on('mouseout', handleCommentMouseOut);
    chart.on('globalout', handleCommentGlobalOut);

    return () => {
      cancelPendingCommentGroupClear();
      chart.off('click', handleChartClick);
      chart.off('mouseover', handleCommentMouseOver);
      chart.off('mouseout', handleCommentMouseOut);
      chart.off('globalout', handleCommentGlobalOut);
    };
  }, []);
  const { containerRef, chartRef } = useEChart(handleChartInit);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }

    emphasizedCommentGroupRef.current = null;
    chart.setOption(
      createCommentsOption(chartData, data, zoomEnabled, currentUserRippleEnabled, () =>
        readVisibleTimeRange(chart)
      ),
      true
    );
  }, [chartData, chartRef, currentUserRippleEnabled, data, zoomEnabled]);

  return (
    <div
      className="chart-stage"
      ref={containerRef}
      role="img"
      aria-label={`Comments in r/${data.subredditName} plotted by creation time and upvotes`}
    />
  );
}
