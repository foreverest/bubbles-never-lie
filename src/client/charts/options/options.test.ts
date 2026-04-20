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
  dateRange: {
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

test('posts option uses initially idle zoom and toggles current-user ripple series', () => {
  const data = [toPostBubbleDatum(post, 'alice')];
  const option = createPostsOption(data, metadata, true);

  expect(readOptionField(option, 'dataZoom')).toEqual(
    createExpectedSingleAxisDataZoom(10)
  );
  expect(readSeries(option).length).toBe(2);

  const noRippleOption = createPostsOption(data, metadata, false);

  expect(readOptionField(noRippleOption, 'dataZoom')).toEqual(
    createExpectedSingleAxisDataZoom(10)
  );
  expect(readSeries(noRippleOption).length).toBe(1);
  expect(readOptionField(noRippleOption, 'darkMode')).toBe(false);
});

test('comments option uses initially idle single-axis zoom', () => {
  const option = createCommentsOption([], metadata, false);

  expect(readOptionField(option, 'dataZoom')).toEqual(
    createExpectedSingleAxisDataZoom(10)
  );
});

test('posts option applies dark mode and dark chart chrome without changing data colors', () => {
  const datum = toPostBubbleDatum(post, 'alice');
  const lightOption = createPostsOption([datum], metadata, false);
  const darkOption = createPostsOption(
    [datum],
    metadata,
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
    right: 18,
    bottom: 16,
    left: 20,
    outerBoundsMode: 'same',
    outerBoundsContain: 'axisLabel',
  });
  expect(grid.containLabel).toBe(undefined);

  const xAxis = readObject(readOptionField(darkOption, 'xAxis'));
  const yAxis = readObject(readOptionField(darkOption, 'yAxis'));
  expect(xAxis.splitNumber).toBe(6);
  expect(readLineColor(xAxis, 'splitLine')).toBe(darkTheme.gridLineColor);
  expect(readLineColor(xAxis, 'axisLine')).toBe(darkTheme.axisLineColor);
  expect(readObject(xAxis.axisLabel).color).toBe(darkTheme.axisLabelColor);
  expectAxisNameHidden(xAxis);
  expectAxisNameHidden(yAxis);
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

test('contributors option uses posts-style grid and x-axis zoom', () => {
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
    true
  );
  const dataZoom = readOptionField(option, 'dataZoom');
  const grid = readObject(readOptionField(option, 'grid'));
  const xAxis = readObject(readOptionField(option, 'xAxis'));
  const yAxis = readObject(readOptionField(option, 'yAxis'));

  expect(grid).toMatchObject({
    top: 24,
    right: 32,
    bottom: 16,
    left: 20,
    outerBoundsMode: 'same',
    outerBoundsContain: 'axisLabel',
  });
  expect(readObject(xAxis.axisLabel)).toMatchObject({
    margin: 14,
    lineHeight: 24,
    textMargin: [0, 4],
    hideOverlap: true,
    showMinLabel: true,
    alignMinLabel: 'right',
    showMaxLabel: true,
    alignMaxLabel: 'left',
  });
  expect(xAxis.max).toBe(undefined);
  expect(yAxis.max).toBe(undefined);
  expectAxisNameHidden(xAxis);
  expectAxisNameHidden(yAxis);
  expect(dataZoom).toEqual(createExpectedSingleAxisDataZoom(10));
  expect(readSeries(option).length).toBe(2);
});

test('upvote axes use compact tick labels', () => {
  const datum = toPostBubbleDatum(post, 'alice');
  const postsOption = createPostsOption([datum], metadata, false);
  const commentsOption = createCommentsOption([], metadata, false);
  const contributorsOption = createContributorsOption(
    [
      {
        kind: 'contributor',
        value: [1_200_000, -3_624, 7],
        contributorName: 'Alice',
        contributorAvatarUrl: null,
        contributorSubredditKarmaBucket: 3,
        postCount: 2,
        commentCount: 5,
        contributionCount: 7,
        postScore: -3_624,
        commentScore: 1_200_000,
        profileUrl: '/user/Alice',
        isCurrentUser: true,
      },
    ],
    false
  );

  expect(
    formatAxisLabel(readObject(readOptionField(postsOption, 'yAxis')), 3_624)
  ).toBe('3.6K');
  expect(
    formatAxisLabel(readObject(readOptionField(commentsOption, 'yAxis')), 2_000)
  ).toBe('2K');
  expect(
    formatAxisLabel(
      readObject(readOptionField(contributorsOption, 'xAxis')),
      1_200_000
    )
  ).toBe('1.2M');
  expect(
    formatAxisLabel(
      readObject(readOptionField(contributorsOption, 'yAxis')),
      -3_624
    )
  ).toBe('-3.6K');
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
    readOptionField(createPostsOption([datum], metadata, false), 'media')
  ).toEqual(expectedMedia);
  expect(
    readOptionField(createCommentsOption([], metadata, false), 'media')
  ).toEqual(expectedMedia);
  expect(readOptionField(createContributorsOption([], false), 'media')).toBe(
    undefined
  );
});

function createExpectedSingleAxisDataZoom(minSpan: number) {
  return {
    type: 'inside',
    xAxisIndex: 0,
    filterMode: 'none',
    minSpan,
    disabled: true,
    zoomLock: true,
    zoomOnMouseWheel: false,
    moveOnMouseMove: false,
    moveOnMouseWheel: false,
    preventDefaultMouseMove: false,
  };
}

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

function expectAxisNameHidden(axis: Record<string, unknown>): void {
  expect(axis.name).toBe(undefined);
  expect(axis.nameGap).toBe(undefined);
  expect(axis.nameLocation).toBe(undefined);
  expect(axis.nameTextStyle).toBe(undefined);
}

function formatAxisLabel(
  axis: Record<string, unknown>,
  value: number
): unknown {
  const axisLabel = readObject(axis.axisLabel);
  const formatter = axisLabel.formatter;

  expect(typeof formatter).toBe('function');

  if (typeof formatter !== 'function') {
    return null;
  }

  return formatter(value);
}

function readFirstSeriesColor(option: unknown, datum: unknown): string {
  const series = readObject(readSeries(option)[0]);
  const itemStyle = readObject(series.itemStyle);
  const color = itemStyle.color;

  expect(typeof color).toBe('function');

  return (color as (params: { data?: unknown }) => string)({ data: datum });
}
