import assert from 'node:assert/strict';
import type { Comment } from '@devvit/web/server';
import { test } from 'vitest';
import {
  COMMENT_GIF_PREVIEW_MARKER,
  COMMENT_IMAGE_PREVIEW_MARKER,
} from '../../shared/api';
import { createDataLayer, getDataKeys, type RedisDataClient } from '../data';
import {
  processCommentCacheQueue,
  refreshCommentCache,
  type CommentCacheQueueProcessDependencies,
  type CommentCacheRefreshDependencies,
} from './comment-cache';

class FakeRedisClient implements RedisDataClient {
  readonly hashes = new Map<string, Map<string, string>>();
  readonly sortedSets = new Map<string, Map<string, number>>();

  async hGet(key: string, field: string): Promise<string | undefined> {
    return this.hashes.get(key)?.get(field);
  }

  async hMGet(key: string, fields: string[]): Promise<(string | null)[]> {
    const hash = this.hashes.get(key);

    return fields.map((field) => hash?.get(field) ?? null);
  }

  async hSet(
    key: string,
    fieldValues: { [field: string]: string }
  ): Promise<number> {
    const hash = this.hashes.get(key) ?? new Map<string, string>();
    let addedFieldCount = 0;

    Object.entries(fieldValues).forEach(([field, value]) => {
      if (!hash.has(field)) {
        addedFieldCount += 1;
      }

      hash.set(field, value);
    });

    this.hashes.set(key, hash);
    return addedFieldCount;
  }

  async del(...keys: string[]): Promise<void> {
    keys.forEach((key) => {
      this.hashes.delete(key);
      this.sortedSets.delete(key);
    });
  }

  async zAdd(
    key: string,
    ...members: Array<{ member: string; score: number }>
  ): Promise<number> {
    const sortedSet = this.sortedSets.get(key) ?? new Map<string, number>();
    let addedMemberCount = 0;

    members.forEach(({ member, score }) => {
      if (!sortedSet.has(member)) {
        addedMemberCount += 1;
      }

      sortedSet.set(member, score);
    });

    this.sortedSets.set(key, sortedSet);
    return addedMemberCount;
  }

  async zRange(
    key: string,
    start: number | string,
    stop: number | string,
    options?: Parameters<RedisDataClient['zRange']>[3]
  ): Promise<Array<{ member: string; score: number }>> {
    const sortedMembers = this.readSortedSet(key);

    if (options?.by === 'rank') {
      const rankedMembers = options.reverse
        ? sortedMembers.toReversed()
        : sortedMembers;
      const startRank = Number(start);
      const stopRank = Number(stop);
      const endRank = stopRank < 0 ? rankedMembers.length + stopRank : stopRank;

      return rankedMembers.slice(startRank, endRank + 1);
    }

    const startScore = Number(start);
    const stopScore = Number(stop);

    return sortedMembers.filter(
      ({ score }) => score >= startScore && score <= stopScore
    );
  }

  async zRem(key: string, members: string[]): Promise<number> {
    const sortedSet = this.sortedSets.get(key);

    if (!sortedSet) {
      return 0;
    }

    let removedMemberCount = 0;
    members.forEach((member) => {
      if (sortedSet.delete(member)) {
        removedMemberCount += 1;
      }
    });

    return removedMemberCount;
  }

  readSortedSet(key: string): Array<{ member: string; score: number }> {
    return [...(this.sortedSets.get(key)?.entries() ?? [])]
      .map(([member, score]) => ({ member, score }))
      .sort((a, b) => a.score - b.score || a.member.localeCompare(b.member));
  }
}

type GetCommentsOptions = {
  postId: `t3_${string}`;
  commentId?: `t1_${string}`;
  limit?: number;
  pageSize?: number;
};

class FakeRedditClient {
  readonly calls: GetCommentsOptions[] = [];
  readonly responses = new Map<string, Comment[] | Error>();

  setResponse(
    postId: `t3_${string}`,
    commentId: `t1_${string}` | undefined,
    response: Comment[] | Error
  ): void {
    this.responses.set(createResponseKey(postId, commentId), response);
  }

