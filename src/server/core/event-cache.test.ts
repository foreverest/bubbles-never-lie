import assert from 'node:assert/strict';
import {
  CrowdControlLevel,
  DistinguishType,
  SubredditRating,
  SubredditType,
  type CommentV2,
  type OnCommentCreateRequest,
  type OnPostCreateRequest,
  type PostV2,
  type SubredditV2,
  type UserV2,
} from '@devvit/web/shared';
import { test } from 'vitest';
import { createDataLayer, type RedisDataClient } from '../data';
import {
  cacheCommentCreateEvent,
  cachePostCreateEvent,
  type EventCacheDependencies,
} from './event-cache';

class FakeRedisDataClient implements RedisDataClient {
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

    if (options?.limit) {
      return matchedEntities.slice(
        options.limit.offset,
        options.limit.offset + options.limit.count
      );
    }

    return matchedEntities;
  }
}

type ContributorRefreshCall = {
  subredditName: string;
  username: string;
};

test('post create events write posts and refresh the post author contributor', async () => {
  const redisClient = new FakeRedisDataClient();
  const contributorRefreshCalls: ContributorRefreshCall[] = [];
  const dependencies = createDependencies(
    redisClient,
    contributorRefreshCalls
  );
  const createdAt = Date.parse('2026-04-15T10:00:00.000Z') / 1000;

  const result = await cachePostCreateEvent(
    createPostCreateRequest({
      post: createEventPost({
        id: 'post_1',
        title: 'Fresh post',
        createdAt,
        score: 42,
        numComments: 7,
        permalink: '/r/ExampleSub/comments/post_1/fresh_post/',
      }),
      author: createEventUser({ name: 'alice' }),
    }),
    dependencies
  );
  const dataLayer = createDataLayer('examplesub', redisClient);

  assert.deepEqual(result, {
    status: 'cached',
    subredditName: 'examplesub',
    cachedPostCount: 1,
    cachedCommentCount: 0,
    refreshedContributorCount: 1,
    generatedAt: '2026-04-15T12:00:00.000Z',
  });
  assert.deepEqual(await dataLayer.posts.getById('t3_post_1'), {
    id: 't3_post_1',
    title: 'Fresh post',
    authorName: 'alice',
    comments: 7,
    score: 42,
    createdAt: '2026-04-15T10:00:00.000Z',
    permalink: '/r/ExampleSub/comments/post_1/fresh_post/',
  });
  assert.deepEqual(contributorRefreshCalls, [
    {
      subredditName: 'examplesub',
      username: 'alice',
    },
  ]);
});

test('comment create events write comments and update cached parent post counts', async () => {
  const redisClient = new FakeRedisDataClient();
  const dataLayer = createDataLayer('examplesub', redisClient);
  const contributorRefreshCalls: ContributorRefreshCall[] = [];
  const dependencies = createDependencies(
    redisClient,
    contributorRefreshCalls
  );

  await dataLayer.posts.upsert({
    id: 't3_post_1',
    title: 'Original post',
    authorName: 'post-author',
    comments: 1,
    score: 10,
    createdAt: '2026-04-15T09:00:00.000Z',
    permalink: '/r/ExampleSub/comments/post_1/original_post/',
  });

  const result = await cacheCommentCreateEvent(
    createCommentCreateRequest({
      comment: createEventComment({
        id: 'comment_1',
        postId: 'post_1',
        author: 'bob',
        body: 'A new comment',
        createdAt: Date.parse('2026-04-15T10:05:00.000Z'),
        score: 5,
        permalink: '/r/ExampleSub/comments/post_1/comment_1/',
      }),
      post: createEventPost({
        id: 'post_1',
        title: 'Updated post',
        numComments: 2,
        score: 11,
        createdAt: Date.parse('2026-04-15T09:00:00.000Z'),
        permalink: '/r/ExampleSub/comments/post_1/updated_post/',
      }),
      author: createEventUser({ name: 'bob' }),
    }),
    dependencies
  );

  assert.deepEqual(result, {
    status: 'cached',
    subredditName: 'examplesub',
    cachedPostCount: 1,
    cachedCommentCount: 1,
    refreshedContributorCount: 1,
    generatedAt: '2026-04-15T12:00:00.000Z',
  });
  assert.deepEqual(await dataLayer.comments.getById('t1_comment_1'), {
    id: 't1_comment_1',
    postId: 't3_post_1',
    authorName: 'bob',
    score: 5,
    bodyPreview: 'A new comment',
    createdAt: '2026-04-15T10:05:00.000Z',
    permalink: '/r/ExampleSub/comments/post_1/comment_1/',
  });
  assert.deepEqual(await dataLayer.posts.getById('t3_post_1'), {
    id: 't3_post_1',
    title: 'Updated post',
    authorName: 'post-author',
    comments: 2,
    score: 11,
    createdAt: '2026-04-15T09:00:00.000Z',
    permalink: '/r/ExampleSub/comments/post_1/updated_post/',
  });
  assert.deepEqual(contributorRefreshCalls, [
    {
      subredditName: 'examplesub',
      username: 'bob',
    },
  ]);
});

