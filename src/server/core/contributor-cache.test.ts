import assert from 'node:assert/strict';
import { reddit } from '@devvit/web/server';
import { beforeEach, expect, test, vi } from 'vitest';
import {
  createDataLayer,
  getDataKeys,
  type CommentEntity,
  type ContributorEntity,
  type ContributorRepository,
  type PostEntity,
  type RedisDataClient,
} from '../data';
import {
  processContributorCacheQueue,
  refreshContributorCache,
  refreshContributorMetadata,
} from './contributor-cache';

vi.mock('@devvit/web/server', () => ({
  context: {
    subredditName: 'ExampleSub',
  },
  reddit: {
    getUserKarmaFromCurrentSubreddit: vi.fn(),
    getSnoovatarUrl: vi.fn(),
  },
}));

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
    const matchedMembers = sortedMembers.filter(
      ({ score }) => score >= startScore && score <= stopScore
    );
    const orderedMembers = options?.reverse
      ? matchedMembers.toReversed()
      : matchedMembers;

    if (options?.limit) {
      return orderedMembers.slice(
        options.limit.offset,
        options.limit.offset + options.limit.count
      );
    }

    return orderedMembers;
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
      .sort(
        (left, right) =>
          left.score - right.score || left.member.localeCompare(right.member)
      );
  }
}

beforeEach(() => {
  vi.mocked(reddit.getUserKarmaFromCurrentSubreddit).mockReset();
  vi.mocked(reddit.getSnoovatarUrl).mockReset();
  vi.mocked(reddit.getSnoovatarUrl).mockResolvedValue(
    'https://example.com/avatar.png'
  );
});

test('refreshContributorCache replaces stale queue entries and orders contributors by latest activity', async () => {
  const redisClient = new FakeRedisClient();
  const dataLayer = createDataLayer('ExampleSub', redisClient);
  const keys = getDataKeys('ExampleSub');

  await dataLayer.posts.upsertMany([
    createPost('t3_post_bob', '2026-04-15T10:00:00.000Z', 'bob'),
    createPost('t3_post_alice', '2026-04-15T11:00:00.000Z', 'alice'),
  ]);
  await dataLayer.comments.upsertMany([
    createComment('t1_comment_bob', '2026-04-15T12:00:00.000Z', 'bob'),
    createComment('t1_comment_carol', '2026-04-15T12:00:00.000Z', 'carol'),
    createComment(
      't1_comment_deleted',
      '2026-04-15T12:30:00.000Z',
      '[deleted]'
    ),
    createComment('t1_comment_blank', '2026-04-15T13:00:00.000Z', '   '),
  ]);
  await redisClient.zAdd(keys.contributorRefreshQueue, {
    member: 'stale-user',
    score: 99,
  });

  const result = await refreshContributorCache('ExampleSub', {
    createDataLayerForSubreddit: () => dataLayer,
    redisClient,
    now: () => new Date('2026-04-15T12:45:00.000Z'),
  });

  assert.deepEqual(result, {
    candidateContributorCount: 3,
    enqueuedContributorCount: 3,
    generatedAt: '2026-04-15T12:45:00.000Z',
  });
  assert.deepEqual(redisClient.readSortedSet(keys.contributorRefreshQueue), [
    { member: 'bob', score: 0 },
    { member: 'carol', score: 1 },
    { member: 'alice', score: 2 },
  ]);
});

