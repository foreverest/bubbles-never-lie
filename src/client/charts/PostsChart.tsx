import { useCallback, useEffect, useMemo } from 'react';

import type { PostsChartDataResponse } from '../../shared/api';
import { ChartHelpOverlay } from '../components/ChartHelpOverlay';
import { ChartMyBubblesToggle } from '../components/ChartMyBubblesToggle';
import { ChartZoomControls } from '../components/ChartZoomControls';
import { useCurrentUsername } from '../hooks/useCurrentUsername';
import type { ResolvedTheme } from '../types';
import { openRedditUrl } from '../utils/navigation';
import { isPostBubbleDatum, toPostBubbleDatum } from './data';
import type { EChartsInstance } from './echarts';
import { createPostsChartHelpDetails } from './help';
import { createPostsOption } from './options/posts';
import { readVisibleTimeRange } from './timeAxis';
import type { ChartEventParams, PostBubbleDatum } from './types';
import { useEChart } from './useEChart';
import { applyChartOptionPreservingZoom } from './zoom';

export function PostsChart({
  data,
  currentUserRippleEnabled,
  onCurrentUserRippleEnabledChange,
  resolvedTheme,
}: {
  data: PostsChartDataResponse;
  currentUserRippleEnabled: boolean;
  onCurrentUserRippleEnabledChange: (enabled: boolean) => void;
  resolvedTheme: ResolvedTheme;
}) {
  const currentUsername = useCurrentUsername();
  const chartData = useMemo<PostBubbleDatum[]>(
    () => data.posts.map((post) => toPostBubbleDatum(post, currentUsername)),
    [currentUsername, data.posts]
  );
  const helpDetails = useMemo(() => createPostsChartHelpDetails(), []);
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

    applyChartOptionPreservingZoom(chart, () => {
      chart.setOption(
        createPostsOption(
          chartData,
          data,
          currentUserRippleEnabled,
          () => readVisibleTimeRange(chart),
          resolvedTheme
        ),
        true
      );
    });
  }, [chartData, chartRef, currentUserRippleEnabled, data, resolvedTheme]);

  return (
    <div className="chart-stage-shell">
      <div
        className="chart-stage"
        ref={containerRef}
        role="img"
        aria-label={`Posts in r/${data.subredditName} plotted by comments and upvotes`}
      />
      <ChartHelpOverlay details={helpDetails} />
      <div className="chart-side-controls">
        <ChartMyBubblesToggle
          enabled={currentUserRippleEnabled}
          onEnabledChange={onCurrentUserRippleEnabledChange}
        />
        <ChartZoomControls chartRef={chartRef} />
      </div>
    </div>
  );
}
