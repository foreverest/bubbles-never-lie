import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';
import { createLogger } from './logger';

const originalLogLevel = process.env.BUBBLE_STATS_LOG_LEVEL;

afterEach(() => {
  if (originalLogLevel === undefined) {
    delete process.env.BUBBLE_STATS_LOG_LEVEL;
  } else {
    process.env.BUBBLE_STATS_LOG_LEVEL = originalLogLevel;
  }

  vi.restoreAllMocks();
});

test('formats log lines with time, level, component, message, and metadata', () => {
  process.env.BUBBLE_STATS_LOG_LEVEL = 'debug';
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const logger = createLogger('posts-api');

  logger.info('Loaded posts', {
    subredditName: 'ExampleSub',
    postCount: 12,
  });

  assert.equal(log.mock.calls.length, 1);
  const line = log.mock.calls[0]?.[0];

  assert.equal(typeof line, 'string');
  assert.match(
    line,
    /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[INFO\] \[posts-api\] Loaded posts /
  );
  assert.match(line, /"subredditName":"ExampleSub"/);
  assert.match(line, /"postCount":12/);
});

test('uses info as the default log level', () => {
  delete process.env.BUBBLE_STATS_LOG_LEVEL;
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const logger = createLogger('comments-api');

  logger.debug('Skipped debug detail');
  logger.info('Loaded comments');

  assert.equal(log.mock.calls.length, 1);
  assert.match(String(log.mock.calls[0]?.[0]), /\[INFO\] \[comments-api\] Loaded comments$/);
});

test('suppresses logs below the configured level', () => {
  process.env.BUBBLE_STATS_LOG_LEVEL = 'warn';
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const logger = createLogger('cache:posts');

  logger.info('Started refresh');
  logger.warn('Retrying refresh');
  logger.error('Refresh failed');

  assert.equal(log.mock.calls.length, 0);
  assert.equal(warn.mock.calls.length, 1);
  assert.equal(error.mock.calls.length, 1);
  assert.match(String(warn.mock.calls[0]?.[0]), /\[WARN\] \[cache:posts\] Retrying refresh$/);
  assert.match(String(error.mock.calls[0]?.[0]), /\[ERROR\] \[cache:posts\] Refresh failed$/);
});

test('silent suppresses all output', () => {
  process.env.BUBBLE_STATS_LOG_LEVEL = 'silent';
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const logger = createLogger('cache:app');

  logger.debug('Debug detail');
  logger.info('Started refresh');
  logger.warn('Retrying refresh');
  logger.error('Refresh failed');

  assert.equal(log.mock.calls.length, 0);
  assert.equal(warn.mock.calls.length, 0);
  assert.equal(error.mock.calls.length, 0);
});

test('unserializable metadata does not throw', () => {
  process.env.BUBBLE_STATS_LOG_LEVEL = 'debug';
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const logger = createLogger('comment-cache');
  const metadata: Record<string, unknown> = {};
  metadata.self = metadata;

  assert.doesNotThrow(() => {
    logger.info('Handled circular metadata', metadata);
  });
  assert.match(String(log.mock.calls[0]?.[0]), /metadata unavailable/);
});
