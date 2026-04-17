import { expect, test, vi } from 'vitest';

import { USER_AVATAR_FALLBACK_URL } from '../../shared/api';
import { renderPostTooltip } from './tooltips';
import type { PostBubbleDatum } from './types';

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
