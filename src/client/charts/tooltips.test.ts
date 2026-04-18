import { expect, test, vi } from 'vitest';

import { USER_AVATAR_FALLBACK_URL } from '../../shared/api';
import { renderCommentTooltip, renderPostTooltip } from './tooltips';
import type { CommentBubbleDatum, PostBubbleDatum } from './types';

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
    expect(tooltip).toMatch(/&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
    expect(tooltip).toMatch(/<span class="chart-tooltip__you">you<\/span>/);
    expect(tooltip).toMatch(new RegExp(USER_AVATAR_FALLBACK_URL.replaceAll('.', '\\.')));
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

test('renders escaped text comment tooltip content', () => {
  const tooltip = renderCommentTooltip(
    createCommentDatum({
      bodyPreview: '<img src=x onerror=alert("x")>',
      bodyPreviewKind: 'text',
    })
  );

  expect(tooltip).toMatch(/&lt;img src=x onerror=alert\(&quot;x&quot;\)&gt;/);
  expect(tooltip).not.toMatch(/chart-tooltip__title--media/);
});

test('renders literal media label text comments as ordinary text', () => {
  const tooltip = renderCommentTooltip(
    createCommentDatum({
      bodyPreview: 'GIF comment',
      bodyPreviewKind: 'text',
    })
  );

  expect(tooltip).toMatch(/GIF comment/);
  expect(tooltip).not.toMatch(/chart-tooltip__media-label/);
});

test('renders gif comment preview as a compact media label', () => {
  const tooltip = renderCommentTooltip(
    createCommentDatum({
      bodyPreview: '![gif](giphy|VCn7Example)',
      bodyPreviewKind: 'gif',
    })
  );

  expect(tooltip).toMatch(/chart-tooltip__title--media/);
  expect(tooltip).toMatch(/chart-tooltip__media-label/);
  expect(tooltip).toMatch(/GIF/);
  expect(tooltip).not.toMatch(/content/i);
  expect(tooltip).not.toMatch(/chart-tooltip__media-icon/);
  expect(tooltip).not.toMatch(/giphy/);
});

test('renders image comment preview as a compact media label', () => {
  const tooltip = renderCommentTooltip(
    createCommentDatum({
      bodyPreview: 'https://preview.redd.it/example.jpeg?width=770',
      bodyPreviewKind: 'image',
    })
  );

  expect(tooltip).toMatch(/chart-tooltip__title--media/);
  expect(tooltip).toMatch(/chart-tooltip__media-label/);
  expect(tooltip).toMatch(/Image/);
  expect(tooltip).not.toMatch(/content/i);
  expect(tooltip).not.toMatch(/chart-tooltip__media-icon/);
  expect(tooltip).not.toMatch(/preview\.redd\.it/);
});

const createCommentDatum = (overrides: Partial<CommentBubbleDatum> = {}): CommentBubbleDatum => ({
  kind: 'comment',
  value: [Date.parse('2024-02-29T11:00:00.000Z'), 10],
  score: 10,
  bodyPreview: 'Comment',
  bodyPreviewKind: 'text',
  authorName: 'Alice',
  authorAvatarUrl: null,
  createdAt: '2024-02-29T11:00:00.000Z',
  permalink: '/r/example/comments/post-1/comment-1',
  postId: 'post-1',
  isCurrentUser: false,
  ...overrides,
});