test('processContributorCacheQueue refreshes contributors in queue order until empty', async () => {
  const redisClient = new FakeRedisClient();
  const dataLayer = createDataLayer('ExampleSub', redisClient);
  const refreshedUsernames: string[] = [];

  await dataLayer.posts.upsertMany([
    createPost('t3_post_bob', '2026-04-15T10:00:00.000Z', 'bob'),
    createPost('t3_post_alice', '2026-04-15T11:00:00.000Z', 'alice'),
  ]);
  await dataLayer.comments.upsertMany([
    createComment('t1_comment_bob', '2026-04-15T12:00:00.000Z', 'bob'),
    createComment('t1_comment_carol', '2026-04-15T12:00:00.000Z', 'carol'),
  ]);

  await refreshContributorCache('ExampleSub', {
    createDataLayerForSubreddit: () => dataLayer,
    redisClient,
    now: () => new Date('2026-04-15T12:45:00.000Z'),
  });

  const result = await processContributorCacheQueue(
    { subredditName: 'ExampleSub', maxDurationMs: 25_000 },
    {
      redisClient,
      refreshContributorMetadataForUser: async (_subredditName, username) => {
        refreshedUsernames.push(username);

        return {
          refreshedContributorCount: 1,
          generatedAt: '2026-04-15T12:45:00.000Z',
        };
      },
      now: () => 0,
    }
  );

  assert.deepEqual(refreshedUsernames, ['bob', 'carol', 'alice']);
  assert.deepEqual(result, {
    processedContributorCount: 3,
    refreshedContributorCount: 3,
    failedItemCount: 0,
    invalidQueueItemCount: 0,
    queueEmpty: true,
    generatedAt: '1970-01-01T00:00:00.000Z',
  });
});

test('processContributorCacheQueue stops when the time budget is exhausted', async () => {
  const redisClient = new FakeRedisClient();
  const keys = getDataKeys('ExampleSub');
  const refreshedUsernames: string[] = [];

  await redisClient.zAdd(
    keys.contributorRefreshQueue,
    { member: 'alice', score: 0 },
    { member: 'bob', score: 1 }
  );

  const result = await processContributorCacheQueue(
    { subredditName: 'ExampleSub', maxDurationMs: 25_000 },
    {
      redisClient,
      refreshContributorMetadataForUser: async (_subredditName, username) => {
        refreshedUsernames.push(username);

        return {
          refreshedContributorCount: 1,
          generatedAt: '2026-04-15T12:45:00.000Z',
        };
      },
      now: createNow([0, 0, 30_000, 30_000]),
    }
  );

  assert.deepEqual(refreshedUsernames, ['alice']);
  assert.equal(result.processedContributorCount, 1);
  assert.equal(result.refreshedContributorCount, 1);
  assert.equal(result.queueEmpty, false);
  assert.deepEqual(redisClient.readSortedSet(keys.contributorRefreshQueue), [
    { member: 'bob', score: 1 },
  ]);
});

test('processContributorCacheQueue skips invalid queue members and continues', async () => {
  const redisClient = new FakeRedisClient();
  const keys = getDataKeys('ExampleSub');
  const refreshedUsernames: string[] = [];

  await redisClient.zAdd(
    keys.contributorRefreshQueue,
    { member: '   ', score: 0 },
    { member: 'alice', score: 1 }
  );

  const result = await processContributorCacheQueue(
    { subredditName: 'ExampleSub', maxDurationMs: 25_000 },
    {
      redisClient,
      refreshContributorMetadataForUser: async (_subredditName, username) => {
        refreshedUsernames.push(username);

        return {
          refreshedContributorCount: 1,
          generatedAt: '2026-04-15T12:45:00.000Z',
        };
      },
      now: () => 0,
    }
  );

  assert.deepEqual(refreshedUsernames, ['alice']);
  assert.equal(result.processedContributorCount, 1);
  assert.equal(result.invalidQueueItemCount, 1);
  assert.equal(result.failedItemCount, 0);
  assert.equal(result.queueEmpty, true);
});

