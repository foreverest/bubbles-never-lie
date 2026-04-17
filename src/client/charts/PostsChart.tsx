import { useCallback, useEffect, useMemo } from 'react';

import type { PostsChartDataResponse } from '../../shared/api';
import { useCurrentUsername } from '../hooks/useCurrentUsername';
import { openRedditUrl } from '../utils/navigation';
import { isPostBubbleDatum, toPostBubbleDatum } from './data';
import type { EChartsInstance } from './echarts';
import { createPostsOption } from './options/posts';
import { readVisibleTimeRange } from './timeAxis';
import type { ChartEventParams, PostBubbleDatum } from './types';
import { useEChart } from './useEChart';

export function PostsChart({
  data,
  zoomEnabled,
  currentUserRippleEnabled,
}: {
  data: PostsChartDataResponse;
  zoomEnabled: boolean;
  currentUserRippleEnabled: boolean;
}) {
  const currentUsername = useCurrentUsername();
  const chartData = useMemo<PostBubbleDatum[]>(
    () => data.posts.map((post) => toPostBubbleDatum(post, currentUsername)),
    [currentUsername, data.posts]
  );
  const handleChartInit = useCallback((chart: EChartsInstance) => {
    const handleChartClick = (params: ChartEventParams) => {
      const datum = isPostBubbleDatum(params.data) ? params.data : null;
      if (!datum) {
        return;
      }

      openRedditUrl(datum.permalink);
    };

    chart.on('click', handleChartClick);

    return () => {
      chart.off('click', handleChartClick);
    };
  }, []);
  const { containerRef, chartRef } = useEChart(handleChartInit);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }

    chart.setOption(
      createPostsOption(chartData, data, zoomEnabled, currentUserRippleEnabled, () =>
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
      aria-label={`Posts in r/${data.subredditName} plotted by comments and upvotes`}
    />
  );
}