  getComments(options: GetCommentsOptions) {
    this.calls.push({ ...options });

    return {
      all: async () => {
        const response = this.responses.get(
          createResponseKey(options.postId, options.commentId)
        );

        if (response instanceof Error) {
          throw response;
        }

        return response ?? [];
      },
    };
  }
}

test('refreshCommentCache resets queues and seeds post ids with timestamp batch ordering', async () => {
  const redisClient = new FakeRedisClient();
  const keys = getDataKeys('ExampleSub');

  await redisClient.zAdd(keys.commentRefreshPostQueue, {
    member: 't3_stale',
    score: 1,
  });
  await redisClient.zAdd(keys.commentRefreshCommentQueue, {
    member: 't3_stale:t1_comment',
    score: 1,
  });

  const result = await refreshCommentCache('ExampleSub', {
    redisClient: redisClient as CommentCacheRefreshDependencies['redisClient'],
    readParentPostIds: async () => ['t3_post_3', 't3_post_2', 't3_post_1'],
    now: () => 1_000,
  });

  assert.deepEqual(result, {
    parentPostCount: 3,
    enqueuedPostCount: 3,
    generatedAt: '1970-01-01T00:00:01.000Z',
  });
  assert.deepEqual(redisClient.readSortedSet(keys.commentRefreshPostQueue), [
    { member: 't3_post_3', score: 1_000_000 },
    { member: 't3_post_2', score: 1_000_001 },
    { member: 't3_post_1', score: 1_000_002 },
  ]);
  assert.deepEqual(
    redisClient.readSortedSet(keys.commentRefreshCommentQueue),
    []
  );
});

test('processCommentCacheQueue prefers comment queue items before post queue items', async () => {
  const redisClient = new FakeRedisClient();
  const redditClient = new FakeRedditClient();
  const dataLayer = createDataLayer('ExampleSub', redisClient);
  const keys = getDataKeys('ExampleSub');

  await redisClient.zAdd(keys.commentRefreshCommentQueue, {
    member: 't3_post_1:t1_parent',
    score: 1,
  });
  await redisClient.zAdd(keys.commentRefreshPostQueue, {
    member: 't3_post_2',
    score: 1,
  });
  redditClient.setResponse('t3_post_1', 't1_parent', [
    createComment('t1_child', 't3_post_1'),
  ]);

  const result = await processCommentCacheQueue(
    { subredditName: 'ExampleSub', maxDurationMs: 25_000 },
    {
      redisClient:
        redisClient as CommentCacheQueueProcessDependencies['redisClient'],
      redditClient:
        redditClient as unknown as CommentCacheQueueProcessDependencies['redditClient'],
      dataLayer,
      now: createNow([0, 0, 0, 30_000]),
    }
  );

  assert.deepEqual(
    redditClient.calls.map(({ postId, commentId }) => ({ postId, commentId })),
    [{ postId: 't3_post_1', commentId: 't1_parent' }]
  );
  assert.equal(result.processedCommentParentCount, 1);
  assert.equal(result.processedPostCount, 0);
  assert.equal(result.enqueuedCommentParentCount, 1);
  assert.deepEqual(redisClient.readSortedSet(keys.commentRefreshPostQueue), [
    { member: 't3_post_2', score: 1 },
  ]);
});

