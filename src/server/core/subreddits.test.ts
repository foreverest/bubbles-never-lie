import { expect, test } from 'vitest';
import {
  resolveActiveRefreshSubredditName,
  resolveAppEnvironmentName,
  resolveChartDataSubredditName,
} from './subreddits';

test('app environment is development only in the dev subreddit', () => {
  expect(resolveAppEnvironmentName('bubblesneverlie_dev')).toBe('development');
  expect(resolveAppEnvironmentName('ExampleSub')).toBe('production');
});

test('active refresh subreddit falls back to the current subreddit when override is unset', () => {
  expect(resolveActiveRefreshSubredditName('ExampleSub', undefined)).toBe(
    'examplesub'
  );
});

test('active refresh subreddit falls back to the current subreddit when override is blank', () => {
  expect(resolveActiveRefreshSubredditName('bubblesneverlie_dev', '   ')).toBe(
    'bubblesneverlie_dev'
  );
});

test('active refresh subreddit ignores the override outside the dev subreddit', () => {
  expect(resolveActiveRefreshSubredditName('ExampleSub', ' r/FooBar ')).toBe(
    'examplesub'
  );
});

test('active refresh subreddit normalizes the override value', () => {
  expect(
    resolveActiveRefreshSubredditName('bubblesneverlie_dev', ' r/FooBar ')
  ).toBe('foobar');
});

test('active refresh subreddit uses the configured development override by default', () => {
  expect(resolveActiveRefreshSubredditName('bubblesneverlie_dev')).toBe(
    'redditstock'
  );
});

test('chart data subreddit ignores the refresh-source override when post data does not specify one', () => {
  expect(resolveChartDataSubredditName('ExampleSub', undefined)).toBe(
    'examplesub'
  );
  expect(resolveChartDataSubredditName('ExampleSub', '   ')).toBe('examplesub');
});

test('chart data subreddit ignores a post-level override outside the dev subreddit', () => {
  expect(resolveChartDataSubredditName('ExampleSub', ' r/AskReddit ')).toBe(
    'examplesub'
  );
});

test('chart data subreddit uses the normalized post-level override in the dev subreddit', () => {
  expect(
    resolveChartDataSubredditName('bubblesneverlie_dev', ' r/AskReddit ')
  ).toBe('askreddit');
});

test('chart data subreddit falls back to the current dev subreddit when override is blank', () => {
  expect(resolveChartDataSubredditName('bubblesneverlie_dev', '   ')).toBe(
    'bubblesneverlie_dev'
  );
});

test('chart data subreddit falls back to the current dev subreddit when override is unset', () => {
  expect(resolveChartDataSubredditName('bubblesneverlie_dev', undefined)).toBe(
    'bubblesneverlie_dev'
  );
});

test('chart data subreddit ignores post-level overrides for non-dev bubble charts even if stored', () => {
  expect(
    resolveChartDataSubredditName('ExampleSub', 'r/bubblesneverlie_dev')
  ).toBe('examplesub');
});

test('active refresh subreddit ignores the configured development override outside the dev subreddit', () => {
  expect(resolveActiveRefreshSubredditName('ExampleSub')).toBe('examplesub');
});

test('chart data subreddit only allows bubblesneverlie_dev to be overridden', () => {
  expect(resolveChartDataSubredditName('bubblesneverlie_dev', 'r/funny')).toBe(
    'funny'
  );
  expect(resolveChartDataSubredditName('AnotherSub', 'r/funny')).toBe(
    'anothersub'
  );
});
