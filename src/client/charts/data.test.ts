import { expect, test } from 'vitest';

import type {
  ChartComment,
  ChartContributor,
  ChartPost,
} from '../../shared/api';
import {
  getCurrentUserDatumFields,
  groupCommentsByPost,
  isCommentBubbleDatum,
  isContributorBubbleDatum,
  isPostBubbleDatum,
  normalizeUsername,
  toCommentBubbleDatum,
  toContributorBubbleDatum,
  toPostBubbleDatum,
} from './data';

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

test('normalizes usernames and identifies the current user', () => {
  expect(normalizeUsername(' u/Alice ')).toBe('alice');
  expect(normalizeUsername('')).toBe(null);
  expect(getCurrentUserDatumFields('Alice', 'alice')).toEqual({
    isCurrentUser: true,
  });
  expect(getCurrentUserDatumFields('Bob', 'alice')).toEqual({
    isCurrentUser: false,
  });
});

test('adds lightweight datum discriminants', () => {
  const postDatum = toPostBubbleDatum(post, 'alice');
  expect(isPostBubbleDatum(postDatum)).toBe(true);
  expect(isCommentBubbleDatum(postDatum)).toBe(false);
});

test('groups comments by post and preserves sorted group order', () => {
  const comments: ChartComment[] = [
    {
      id: 'comment-1',
      postId: 'post-b',
      authorName: 'Alice',
      authorAvatarUrl: null,
      score: 1,
      bodyPreview: 'First',
      bodyPreviewKind: 'text',
      createdAt: '2024-02-29T10:00:00.000Z',
      permalink: '/r/example/comments/post-b/comment-1',
    },
    {
      id: 'comment-2',
      postId: 'post-a',
      authorName: 'Bob',
      authorAvatarUrl: null,
      score: 2,
      bodyPreview: 'Second',
      bodyPreviewKind: 'text',
      createdAt: '2024-02-29T11:00:00.000Z',
      permalink: '/r/example/comments/post-a/comment-2',
    },
  ];

  const groups = groupCommentsByPost(
    comments.map((comment) => toCommentBubbleDatum(comment, 'alice'))
  );

  expect(groups.map((group) => group.postId)).toEqual(['post-a', 'post-b']);
});

test('creates contributor datum contribution counts', () => {
  const contributor: ChartContributor = {
    contributorName: 'Alice',
    contributorAvatarUrl: null,
    contributorSubredditKarmaBucket: 3,
    postCount: 2,
    commentCount: 5,
    postScore: 20,
    commentScore: 30,
    totalScore: 50,
    profileUrl: '/user/Alice',
  };

  const datum = toContributorBubbleDatum(contributor, 'alice');

  expect(isContributorBubbleDatum(datum)).toBe(true);
  expect(datum.contributionCount).toBe(7);
  expect(datum.value).toEqual([30, 20, 7]);
});