test('processCommentCacheQueue caches post comments and fetches child comments with postId and commentId', async () => {
  const redisClient = new FakeRedisClient();
  const redditClient = new FakeRedditClient();
  const dataLayer = createDataLayer('ExampleSub', redisClient);
  const keys = getDataKeys('ExampleSub');

  await redisClient.zAdd(keys.commentRefreshPostQueue, {
    member: 't3_post_1',
    score: 1,
  });
  redditClient.setResponse('t3_post_1', undefined, [
    createComment('t1_parent', 't3_post_1', 'Parent body'),
  ]);
  redditClient.setResponse('t3_post_1', 't1_parent', [
    createComment('t1_child', 't3_post_1', 'Child body'),
  ]);

  const result = await processCommentCacheQueue(
    { subredditName: 'ExampleSub', maxDurationMs: 25_000 },
    {
      redisClient:
        redisClient as CommentCacheQueueProcessDependencies['redisClient'],
      redditClient:
        redditClient as unknown as CommentCacheQueueProcessDependencies['redditClient'],
      dataLayer,
      now: () => 0,
    }
  );
  const cachedComments = await dataLayer.comments.getByIds([
    't1_parent',
    't1_child',
  ]);

  assert.deepEqual(
    redditClient.calls.map(({ postId, commentId }) => ({ postId, commentId })),
    [
      { postId: 't3_post_1', commentId: undefined },
      { postId: 't3_post_1', commentId: 't1_parent' },
      { postId: 't3_post_1', commentId: 't1_child' },
    ]
  );
  assert.equal(result.processedPostCount, 1);
  assert.equal(result.processedCommentParentCount, 2);
  assert.equal(result.fetchedCommentCount, 2);
  assert.equal(result.cachedCommentCount, 2);
  assert.deepEqual(
    cachedComments.map(({ id, postId, bodyPreview }) => ({
      id,
      postId,
      bodyPreview,
    })),
    [
      {
        id: 't1_parent',
        postId: 't3_post_1',
        bodyPreview: 'Parent body',
      },
      {
        id: 't1_child',
        postId: 't3_post_1',
        bodyPreview: 'Child body',
      },
    ]
  );
});

test('processCommentCacheQueue stores inline media markers before truncating text', async () => {
  const redisClient = new FakeRedisClient();
  const redditClient = new FakeRedditClient();
  const dataLayer = createDataLayer('ExampleSub', redisClient);
  const keys = getDataKeys('ExampleSub');

  await redisClient.zAdd(keys.commentRefreshPostQueue, {
    member: 't3_post_1',
    score: 1,
  });
  redditClient.setResponse('t3_post_1', undefined, [
    createComment('t1_gif', 't3_post_1', '![gif](giphy|VCn7Example)'),
    createComment(
      't1_image',
      't3_post_1',
      'https://preview.redd.it/april-13-2026-daily-rddt-discussion-thread-v0-e5rpml9730vg1.jpeg?width=770&format=pjpg&auto=webp&s=84de852e1c1a2410d7df4d47c6ac283fbf3efc6c'
    ),
    createComment(
      't1_middle_gif',
      't3_post_1',
      'text before ![gif](giphy|Middle) text after'
    ),
    createComment(
      't1_middle_image',
      't3_post_1',
      'text before https://example.com/photo.jpg text after'
    ),
    createComment(
      't1_multiple_media',
      't3_post_1',
      '![gif](giphy|First) https://example.com/photo.jpg'
    ),
    createComment(
      't1_late_media',
      't3_post_1',
      'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ ![gif](giphy|Late)'
    ),
    createComment('t1_literal_gif', 't3_post_1', 'GIF comment'),
    createComment(
      't1_long_text',
      't3_post_1',
      'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
    ),
    createComment(
      't1_long_mixed',
      't3_post_1',
      'Hello ![gif](giphy|Long) abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
    ),
  ]);

  await processCommentCacheQueue(
    { subredditName: 'ExampleSub', maxDurationMs: 25_000 },
    {
      redisClient:
        redisClient as CommentCacheQueueProcessDependencies['redisClient'],
      redditClient:
        redditClient as unknown as CommentCacheQueueProcessDependencies['redditClient'],
      dataLayer,
      now: () => 0,
    }
  );
  const cachedComments = await dataLayer.comments.getByIds([
    't1_gif',
    't1_image',
    't1_middle_gif',
    't1_middle_image',
    't1_multiple_media',
    't1_late_media',
    't1_literal_gif',
    't1_long_text',
    't1_long_mixed',
  ]);

  assert.deepEqual(
    cachedComments.map(({ id, bodyPreview }) => ({
      id,
      bodyPreview,
    })),
    [
      { id: 't1_gif', bodyPreview: COMMENT_GIF_PREVIEW_MARKER },
      { id: 't1_image', bodyPreview: COMMENT_IMAGE_PREVIEW_MARKER },
      {
        id: 't1_middle_gif',
        bodyPreview: `text before ${COMMENT_GIF_PREVIEW_MARKER} text after`,
      },
      {
        id: 't1_middle_image',
        bodyPreview: `text before ${COMMENT_IMAGE_PREVIEW_MARKER} text after`,
      },
      {
        id: 't1_multiple_media',
        bodyPreview: COMMENT_GIF_PREVIEW_MARKER,
      },
      {
        id: 't1_late_media',
        bodyPreview: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTU...',
      },
      {
        id: 't1_literal_gif',
        bodyPreview: 'GIF comment',
      },
      {
        id: 't1_long_text',
        bodyPreview: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTU...',
      },
      {
        id: 't1_long_mixed',
        bodyPreview: `Hello ${COMMENT_GIF_PREVIEW_MARKER} abcdefghijklmnopqrstuvwxyzABCDEFGHI...`,
      },
    ]
  );
});

