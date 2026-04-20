import assert from 'node:assert/strict';
import { beforeEach, expect, test, vi } from 'vitest';
import {
  cacheCommentCreateEvent,
  cachePostCreateEvent,
} from '../core/event-cache';
import { triggers } from './triggers';

vi.mock('@devvit/web/server', () => ({
  context: {
    subredditName: 'ExampleSub',
  },
}));

vi.mock('../core/event-cache', () => ({
  cachePostCreateEvent: vi.fn(),
  cacheCommentCreateEvent: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(cachePostCreateEvent).mockReset();
  vi.mocked(cacheCommentCreateEvent).mockReset();
});

test('post create trigger returns success after caching event data', async () => {
  vi.mocked(cachePostCreateEvent).mockResolvedValue({
    status: 'cached',
    subredditName: 'examplesub',
    cachedPostCount: 1,
    cachedCommentCount: 0,
    refreshedContributorCount: 1,
    generatedAt: '2026-04-15T12:00:00.000Z',
  });

  const response = await triggers.request('/on-post-create', {
    method: 'POST',
    body: JSON.stringify({
      type: 'PostCreate',
      post: { id: 'post_1' },
      subreddit: { name: 'ExampleSub' },
    }),
    headers: {
      'Content-Type': 'application/json',
    },
  });
  const body: unknown = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, {
    status: 'success',
    message: 'Post create event cached for r/examplesub',
  });
  expect(cachePostCreateEvent).toHaveBeenCalledWith({
    type: 'PostCreate',
    post: { id: 'post_1' },
    subreddit: { name: 'ExampleSub' },
  });
});

test('comment create trigger returns success after caching event data', async () => {
  vi.mocked(cacheCommentCreateEvent).mockResolvedValue({
    status: 'cached',
    subredditName: 'examplesub',
    cachedPostCount: 1,
    cachedCommentCount: 1,
    refreshedContributorCount: 1,
    generatedAt: '2026-04-15T12:00:00.000Z',
  });

  const response = await triggers.request('/on-comment-create', {
    method: 'POST',
    body: JSON.stringify({
      type: 'CommentCreate',
      comment: { id: 'comment_1', postId: 'post_1' },
      post: { id: 'post_1' },
      subreddit: { name: 'ExampleSub' },
    }),
    headers: {
      'Content-Type': 'application/json',
    },
  });
  const body: unknown = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, {
    status: 'success',
    message: 'Comment create event cached for r/examplesub',
  });
  expect(cacheCommentCreateEvent).toHaveBeenCalledWith({
    type: 'CommentCreate',
    comment: { id: 'comment_1', postId: 'post_1' },
    post: { id: 'post_1' },
    subreddit: { name: 'ExampleSub' },
  });
});

test('comment create trigger returns success when event data is skipped', async () => {
  vi.mocked(cacheCommentCreateEvent).mockResolvedValue({
    status: 'skipped',
    subredditName: 'examplesub',
    cachedPostCount: 0,
    cachedCommentCount: 0,
    refreshedContributorCount: 0,
    generatedAt: '2026-04-15T12:00:00.000Z',
    skippedReason: 'missing_or_invalid_comment_payload',
  });

  const response = await triggers.request('/on-comment-create', {
    method: 'POST',
    body: JSON.stringify({
      type: 'CommentCreate',
    }),
    headers: {
      'Content-Type': 'application/json',
    },
  });
  const body: unknown = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, {
    status: 'success',
    message: 'Comment create event skipped for r/examplesub',
  });
});

test('post create trigger returns an error response when caching fails', async () => {
  vi.mocked(cachePostCreateEvent).mockRejectedValue(new Error('redis down'));

  const response = await triggers.request('/on-post-create', {
    method: 'POST',
    body: JSON.stringify({
      type: 'PostCreate',
      post: { id: 'post_1' },
    }),
    headers: {
      'Content-Type': 'application/json',
    },
  });
  const body: unknown = await response.json();

  assert.equal(response.status, 500);
  assert.deepEqual(body, {
    status: 'error',
    message: 'Failed to cache post create event',
  });
});
