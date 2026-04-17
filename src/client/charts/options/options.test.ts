import { expect, test } from 'vitest';

import type { ChartResponseMetadata, ChartPost } from '../../../shared/api';
import { toPostBubbleDatum } from '../data';
import { createContributorsOption } from './contributors';
import { createPostsOption } from './posts';

const metadata: ChartResponseMetadata = {
  subredditName: 'example',
  subredditIconUrl: null,
  timeframe: {
    type: 'bubble-stats-timeframe',
    startDate: '2024-02-29',
    endDate: '2024-02-29',
    startIso: '2024-02-29T00:00:00.000Z',
    endIso: '2024-03-01T00:00:00.000Z',
    createdAt: '2024-02-28T12:00:00.000Z',
  },
  generatedAt: '2024-02-29T12:00:00.000Z',
};

const post: ChartPost = {
  id: 'post-1',
  title: 'Post',
  authorName: 'Alice',
  authorAvatarUrl: null,
  comments: 4,
  score: 10,
  authorSubredditKarmaBucket: 2,
  createdAt: '2024-02-29T10:00:00.000Z',
  permalink: '/r/example/comments/post-1',
};

test('posts option toggles zoom and current-user ripple series', () => {
  const data = [toPostBubbleDatum(post, 'alice')];
  const option = createPostsOption(data, metadata, true, true);

  expect(readOptionField(option, 'dataZoom')).toEqual({
    type: 'inside',
    filterMode: 'none',
    minSpan: 10,
  });
  expect(readSeries(option).length).toBe(2);

  const noRippleOption = createPostsOption(data, metadata, false, false);

  expect(readOptionField(noRippleOption, 'dataZoom')).toBe(undefined);
  expect(readSeries(noRippleOption).length).toBe(1);
});

test('contributors option uses dual-axis zoom when enabled', () => {
  const option = createContributorsOption(
    [
      {
        kind: 'contributor',
        value: [30, 20, 7],
        contributorName: 'Alice',
        contributorAvatarUrl: null,
        contributorSubredditKarmaBucket: 3,
        postCount: 2,
        commentCount: 5,
        contributionCount: 7,
        postScore: 20,
        commentScore: 30,
        profileUrl: '/user/Alice',
        isCurrentUser: true,
      },
    ],
    true,
    true
  );
  const dataZoom = readOptionField(option, 'dataZoom');

  expect(Array.isArray(dataZoom)).toBe(true);
  expect(readSeries(option).length).toBe(2);
});

function readOptionField(option: unknown, key: string): unknown {
  expect(typeof option).toBe('object');
  expect(option).not.toBe(null);
  return (option as Record<string, unknown>)[key];
}

function readSeries(option: unknown): unknown[] {
  const series = readOptionField(option, 'series');
  expect(Array.isArray(series)).toBe(true);
  return series as unknown[];
}