test('processCommentCacheQueue skips malformed comment queue members', async () => {
  const redisClient = new FakeRedisClient();
  const redditClient = new FakeRedditClient();
  const dataLayer = createDataLayer('ExampleSub', redisClient);
  const keys = getDataKeys('ExampleSub');

  await redisClient.zAdd(keys.commentRefreshCommentQueue, {
    member: 'malformed-comment-item',
    score: 1,
  });
  await redisClient.zAdd(keys.commentRefreshPostQueue, {
    member: 't3_post_1',
    score: 1,
  });

  const result = await processCommentCacheQueue(
    { subredditName: 'ExampleSub', maxDurationMs: 25_000 },
    {
      redisClient:
        redisClient as CommentCacheQueueProcessDependencies['redisClient'],
      redditClient:
        redditClient as unknown as CommentCacheQueueProcessDependencies['redditClient'],
      dataLayer,
      now: createNow([0, 0, 30_000]),
    }
  );

  assert.equal(result.invalidQueueItemCount, 1);
  assert.equal(redditClient.calls.length, 0);
  assert.deepEqual(redisClient.readSortedSet(keys.commentRefreshPostQueue), [
    { member: 't3_post_1', score: 1 },
  ]);
});

test('processCommentCacheQueue skips failed fetches and continues with later queue items', async () => {
  const redisClient = new FakeRedisClient();
  const redditClient = new FakeRedditClient();
  const dataLayer = createDataLayer('ExampleSub', redisClient);
  const keys = getDataKeys('ExampleSub');

  await redisClient.zAdd(
    keys.commentRefreshPostQueue,
    { member: 't3_fail', score: 1 },
    { member: 't3_ok', score: 2 }
  );
  redditClient.setResponse(
    't3_fail',
    undefined,
    new Error('reddit unavailable')
  );
  redditClient.setResponse('t3_ok', undefined, [
    createComment('t1_ok', 't3_ok'),
  ]);

  const result = await processCommentCacheQueue(
    { subredditName: 'ExampleSub', maxDurationMs: 25_000 },
    {
      redisClient:
        redisClient as CommentCacheQueueProcessDependencies['redisClient'],
      redditClient:
        redditClient as unknown as CommentCacheQueueProcessDependencies['redditClient'],
      dataLayer,
      now: () => 0,
    }
  );

  assert.deepEqual(
    redditClient.calls.map(({ postId, commentId }) => ({ postId, commentId })),
    [
      { postId: 't3_fail', commentId: undefined },
      { postId: 't3_ok', commentId: undefined },
      { postId: 't3_ok', commentId: 't1_ok' },
    ]
  );
  assert.equal(result.failedItemCount, 1);
  assert.equal(result.processedPostCount, 2);
  assert.equal(result.fetchedCommentCount, 1);
  assert.equal(result.cachedCommentCount, 1);
  assert.equal(result.queueEmpty, true);
});

const createComment = (
  id: `t1_${string}`,
  postId: `t3_${string}`,
  body = `Body ${id}`
): Comment =>
  ({
    id,
    postId,
    authorName: 'alice',
    score: 5,
    body,
    createdAt: new Date('2026-04-15T12:00:00.000Z'),
    permalink: `/r/example/comments/${postId}/${id}`,
  }) as unknown as Comment;

const createResponseKey = (
  postId: `t3_${string}`,
  commentId: `t1_${string}` | undefined
): string => `${postId}:${commentId ?? ''}`;

const createNow = (values: number[]): (() => number) => {
  let index = 0;

  return () => {
    const value = values[Math.min(index, values.length - 1)] ?? 0;
    index += 1;

    return value;
  };
};
