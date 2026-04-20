import { expect, test, vi } from 'vitest';

import {
  COMMENT_GIF_PREVIEW_MARKER,
  COMMENT_IMAGE_PREVIEW_MARKER,
  USER_AVATAR_FALLBACK_URL,
} from '../../shared/api';
import { formatCompactUpvoteCount } from './formatting';
import {
  renderCommentTooltip,
  renderContributorTooltip,
  renderPostTooltip,
} from './tooltips';
import type {
  CommentBubbleDatum,
  ContributorBubbleDatum,
  PostBubbleDatum,
} from './types';

test('formats compact upvote counts with stable en-US notation', () => {
  expect(formatCompactUpvoteCount(999)).toBe('999');
  expect(formatCompactUpvoteCount(2_000)).toBe('2K');
  expect(formatCompactUpvoteCount(3_624)).toBe('3.6K');
  expect(formatCompactUpvoteCount(-3_624)).toBe('-3.6K');
  expect(formatCompactUpvoteCount(1_200_000)).toBe('1.2M');
});

test('renders escaped post tooltip content with fallback avatar and current-user badge', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2024-02-29T12:00:00.000Z'));

  const datum: PostBubbleDatum = {
    kind: 'post',
    value: [Date.parse('2024-02-29T11:00:00.000Z'), 10],
    score: 10,
    comments: 2,
    authorSubredditKarmaBucket: null,
    title: '<script>alert("x")</script>',
    authorName: 'Alice & Bob',
    authorAvatarUrl: null,
    createdAt: '2024-02-29T11:00:00.000Z',
    permalink: '/r/example/comments/post-1',
    isCurrentUser: true,
  };

  try {
    const tooltip = renderPostTooltip(datum);

    expect(tooltip).toMatch(/chart-tooltip--light/);
    expect(tooltip).toMatch(/Alice &amp; Bob/);
    expect(tooltip).toMatch(
      /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/
    );
    expect(tooltip).toMatch(/<span class="chart-tooltip__you">you<\/span>/);
    expect(tooltip).toMatch(
      new RegExp(USER_AVATAR_FALLBACK_URL.replaceAll('.', '\\.'))
    );
    expect(tooltip).toMatch(/1 hour ago/);
  } finally {
    vi.useRealTimers();
  }
});

test('renders dark themed post tooltip class when requested', () => {
  const datum: PostBubbleDatum = {
    kind: 'post',
    value: [Date.parse('2024-02-29T11:00:00.000Z'), 10],
    score: 10,
    comments: 2,
    authorSubredditKarmaBucket: null,
    title: 'Post',
    authorName: 'Alice',
    authorAvatarUrl: null,
    createdAt: '2024-02-29T11:00:00.000Z',
    permalink: '/r/example/comments/post-1',
    isCurrentUser: false,
  };

  expect(renderPostTooltip(datum, 'dark')).toMatch(/chart-tooltip--dark/);
});

test('renders compact tooltip upvotes while keeping count metrics exact', () => {
  const postTooltip = renderPostTooltip(
    createPostDatum({
      score: 3_624,
      comments: 2_000,
      value: [Date.parse('2024-02-29T11:00:00.000Z'), 3_624],
    })
  );
  const commentTooltip = renderCommentTooltip(
    createCommentDatum({
      score: 2_000,
      value: [Date.parse('2024-02-29T11:00:00.000Z'), 2_000],
    })
  );
  const contributorTooltip = renderContributorTooltip(
    createContributorDatum({
      postCount: 1_200,
      commentCount: 2_300,
      postScore: 3_624,
      commentScore: 1_200_000,
      value: [1_200_000, 3_624, 3_500],
    })
  );

  expect(postTooltip).toContain('aria-label="3.6K upvotes"');
  expect(postTooltip).toContain(
    '<span class="chart-tooltip__metric-value">3.6K</span>'
  );
  expect(postTooltip).toContain('aria-label="2,000 comments"');
  expect(postTooltip).toContain(
    '<span class="chart-tooltip__metric-value">2,000</span>'
  );
  expect(commentTooltip).toContain('aria-label="2K upvotes"');
  expect(commentTooltip).toContain(
    '<span class="chart-tooltip__metric-value">2K</span>'
  );
  expect(contributorTooltip).toContain('aria-label="3.6K post upvotes"');
  expect(contributorTooltip).toContain('aria-label="1.2M comment upvotes"');
  expect(contributorTooltip).toContain('aria-label="1,200 posts"');
  expect(contributorTooltip).toContain('aria-label="2,300 comments"');
});

