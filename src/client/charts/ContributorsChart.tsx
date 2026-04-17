import { useCallback, useEffect, useMemo } from 'react';

import type { ContributorsChartDataResponse } from '../../shared/api';
import { useCurrentUsername } from '../hooks/useCurrentUsername';
import type { ResolvedTheme } from '../types';
import { openRedditUrl } from '../utils/navigation';
import { isContributorBubbleDatum, toContributorBubbleDatum } from './data';
import type { EChartsInstance } from './echarts';
import { createContributorsOption } from './options/contributors';
import type { ChartEventParams, ContributorBubbleDatum } from './types';
import { useEChart } from './useEChart';

export function ContributorsChart({
  data,
  zoomEnabled,
  currentUserRippleEnabled,
  resolvedTheme,
}: {
  data: ContributorsChartDataResponse;
  zoomEnabled: boolean;
  currentUserRippleEnabled: boolean;
  resolvedTheme: ResolvedTheme;
}) {
  const currentUsername = useCurrentUsername();
  const chartData = useMemo<ContributorBubbleDatum[]>(
    () =>
      data.contributors.map((contributor) =>
        toContributorBubbleDatum(contributor, currentUsername)
      ),
    [currentUsername, data.contributors]
  );
  const handleChartInit = useCallback((chart: EChartsInstance) => {
    const handleChartClick = (params: ChartEventParams) => {
      const datum = isContributorBubbleDatum(params.data) ? params.data : null;
      if (!datum) {
        return;
      }

      openRedditUrl(datum.profileUrl);
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
      createContributorsOption(chartData, zoomEnabled, currentUserRippleEnabled, resolvedTheme),
      true
    );
  }, [chartData, chartRef, currentUserRippleEnabled, resolvedTheme, zoomEnabled]);

  return (
    <div
      className="chart-stage"
      ref={containerRef}
      role="img"
      aria-label={`Contributors in r/${data.subredditName} plotted by total comment upvotes and total post upvotes`}
    />
  );
}