test('processContributorCacheQueue continues after refresh failures', async () => {
  const redisClient = new FakeRedisClient();
  const keys = getDataKeys('ExampleSub');
  const attemptedUsernames: string[] = [];

  await redisClient.zAdd(
    keys.contributorRefreshQueue,
    { member: 'alice', score: 0 },
    { member: 'bob', score: 1 }
  );

  const result = await processContributorCacheQueue(
    { subredditName: 'ExampleSub', maxDurationMs: 25_000 },
    {
      redisClient,
      refreshContributorMetadataForUser: async (_subredditName, username) => {
        attemptedUsernames.push(username);

        if (username === 'alice') {
          throw new Error('reddit unavailable');
        }

        return {
          refreshedContributorCount: 1,
          generatedAt: '2026-04-15T12:45:00.000Z',
        };
      },
      now: () => 0,
    }
  );

  assert.deepEqual(attemptedUsernames, ['alice', 'bob']);
  assert.deepEqual(result, {
    processedContributorCount: 2,
    refreshedContributorCount: 1,
    failedItemCount: 1,
    invalidQueueItemCount: 0,
    queueEmpty: true,
    generatedAt: '1970-01-01T00:00:00.000Z',
  });
});

test('refreshContributorMetadata uses synthetic karma for non-current subreddits', async () => {
  const storedContributors: ContributorEntity[] = [];
  let upsertCount = 0;

  await refreshContributorMetadata('OtherSub', 'alice', {
    currentSubredditName: 'ExampleSub',
    createDataLayerForSubreddit: () => ({
      contributors: createContributorRepository(async (contributor) => {
        storedContributors.push(contributor);
        upsertCount += 1;
      }),
    }),
    now: () => new Date('2026-04-15T12:00:00.000Z'),
  });

  expect(reddit.getUserKarmaFromCurrentSubreddit).not.toHaveBeenCalled();
  expect(upsertCount).toBe(1);

  const contributor = storedContributors[0];

  expect(contributor).toMatchObject({
    id: 'alice',
    avatarUrl: 'https://example.com/avatar.png',
    fetchedAt: '2026-04-15T12:00:00.000Z',
  });

  if (!contributor) {
    throw new Error('Expected contributor to be stored.');
  }

  expect(typeof contributor.subredditKarma).toBe('number');
});

test('refreshContributorMetadata uses real subreddit karma for the current subreddit', async () => {
  const storedContributors: ContributorEntity[] = [];

  vi.mocked(reddit.getUserKarmaFromCurrentSubreddit).mockResolvedValue({
    fromPosts: 7,
    fromComments: 5,
  });

  await refreshContributorMetadata('ExampleSub', 'alice', {
    currentSubredditName: 'ExampleSub',
    createDataLayerForSubreddit: () => ({
      contributors: createContributorRepository(async (contributor) => {
        storedContributors.push(contributor);
      }),
    }),
    now: () => new Date('2026-04-15T12:00:00.000Z'),
  });

  expect(reddit.getUserKarmaFromCurrentSubreddit).toHaveBeenCalledWith('alice');

  const contributor = storedContributors[0];

  if (!contributor) {
    throw new Error('Expected contributor to be stored.');
  }

  expect(contributor.subredditKarma).toBe(12);
});

const createContributorRepository = (
  onUpsert: (contributor: ContributorEntity) => Promise<void>
): ContributorRepository => ({
  getById: async () => null,
  getByIds: async () => [],
  upsert: async (contributor) => {
    await onUpsert(contributor);
  },
  upsertMany: async () => {},
});

const createPost = (
  id: string,
  createdAt: string,
  authorName: string
): PostEntity => ({
  id,
  title: `Post ${id}`,
  authorName,
  comments: 3,
  score: 10,
  createdAt,
  permalink: `/r/example/comments/${id}`,
});

const createComment = (
  id: string,
  createdAt: string,
  authorName: string
): CommentEntity => ({
  id,
  postId: 't3_post_parent',
  authorName,
  score: 5,
  bodyPreview: `Comment ${id}`,
  createdAt,
  permalink: `/r/example/comments/t3_post_parent/${id}`,
});

const createNow = (values: number[]): (() => number) => {
  let index = 0;

  return () => {
    const value = values[Math.min(index, values.length - 1)] ?? 0;
    index += 1;

    return value;
  };
};
