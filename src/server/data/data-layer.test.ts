import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  DATA_RETENTION_TTL_SECONDS,
  createDataLayer,
  getDataKeys,
  type ContributorEntity,
  type CommentEntity,
  type PostEntity,
  type RedisDataClient,
} from './index';

class FakeRedisDataClient implements RedisDataClient {
  readonly expireCalls: Array<{ key: string; seconds: number }> = [];
  readonly hMGetCalls: Array<{ key: string; fields: string[] }> = [];
  readonly hashes = new Map<string, Map<string, string>>();
  readonly sortedSets = new Map<string, Map<string, number>>();

  async expire(key: string, seconds: number): Promise<void> {
    this.expireCalls.push({ key, seconds });
  }

  async hDel(key: string, fields: string[]): Promise<number> {
    const hash = this.hashes.get(key);

    if (!hash) {
      return 0;
    }

    let removedFieldCount = 0;

    fields.forEach((field) => {
      if (hash.delete(field)) {
        removedFieldCount += 1;
      }
    });

    return removedFieldCount;
  }

  async hGet(key: string, field: string): Promise<string | undefined> {
    return this.hashes.get(key)?.get(field);
  }

  async hMGet(key: string, fields: string[]): Promise<(string | null)[]> {
    this.hMGetCalls.push({ key, fields: [...fields] });
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

  async zRange(
    key: string,
    start: number | string,
    stop: number | string,
    options?: Parameters<RedisDataClient['zRange']>[3]
  ): Promise<Array<{ member: string; score: number }>> {
    const indexedEntities = [...(this.sortedSets.get(key)?.entries() ?? [])]
      .map(([member, score]) => ({ member, score }))
      .sort((a, b) => a.score - b.score || a.member.localeCompare(b.member));

    if (options?.by === 'rank') {
      const rankedEntities = options.reverse
        ? indexedEntities.toReversed()
        : indexedEntities;
      const startRank = Number(start);
      const stopRank = Number(stop);
      const endRank =
        stopRank < 0 ? rankedEntities.length + stopRank : stopRank;

      return rankedEntities.slice(startRank, endRank + 1);
    }

    const startScore = Number(start);
    const stopScore = Number(stop);
    const matchedEntities = indexedEntities.filter(
      ({ score }) => score >= startScore && score <= stopScore
    );
    const orderedEntities = options?.reverse
      ? matchedEntities.toReversed()
      : matchedEntities;

    if (options?.limit) {
      return orderedEntities.slice(
        options.limit.offset,
        options.limit.offset + options.limit.count
      );
    }

    return options?.by === 'score'
      ? orderedEntities.slice(0, 1000)
      : orderedEntities;
  }

  clearCallHistory(): void {
    this.expireCalls.length = 0;
    this.hMGetCalls.length = 0;
  }
}

test('data keys use app-local prefixes', () => {
  assert.deepEqual(getDataKeys('r/ExampleSub'), {
    posts: 'data:v1:examplesub:posts',
    postCreatedAtIndex: 'data:v1:examplesub:posts:createdAt',
    comments: 'data:v1:examplesub:comments',
    commentCreatedAtIndex: 'data:v1:examplesub:comments:createdAt',
    commentIdsByPost: 'data:v1:examplesub:comments:byPost',
    commentRefreshPostQueue: 'data:v1:examplesub:comments:refresh:posts',
    commentRefreshCommentQueue: 'data:v1:examplesub:comments:refresh:comments',
    contributors: 'data:v1:examplesub:contributors',
    contributorRefreshQueue: 'data:v1:examplesub:contributors:refresh',
  });
});

const createContributor = (id: string): ContributorEntity => ({
  id,
  avatarUrl: `https://example.com/${id}.png`,
  subredditKarma: id.length,
  fetchedAt: '2026-04-15T12:00:00.000Z',
});

const createPost = (
  id: string,
  createdAt: string,
  authorName = 'alice'
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
  postId = 't3_post_1',
  authorName = 'alice'
): CommentEntity => ({
  id,
  postId,
  authorName,
  score: 5,
  bodyPreview: `Comment ${id}`,
  createdAt,
  permalink: `/r/example/comments/t3_post/${id}`,
});

test('hash repositories skip missing and malformed entities while preserving valid input order', async () => {
  const redisClient = new FakeRedisDataClient();
  const dataLayer = createDataLayer('ExampleSub', redisClient);
  const keys = getDataKeys('ExampleSub');
  const alice = createContributor('alice');
  const carol = createContributor('carol');

  await dataLayer.contributors.upsertMany([alice, carol]);
  await redisClient.hSet(keys.contributors, {
    malformed: JSON.stringify({ id: 'malformed', avatarUrl: 5 }),
  });

  assert.equal(await dataLayer.contributors.getById('missing'), null);
  assert.equal(await dataLayer.contributors.getById('malformed'), null);
  assert.deepEqual(
    await dataLayer.contributors.getByIds([
      'carol',
      'missing',
      'alice',
      'malformed',
    ]),
    [carol, alice]
  );
});

test('time indexed repositories maintain createdAt indexes and skip malformed hydrated rows', async () => {
  const redisClient = new FakeRedisDataClient();
  const dataLayer = createDataLayer('ExampleSub', redisClient);
  const keys = getDataKeys('ExampleSub');
  const firstPost = createPost('t3_post_1', '2026-04-15T10:00:00.000Z');
  const secondPost = createPost('t3_post_2', '2026-04-15T12:00:00.000Z');
  const firstComment = createComment(
    't1_comment_1',
    '2026-04-15T10:30:00.000Z'
  );
  const secondComment = createComment(
    't1_comment_2',
    '2026-04-15T11:30:00.000Z'
  );
  const startTime = Date.parse('2026-04-15T09:00:00.000Z');
  const endTime = Date.parse('2026-04-15T13:00:00.000Z');

  await dataLayer.posts.upsertMany([secondPost, firstPost]);
  await redisClient.hSet(keys.posts, {
    t3_malformed: JSON.stringify({ id: 't3_malformed', title: null }),
  });
  await redisClient.zAdd(keys.postCreatedAtIndex, {
    member: 't3_malformed',
    score: Date.parse('2026-04-15T11:00:00.000Z'),
  });

  assert.deepEqual(
    await dataLayer.posts.getIdsInTimeRange({ startTime, endTime }),
    ['t3_post_1', 't3_malformed', 't3_post_2']
  );
  assert.deepEqual(
    await dataLayer.posts.getInTimeRange({ startTime, endTime }),
    [firstPost, secondPost]
  );

  await dataLayer.comments.upsertMany([secondComment, firstComment]);

  assert.deepEqual(
    await dataLayer.comments.getIdsInTimeRange({ startTime, endTime }),
    ['t1_comment_1', 't1_comment_2']
  );
});

test('time indexed repositories page score range reads beyond Redis default limits', async () => {
  const redisClient = new FakeRedisDataClient();
  const dataLayer = createDataLayer('ExampleSub', redisClient);
  const commentCount = 2005;
  const createdAt = '2026-04-15T12:00:00.000Z';
  const comments = Array.from({ length: commentCount }, (_, index) =>
    createComment(`t1_comment_${String(index).padStart(4, '0')}`, createdAt)
  );
  const expectedIds = comments
    .map((comment) => comment.id)
    .sort((a, b) => a.localeCompare(b));
  const startTime = Date.parse('2026-04-15T11:00:00.000Z');
  const endTime = Date.parse('2026-04-15T13:00:00.000Z');

  await dataLayer.comments.upsertMany(comments);

  const commentIds = await dataLayer.comments.getIdsInTimeRange({
    startTime,
    endTime,
  });
  const cachedComments = await dataLayer.comments.getInTimeRange({
    startTime,
    endTime,
  });

  assert.equal(commentIds.length, commentCount);
  assert.deepEqual(commentIds, expectedIds);
  assert.equal(cachedComments.length, commentCount);
  assert.deepEqual(
    cachedComments.map((comment) => comment.id),
    expectedIds
  );
});

test('comment repositories parse comment previews without preview kind metadata', async () => {
  const redisClient = new FakeRedisDataClient();
  const dataLayer = createDataLayer('ExampleSub', redisClient);
  const keys = getDataKeys('ExampleSub');
  const legacyComment = {
    id: 't1_legacy',
    postId: 't3_post_1',
    authorName: 'alice',
    score: 5,
    bodyPreview: 'GIF comment',
    createdAt: '2026-04-15T10:30:00.000Z',
    permalink: '/r/example/comments/t3_post_1/t1_legacy',
  };

  await redisClient.hSet(keys.comments, {
    [legacyComment.id]: JSON.stringify(legacyComment),
  });

  assert.deepEqual(await dataLayer.comments.getById(legacyComment.id), {
    ...legacyComment,
  });
});

test('repositories refresh data retention TTLs after writes', async () => {
  const redisClient = new FakeRedisDataClient();
  const dataLayer = createDataLayer('ExampleSub', redisClient);
  const keys = getDataKeys('ExampleSub');

  await dataLayer.posts.upsert(
    createPost('t3_post_1', '2026-04-15T10:00:00.000Z')
  );
  await dataLayer.comments.upsert(
    createComment('t1_comment_1', '2026-04-15T10:30:00.000Z')
  );
  await dataLayer.contributors.upsert(createContributor('alice'));
  await dataLayer.commentPostIndex.addCommentIds('t3_post_1', [
    't1_comment_1',
    't1_comment_1',
  ]);

  assert.deepEqual(redisClient.expireCalls, [
    { key: keys.posts, seconds: DATA_RETENTION_TTL_SECONDS },
    {
      key: keys.postCreatedAtIndex,
      seconds: DATA_RETENTION_TTL_SECONDS,
    },
    { key: keys.comments, seconds: DATA_RETENTION_TTL_SECONDS },
    {
      key: keys.commentCreatedAtIndex,
      seconds: DATA_RETENTION_TTL_SECONDS,
    },
    { key: keys.contributors, seconds: DATA_RETENTION_TTL_SECONDS },
    { key: keys.commentIdsByPost, seconds: DATA_RETENTION_TTL_SECONDS },
  ]);
});

test('repositories delete cached entities and remove sorted set members', async () => {
  const redisClient = new FakeRedisDataClient();
  const dataLayer = createDataLayer('ExampleSub', redisClient);
  const keys = getDataKeys('ExampleSub');
  const startTime = Date.parse('2026-04-15T09:00:00.000Z');
  const endTime = Date.parse('2026-04-15T13:00:00.000Z');

  await dataLayer.posts.upsertMany([
    createPost('t3_post_1', '2026-04-15T10:00:00.000Z'),
    createPost('t3_post_2', '2026-04-15T12:00:00.000Z'),
  ]);
  await dataLayer.comments.upsertMany([
    createComment('t1_comment_1', '2026-04-15T10:30:00.000Z'),
    createComment('t1_comment_2', '2026-04-15T11:30:00.000Z'),
  ]);
  await dataLayer.contributors.upsertMany([
    createContributor('alice'),
    createContributor('bob'),
  ]);
  await dataLayer.commentPostIndex.addCommentIds('t3_post_1', [
    't1_comment_1',
    't1_comment_2',
  ]);
  redisClient.clearCallHistory();

  await dataLayer.posts.delete('t3_post_1');
  await dataLayer.comments.deleteMany(['t1_comment_1']);
  await dataLayer.contributors.delete('alice');
  await dataLayer.commentPostIndex.removeCommentIds('t3_post_1', [
    't1_comment_1',
  ]);
  await dataLayer.commentPostIndex.delete('t3_missing');

  assert.equal(await dataLayer.posts.getById('t3_post_1'), null);
  assert.deepEqual(
    await dataLayer.posts.getIdsInTimeRange({ startTime, endTime }),
    ['t3_post_2']
  );
  assert.equal(await dataLayer.comments.getById('t1_comment_1'), null);
  assert.deepEqual(
    await dataLayer.comments.getIdsInTimeRange({ startTime, endTime }),
    ['t1_comment_2']
  );
  assert.equal(await dataLayer.contributors.getById('alice'), null);
  assert.deepEqual(
    await dataLayer.commentPostIndex.getCommentIds('t3_post_1'),
    ['t1_comment_2']
  );
  assert.deepEqual(redisClient.expireCalls, [
    { key: keys.posts, seconds: DATA_RETENTION_TTL_SECONDS },
    {
      key: keys.postCreatedAtIndex,
      seconds: DATA_RETENTION_TTL_SECONDS,
    },
    { key: keys.comments, seconds: DATA_RETENTION_TTL_SECONDS },
    {
      key: keys.commentCreatedAtIndex,
      seconds: DATA_RETENTION_TTL_SECONDS,
    },
    { key: keys.contributors, seconds: DATA_RETENTION_TTL_SECONDS },
    { key: keys.commentIdsByPost, seconds: DATA_RETENTION_TTL_SECONDS },
    { key: keys.commentIdsByPost, seconds: DATA_RETENTION_TTL_SECONDS },
  ]);
});

test('comment post index stores deduplicated ids and supports delete', async () => {
  const redisClient = new FakeRedisDataClient();
  const dataLayer = createDataLayer('ExampleSub', redisClient);

  await dataLayer.commentPostIndex.addCommentIds('t3_post_1', [
    't1_comment_1',
    't1_comment_2',
    't1_comment_1',
  ]);
  assert.deepEqual(
    await dataLayer.commentPostIndex.getCommentIds('t3_post_1'),
    ['t1_comment_1', 't1_comment_2']
  );

  await dataLayer.commentPostIndex.removeCommentIds('t3_post_1', [
    't1_comment_2',
  ]);
  assert.deepEqual(
    await dataLayer.commentPostIndex.getCommentIds('t3_post_1'),
    ['t1_comment_1']
  );

  await dataLayer.commentPostIndex.delete('t3_post_1');
  assert.deepEqual(
    await dataLayer.commentPostIndex.getCommentIds('t3_post_1'),
    []
  );
});

test('time indexed repositories read latest ids in newest-first order', async () => {
  const redisClient = new FakeRedisDataClient();
  const dataLayer = createDataLayer('ExampleSub', redisClient);
  const postCount = 1005;
  const posts = Array.from({ length: postCount }, (_, index) =>
    createPost(
      `t3_post_${String(index).padStart(4, '0')}`,
      new Date(Date.UTC(2026, 3, 15, 0, 0, index)).toISOString()
    )
  );

  await dataLayer.posts.upsertMany(posts);

  const latestPostIds = await dataLayer.posts.getLatestIds(1000);

  assert.equal(latestPostIds.length, 1000);
  assert.deepEqual(latestPostIds.slice(0, 5), [
    't3_post_1004',
    't3_post_1003',
    't3_post_1002',
    't3_post_1001',
    't3_post_1000',
  ]);
  assert.equal(latestPostIds.at(-1), 't3_post_0005');
  assert.equal(latestPostIds.includes('t3_post_0004'), false);
  assert.deepEqual(await dataLayer.posts.getLatestIds(0), []);
});

test('relation hydrators add requested relations, preserve order, and keep missing relations null', async () => {
  const redisClient = new FakeRedisDataClient();
  const dataLayer = createDataLayer('ExampleSub', redisClient);
  const keys = getDataKeys('ExampleSub');
  const alice = createContributor('alice');
  const post = createPost('t3_post_1', '2026-04-15T10:00:00.000Z');
  const firstComment = createComment(
    't1_comment_1',
    '2026-04-15T10:30:00.000Z'
  );
  const secondComment = createComment(
    't1_comment_2',
    '2026-04-15T11:30:00.000Z'
  );
  const missingRelationsComment = createComment(
    't1_comment_3',
    '2026-04-15T12:30:00.000Z',
    't3_missing',
    'ghost'
  );

  await dataLayer.contributors.upsert(alice);
  await dataLayer.posts.upsert(post);
  await dataLayer.comments.upsertMany([
    firstComment,
    secondComment,
    missingRelationsComment,
  ]);

  redisClient.clearCallHistory();
  const comments = await dataLayer.comments.getByIds([
    firstComment.id,
    secondComment.id,
    missingRelationsComment.id,
  ]);
  redisClient.clearCallHistory();

  const hydratedComments = await dataLayer.hydrateCommentRelations(comments, {
    posts: true,
    author: true,
  });
  const [firstHydratedComment, secondHydratedComment, missingHydratedComment] =
    hydratedComments;

  assert.ok(firstHydratedComment);
  assert.ok(secondHydratedComment);
  assert.ok(missingHydratedComment);
  assert.equal(firstHydratedComment.id, firstComment.id);
  assert.equal(secondHydratedComment.id, secondComment.id);
  assert.deepEqual(firstHydratedComment.post, post);
  assert.deepEqual(secondHydratedComment.post, post);
  assert.deepEqual(firstHydratedComment.author, alice);
  assert.equal(missingHydratedComment.post, null);
  assert.equal(missingHydratedComment.author, null);
  assert.deepEqual(
    redisClient.hMGetCalls.find((call) => call.key === keys.posts)?.fields,
    ['t3_post_1', 't3_missing']
  );
  assert.deepEqual(
    redisClient.hMGetCalls.find((call) => call.key === keys.contributors)
      ?.fields,
    ['alice', 'ghost']
  );

  const postsOnly = await dataLayer.hydrateCommentRelations([firstComment], {
    posts: true,
  });
  const firstPostOnlyComment = postsOnly[0];

  assert.ok(firstPostOnlyComment);
  assert.equal('post' in firstPostOnlyComment, true);
  assert.equal('author' in firstPostOnlyComment, false);
});

test('post relation hydrator adds author when requested', async () => {
  const redisClient = new FakeRedisDataClient();
  const dataLayer = createDataLayer('ExampleSub', redisClient);
  const alice = createContributor('alice');
  const post = createPost('t3_post_1', '2026-04-15T10:00:00.000Z');
  const missingAuthorPost = createPost(
    't3_post_2',
    '2026-04-15T11:00:00.000Z',
    'ghost'
  );

  await dataLayer.contributors.upsert(alice);

  const hydratedPosts = await dataLayer.hydratePostRelations(
    [post, missingAuthorPost],
    {
      author: true,
    }
  );
  const [hydratedPost, missingAuthorHydratedPost] = hydratedPosts;

  assert.ok(hydratedPost);
  assert.ok(missingAuthorHydratedPost);
  assert.deepEqual(hydratedPost.author, alice);
  assert.equal(missingAuthorHydratedPost.author, null);
});
