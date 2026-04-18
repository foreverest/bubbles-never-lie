import type { ResolvedTheme } from '../../types';
import { getBubbleFillColor, getKarmaBucketColor } from '../colors';
import { isContributorBubbleDatum } from '../data';
import type { EChartsCoreOption } from '../echarts';
import { getContributorBubbleSize } from '../sizing';
import { renderContributorTooltip } from '../tooltips';
import type { ContributorBubbleDatum } from '../types';
import {
  SOAP_BUBBLE_FILL_ALPHA,
  createChartGrid,
  createChartTooltip,
  createCurrentUserRippleSeries,
  createDualAxisDataZoom,
  createValueAxis,
  getChartTheme,
} from './common';

const CURRENT_USER_CONTRIBUTOR_RIPPLE_SERIES_ID =
  'current-user-contributor-ripple';
const CONTRIBUTOR_ENCODE = {
  x: 0,
  y: 1,
} as const;

export function createContributorsOption(
  data: ContributorBubbleDatum[],
  zoomEnabled: boolean,
  currentUserRippleEnabled: boolean,
  resolvedTheme: ResolvedTheme = 'light'
): EChartsCoreOption {
  const chartTheme = getChartTheme(resolvedTheme);
  const minCommentScore = Math.min(
    0,
    ...data.map((datum) => datum.commentScore)
  );
  const maxCommentScore = Math.max(
    0,
    ...data.map((datum) => datum.commentScore)
  );
  const minPostScore = Math.min(0, ...data.map((datum) => datum.postScore));
  const maxPostScore = Math.max(0, ...data.map((datum) => datum.postScore));
  const maxContributionCount = Math.max(
    0,
    ...data.map((datum) => datum.contributionCount)
  );
  const currentUserData = data.filter((datum) => datum.isCurrentUser);
  const getContributorSymbolSize = (
    _value: unknown,
    params?: { data?: unknown }
  ) => {
    const datum = isContributorBubbleDatum(params?.data) ? params.data : null;
    return getContributorBubbleSize(
      datum?.contributionCount ?? 0,
      maxContributionCount
    );
  };
  const getContributorBubbleColor = (params: { data?: unknown }) => {
    const datum = isContributorBubbleDatum(params.data) ? params.data : null;
    return getBubbleFillColor(
      getKarmaBucketColor(datum?.contributorSubredditKarmaBucket ?? null),
      SOAP_BUBBLE_FILL_ALPHA
    );
  };

  const option: EChartsCoreOption = {
    backgroundColor: chartTheme.backgroundColor,
    darkMode: chartTheme.mode === 'dark',
    grid: createChartGrid({ bottom: 44, left: 52 }),
    tooltip: createChartTooltip((params) => {
      const datum = isContributorBubbleDatum(params.data) ? params.data : null;
      return datum
        ? renderContributorTooltip(datum, chartTheme.tooltipVariant)
        : '';
    }, chartTheme),
    xAxis: createValueAxis(
      {
        name: 'Comment Upvotes',
        min: minCommentScore,
        max: maxCommentScore,
        nameGap: 30,
      },
      chartTheme
    ),
    yAxis: createValueAxis(
      {
        name: 'Post Upvotes',
        min: minPostScore,
        max: maxPostScore,
        nameGap: 40,
      },
      chartTheme
    ),
    series: [
      {
        name: 'Contributors',
        type: 'scatter',
        cursor: 'pointer',
        data,
        encode: CONTRIBUTOR_ENCODE,
        symbolSize: getContributorSymbolSize,
        itemStyle: {
          borderColor: chartTheme.bubbleBorderColor,
          borderWidth: 1.5,
          color: getContributorBubbleColor,
          opacity: 0.82,
        },
        emphasis: {
          scale: 1.35,
          itemStyle: {
            borderColor: chartTheme.bubbleEmphasisBorderColor,
            borderWidth: 2,
            opacity: 0.96,
            shadowBlur: 14,
            shadowColor: chartTheme.bubbleEmphasisShadowColor,
          },
        },
      },
      ...(currentUserRippleEnabled && currentUserData.length > 0
        ? [
            createCurrentUserRippleSeries({
              id: CURRENT_USER_CONTRIBUTOR_RIPPLE_SERIES_ID,
              name: 'Contributors',
              data: currentUserData,
              symbolSize: getContributorSymbolSize,
              color: getContributorBubbleColor,
              encode: CONTRIBUTOR_ENCODE,
            }),
          ]
        : []),
    ],
  };

  if (zoomEnabled) {
    option.dataZoom = createDualAxisDataZoom();
  }

  return option;
}
