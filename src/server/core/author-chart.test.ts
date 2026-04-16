import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createAuthorActivities,
  createChartAuthors,
} from './author-chart';
import type { AuthorEntity, CommentEntity, PostEntity } from '../data';

const createPost = (
  id: string,
  authorName: string,
  score: number
): PostEntity => ({
  id,
  title: `Post ${id}`,
  authorName,
  comments: 0,
  score,
  createdAt: '2026-04-15T10:00:00.000Z',
  permalink: `/r/example/comments/${id}`,
});

const createComment = (
  id: string,
  authorName: string,
  score: number
): CommentEntity => ({
  id,
  postId: 't3_post_1',
  authorName,
  score,
  bodyPreview: `Comment ${id}`,
  createdAt: '2026-04-15T10:30:00.000Z',
  permalink: `/r/example/comments/t3_post_1/${id}`,
});

const createAuthor = (id: string): AuthorEntity => ({
  id,
  avatarUrl: `https://example.com/${id}.png`,
  subredditKarma: id.length,
  fetchedAt: '2026-04-15T12:00:00.000Z',
});

test('author chart aggregation includes post-only, comment-only, and mixed authors', () => {
  const activities = createAuthorActivities(
    [
      createPost('t3_alice_1', 'alice', 7),
      createPost('t3_alice_2', 'alice', 11),
      createPost('t3_bob_1', 'bob', 5),
    ],
    [
      createComment('t1_alice_1', 'alice', 3),
      createComment('t1_carol_1', 'carol', 13),
      createComment('t1_carol_2', 'carol', 17),
    ]
  );
  const authors = createChartAuthors(
    activities,
    new Map([
      ['alice', createAuthor('alice')],
      ['carol', createAuthor('carol')],
    ])
  );

  assert.deepEqual(authors, [
    {
      authorName: 'alice',
      authorAvatarUrl: 'https://example.com/alice.png',
      authorSubredditKarmaBucket: 0,
      postCount: 2,
      commentCount: 1,
      postScore: 18,
      commentScore: 3,
      totalScore: 21,
      profileUrl: '/user/alice/',
    },
    {
      authorName: 'carol',
      authorAvatarUrl: 'https://example.com/carol.png',
      authorSubredditKarmaBucket: 9,
      postCount: 0,
      commentCount: 2,
      postScore: 0,
      commentScore: 30,
      totalScore: 30,
      profileUrl: '/user/carol/',
    },
    {
      authorName: 'bob',
      authorAvatarUrl: null,
      authorSubredditKarmaBucket: null,
      postCount: 1,
      commentCount: 0,
      postScore: 5,
      commentScore: 0,
      totalScore: 5,
      profileUrl: '/user/bob/',
    },
  ]);
});

test('author chart aggregation excludes blank and deleted authors', () => {
  const authors = createChartAuthors(
    createAuthorActivities(
      [
        createPost('t3_blank', ' ', 100),
        createPost('t3_deleted', '[deleted]', 200),
        createPost('t3_alice', 'alice', 7),
      ],
      [
        createComment('t1_blank', '', 300),
        createComment('t1_deleted', '[Deleted]', 400),
        createComment('t1_alice', 'alice', 5),
      ]
    )
  );

  assert.deepEqual(authors, [
    {
      authorName: 'alice',
      authorAvatarUrl: null,
      authorSubredditKarmaBucket: null,
      postCount: 1,
      commentCount: 1,
      postScore: 7,
      commentScore: 5,
      totalScore: 12,
      profileUrl: '/user/alice/',
    },
  ]);
});

test('author chart aggregation preserves zero and negative scores', () => {
  const authors = createChartAuthors(
    createAuthorActivities(
      [
        createPost('t3_alice', 'alice', -5),
        createPost('t3_bob', 'bob', 0),
      ],
      [
        createComment('t1_alice', 'alice', -7),
        createComment('t1_bob', 'bob', 0),
      ]
    )
  );

  assert.deepEqual(
    authors.map((author) => ({
      authorName: author.authorName,
      totalScore: author.totalScore,
    })),
    [
      {
        authorName: 'bob',
        totalScore: 0,
      },
      {
        authorName: 'alice',
        totalScore: -12,
      },
    ]
  );
});
