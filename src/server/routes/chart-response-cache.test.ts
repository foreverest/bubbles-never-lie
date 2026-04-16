import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createChartDataCacheKey, type ChartDataCacheKeyOptions } from './chart-response-cache';

const baseOptions: ChartDataCacheKeyOptions = {
  endpoint: 'posts',
  postId: 't3_chart',
  subredditName: 'ExampleSub',
  startTime: Date.parse('2026-04-15T10:00:00.000Z'),
  endTime: Date.parse('2026-04-16T10:00:00.000Z'),
};

test('chart data cache keys distinguish endpoint, post, subreddit, and timeframe', () => {
  const keys = [
    createChartDataCacheKey(baseOptions),
    createChartDataCacheKey({ ...baseOptions, endpoint: 'comments' }),
    createChartDataCacheKey({ ...baseOptions, postId: 't3_other_chart' }),
    createChartDataCacheKey({ ...baseOptions, postId: undefined }),
    createChartDataCacheKey({ ...baseOptions, subredditName: 'OtherSub' }),
    createChartDataCacheKey({ ...baseOptions, startTime: baseOptions.startTime + 1 }),
    createChartDataCacheKey({ ...baseOptions, endTime: baseOptions.endTime + 1 }),
  ];

  assert.equal(new Set(keys).size, keys.length);
});

test('chart data cache keys normalize missing post IDs and encode separators', () => {
  const key = createChartDataCacheKey({
    ...baseOptions,
    postId: ' ',
    subredditName: 'name:with/slash',
  });

  assert.match(key, /post=none/);
  assert.match(key, /subreddit=name%3Awith%2Fslash/);
  assert.doesNotMatch(key, /subreddit=name:with\/slash/);
});