test('missing post or comment payloads are no-op successes', async () => {
  const redisClient = new FakeRedisDataClient();
  const contributorRefreshCalls: ContributorRefreshCall[] = [];
  const dependencies = createDependencies(
    redisClient,
    contributorRefreshCalls
  );

  const postResult = await cachePostCreateEvent(
    {
      type: 'PostCreate',
      author: createEventUser(),
      subreddit: createEventSubreddit(),
    },
    dependencies
  );
  const commentResult = await cacheCommentCreateEvent(
    {
      type: 'CommentCreate',
      post: createEventPost(),
      author: createEventUser(),
      subreddit: createEventSubreddit(),
    },
    dependencies
  );

  assert.deepEqual(postResult, {
    status: 'skipped',
    subredditName: 'examplesub',
    cachedPostCount: 0,
    cachedCommentCount: 0,
    refreshedContributorCount: 0,
    generatedAt: '2026-04-15T12:00:00.000Z',
    skippedReason: 'missing_or_invalid_post_payload',
  });
  assert.deepEqual(commentResult, {
    status: 'skipped',
    subredditName: 'examplesub',
    cachedPostCount: 0,
    cachedCommentCount: 0,
    refreshedContributorCount: 0,
    generatedAt: '2026-04-15T12:00:00.000Z',
    skippedReason: 'missing_or_invalid_comment_payload',
  });
  assert.equal(redisClient.hashes.size, 0);
  assert.equal(redisClient.sortedSets.size, 0);
  assert.deepEqual(contributorRefreshCalls, []);
});

test('deleted authors are cached without contributor metadata refresh', async () => {
  const redisClient = new FakeRedisDataClient();
  const contributorRefreshCalls: ContributorRefreshCall[] = [];
  const dependencies = createDependencies(
    redisClient,
    contributorRefreshCalls
  );

  const result = await cacheCommentCreateEvent(
    createCommentCreateRequest({
      comment: createEventComment({
        author: '[deleted]',
      }),
      author: createEventUser({ name: '[deleted]' }),
    }),
    dependencies
  );

  assert.equal(result.status, 'cached');
  assert.equal(result.refreshedContributorCount, 0);
  assert.deepEqual(contributorRefreshCalls, []);
});

const createDependencies = (
  redisClient: RedisDataClient,
  contributorRefreshCalls: ContributorRefreshCall[]
): EventCacheDependencies => ({
  createDataLayerForSubreddit: (subredditName) =>
    createDataLayer(subredditName, redisClient),
  refreshContributor: async (options) => {
    contributorRefreshCalls.push(options);
    return 1;
  },
  currentSubredditName: 'FallbackSub',
  now: () => new Date('2026-04-15T12:00:00.000Z'),
});

