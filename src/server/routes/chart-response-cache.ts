const CHART_DATA_CACHE_KEY_VERSION = 'v1';

export type ChartDataCacheEndpoint =
  | 'posts'
  | 'comments'
  | 'contributors'
  | 'stats';

export type ChartDataCacheKeyOptions = {
  endpoint: ChartDataCacheEndpoint;
  postId: string | null | undefined;
  subredditName: string;
  startTime: number;
  endTime: number;
};

export const createChartDataCacheKey = ({
  endpoint,
  postId,
  subredditName,
  startTime,
  endTime,
}: ChartDataCacheKeyOptions): string =>
  [
    'chart-data',
    CHART_DATA_CACHE_KEY_VERSION,
    `endpoint=${encodeCacheKeyPart(endpoint)}`,
    `post=${encodeCacheKeyPart(normalizeCacheKeyPart(postId, 'none'))}`,
    `subreddit=${encodeCacheKeyPart(subredditName)}`,
    `start=${startTime}`,
    `end=${endTime}`,
  ].join(':');

const normalizeCacheKeyPart = (
  value: string | null | undefined,
  fallback: string
): string => {
  const normalized = value?.trim() ?? '';

  return normalized === '' ? fallback : normalized;
};

const encodeCacheKeyPart = (value: string): string => encodeURIComponent(value);
