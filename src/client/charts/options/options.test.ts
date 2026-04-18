import { expect, test } from 'vitest';

import type { ChartResponseMetadata, ChartPost } from '../../../shared/api';
import { toPostBubbleDatum } from '../data';
import { createCommentsOption } from './comments';
import { createContributorsOption } from './contributors';
import { getChartTheme } from './common';
import { createPostsOption } from './posts';

const metadata: ChartResponseMetadata = {
  subredditName: 'example',
  subredditIconUrl: null,
  timeframe: {
    type: 'timeframe',
    startIso: '2024-02-29T00:00:00.000Z',
    endIso: '2024-03-01T00:00:00.000Z',
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
  expect(readOptionField(noRippleOption, 'darkMode')).toBe(false);
});

test('posts option applies dark mode and dark chart chrome without changing data colors', () => {
  const datum = toPostBubbleDatum(post, 'alice');
  const lightOption = createPostsOption([datum], metadata, false, false);
  const darkOption = createPostsOption(
    [datum],
    metadata,
    false,
    false,
    undefined,
    'dark'
  );
  const darkTheme = getChartTheme('dark');

  expect(readOptionField(darkOption, 'darkMode')).toBe(true);
  expect(readOptionField(darkOption, 'backgroundColor')).toBe(
    darkTheme.backgroundColor
  );

  const grid = readObject(readOptionField(darkOption, 'grid'));
  expect(grid).toMatchObject({
    top: 24,
    right: 10,
    bottom: 16,
    left: 20,
    outerBoundsMode: 'same',
    outerBoundsContain: 'axisLabel',
  });
  expect(grid.containLabel).toBe(undefined);

  const xAxis = readObject(readOptionField(darkOption, 'xAxis'));
  expect(xAxis.splitNumber).toBe(6);
  expect(readLineColor(xAxis, 'splitLine')).toBe(darkTheme.gridLineColor);
  expect(readLineColor(xAxis, 'axisLine')).toBe(darkTheme.axisLineColor);
  expect(readObject(xAxis.axisLabel).color).toBe(darkTheme.axisLabelColor);
  expect(readObject(xAxis.axisLabel)).toMatchObject({
    hideOverlap: true,
    textMargin: [0, 4],
    showMinLabel: true,
    alignMinLabel: 'right',
    showMaxLabel: true,
    alignMaxLabel: 'left',
  });

  const tooltip = readObject(readOptionField(darkOption, 'tooltip'));
  expect(tooltip.backgroundColor).toBe(darkTheme.tooltipBackgroundColor);
  expect(readObject(tooltip.textStyle).color).toBe(darkTheme.tooltipTextColor);

  expect(readFirstSeriesColor(lightOption, datum)).toBe(
    readFirstSeriesColor(darkOption, datum)
  );
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

test('time charts use a narrow axis media override without changing contributors', () => {
  const datum = toPostBubbleDatum(post, 'alice');
  const expectedMedia = [
    {
      query: {
        maxWidth: 240,
      },
      option: {
        xAxis: {
          splitNumber: 1,
        },
      },
    },
  ];

  expect(
    readOptionField(createPostsOption([datum], metadata, false, false), 'media')
  ).toEqual(expectedMedia);
  expect(
    readOptionField(createCommentsOption([], metadata, false, false), 'media')
  ).toEqual(expectedMedia);
  expect(
    readOptionField(createContributorsOption([], false, false), 'media')
  ).toBe(undefined);
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

function readObject(value: unknown): Record<string, unknown> {
  expect(typeof value).toBe('object');
  expect(value).not.toBe(null);
  return value as Record<string, unknown>;
}

function readLineColor(axis: Record<string, unknown>, key: string): unknown {
  const axisSection = readObject(axis[key]);
  return readObject(axisSection.lineStyle).color;
}

function readFirstSeriesColor(option: unknown, datum: unknown): string {
  const series = readObject(readSeries(option)[0]);
  const itemStyle = readObject(series.itemStyle);
  const color = itemStyle.color;

  expect(typeof color).toBe('function');

  return (color as (params: { data?: unknown }) => string)({ data: datum });
}