const createPostCreateRequest = ({
  post = createEventPost(),
  author = createEventUser(),
  subreddit = createEventSubreddit(),
}: {
  post?: PostV2 | undefined;
  author?: UserV2 | undefined;
  subreddit?: SubredditV2 | undefined;
} = {}): OnPostCreateRequest => ({
  type: 'PostCreate',
  post,
  author,
  subreddit,
});

const createCommentCreateRequest = ({
  comment = createEventComment(),
  post = createEventPost(),
  author = createEventUser({ name: 'commenter' }),
  subreddit = createEventSubreddit(),
}: {
  comment?: CommentV2 | undefined;
  post?: PostV2 | undefined;
  author?: UserV2 | undefined;
  subreddit?: SubredditV2 | undefined;
} = {}): OnCommentCreateRequest => ({
  type: 'CommentCreate',
  comment,
  post,
  author,
  subreddit,
});

const createEventPost = (overrides: Partial<PostV2> = {}): PostV2 => ({
  id: 'post_1',
  title: 'Post title',
  selftext: '',
  nsfw: false,
  authorId: 't2_post_author',
  crowdControlLevel: CrowdControlLevel.OFF,
  numReports: 0,
  isGallery: false,
  isMeta: false,
  createdAt: Date.parse('2026-04-15T09:00:00.000Z') / 1000,
  isApproved: true,
  isArchived: false,
  distinguished: DistinguishType.NULL_VALUE,
  ignoreReports: false,
  isSelf: true,
  isVideo: false,
  isLocked: false,
  isSpoiler: false,
  subredditId: 't5_examplesub',
  upvotes: 12,
  downvotes: 2,
  url: 'https://www.reddit.com/r/ExampleSub/comments/post_1/post_title/',
  isSticky: false,
  spam: false,
  deleted: false,
  languageCode: 'en',
  updatedAt: 0,
  gildings: 0,
  score: 10,
  numComments: 1,
  thumbnail: '',
  crosspostParentId: '',
  permalink: '/r/ExampleSub/comments/post_1/post_title/',
  isPoll: false,
  isPromoted: false,
  isMultiMedia: false,
  type: 'text',
  unlisted: false,
  galleryImages: [],
  isImage: false,
  mediaUrls: [],
  isClubContent: false,
  ...overrides,
});

const createEventComment = (
  overrides: Partial<CommentV2> = {}
): CommentV2 => ({
  id: 'comment_1',
  parentId: 't3_post_1',
  body: 'Comment body',
  author: 'commenter',
  numReports: 0,
  collapsedBecauseCrowdControl: false,
  spam: false,
  deleted: false,
  createdAt: Date.parse('2026-04-15T10:00:00.000Z') / 1000,
  upvotes: 6,
  downvotes: 1,
  languageCode: 'en',
  lastModifiedAt: 0,
  gilded: false,
  score: 5,
  permalink: '/r/ExampleSub/comments/post_1/comment_1/',
  hasMedia: false,
  postId: 'post_1',
  subredditId: 't5_examplesub',
  elementTypes: [],
  mediaUrls: [],
  ...overrides,
});

const createEventUser = (overrides: Partial<UserV2> = {}): UserV2 => ({
  id: 't2_user',
  name: 'alice',
  isGold: false,
  snoovatarImage: '',
  url: '/user/alice/',
  spam: false,
  banned: false,
  karma: 100,
  iconImage: '',
  description: '',
  suspended: false,
  ...overrides,
});

const createEventSubreddit = (
  overrides: Partial<SubredditV2> = {}
): SubredditV2 => ({
  id: 't5_examplesub',
  name: 'ExampleSub',
  nsfw: false,
  type: SubredditType.PUBLIC,
  spam: false,
  quarantined: false,
  topics: [],
  rating: SubredditRating.E,
  subscribersCount: 1000,
  permalink: '/r/ExampleSub/',
  title: 'ExampleSub',
  description: '',
  ...overrides,
});