test('renders escaped text comment tooltip content', () => {
  const tooltip = renderCommentTooltip(
    createCommentDatum({
      bodyPreview: '<img src=x onerror=alert("x")>',
    })
  );

  expect(tooltip).toMatch(/&lt;img src=x onerror=alert\(&quot;x&quot;\)&gt;/);
  expect(tooltip).not.toMatch(/chart-tooltip__media-label/);
});

test('renders literal media label text comments as ordinary text', () => {
  const tooltip = renderCommentTooltip(
    createCommentDatum({
      bodyPreview: 'GIF comment',
    })
  );

  expect(tooltip).toMatch(/GIF comment/);
  expect(tooltip).not.toMatch(/chart-tooltip__media-label/);
});

test('renders gif comment preview as a compact media label', () => {
  const tooltip = renderCommentTooltip(
    createCommentDatum({
      bodyPreview: COMMENT_GIF_PREVIEW_MARKER,
    })
  );

  expect(tooltip).toMatch(/chart-tooltip__media-label/);
  expect(tooltip).toMatch(/GIF/);
  expect(tooltip).not.toMatch(/content/i);
  expect(tooltip).not.toMatch(/chart-tooltip__media-icon/);
  expect(tooltip).not.toMatch(/giphy/);
});

test('renders image comment preview as a compact media label', () => {
  const tooltip = renderCommentTooltip(
    createCommentDatum({
      bodyPreview: COMMENT_IMAGE_PREVIEW_MARKER,
    })
  );

  expect(tooltip).toMatch(/chart-tooltip__media-label/);
  expect(tooltip).toMatch(/Image/);
  expect(tooltip).not.toMatch(/content/i);
  expect(tooltip).not.toMatch(/chart-tooltip__media-icon/);
  expect(tooltip).not.toMatch(/preview\.redd\.it/);
});

test('renders mixed comment preview markers inline with escaped text', () => {
  const tooltip = renderCommentTooltip(
    createCommentDatum({
      bodyPreview: `look ${COMMENT_GIF_PREVIEW_MARKER} then <b>move</b>`,
    })
  );

  expect(tooltip).toMatch(/look /);
  expect(tooltip).toMatch(/chart-tooltip__media-label/);
  expect(tooltip).toMatch(/GIF/);
  expect(tooltip).toMatch(/ then &lt;b&gt;move&lt;\/b&gt;/);
  expect(tooltip).not.toMatch(/giphy/);
});

const createPostDatum = (
  overrides: Partial<PostBubbleDatum> = {}
): PostBubbleDatum => ({
  kind: 'post',
  value: [Date.parse('2024-02-29T11:00:00.000Z'), 10],
  score: 10,
  comments: 2,
  authorSubredditKarmaBucket: null,
  title: 'Post',
  authorName: 'Alice',
  authorAvatarUrl: null,
  createdAt: '2024-02-29T11:00:00.000Z',
  permalink: '/r/example/comments/post-1',
  isCurrentUser: false,
  ...overrides,
});

const createCommentDatum = (
  overrides: Partial<CommentBubbleDatum> = {}
): CommentBubbleDatum => ({
  kind: 'comment',
  value: [Date.parse('2024-02-29T11:00:00.000Z'), 10],
  score: 10,
  bodyPreview: 'Comment',
  authorName: 'Alice',
  authorAvatarUrl: null,
  createdAt: '2024-02-29T11:00:00.000Z',
  permalink: '/r/example/comments/post-1/comment-1',
  postId: 'post-1',
  isCurrentUser: false,
  ...overrides,
});

const createContributorDatum = (
  overrides: Partial<ContributorBubbleDatum> = {}
): ContributorBubbleDatum => ({
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
  isCurrentUser: false,
  ...overrides,
});
