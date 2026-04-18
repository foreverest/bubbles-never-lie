import { SVGRenderer } from 'echarts/renderers';
import { expect, test } from 'vitest';

import type { ChartPost, ChartResponseMetadata } from '../../shared/api';
import { toPostBubbleDatum } from './data';
import { echarts } from './echarts';
import { createPostsOption } from './options/posts';

echarts.use([SVGRenderer]);

test('renders both time-axis edge labels on narrow time charts', () => {
  const start = new Date(2024, 0, 1, 0, 0, 0, 0);
  const end = new Date(2024, 0, 8, 0, 0, 0, 0);
  const chartData: ChartResponseMetadata = {
    subredditName: 'example',
    subredditIconUrl: null,
    timeframe: {
      type: 'bubble-stats-timeframe',
      startIso: start.toISOString(),
      endIso: end.toISOString(),
    },
    generatedAt: start.toISOString(),
  };
  const post: ChartPost = {
    id: 'post-1',
    title: 'Post',
    authorName: 'Alice',
    authorAvatarUrl: null,
    comments: 4,
    score: 10,
    authorSubredditKarmaBucket: 2,
    createdAt: new Date(2024, 0, 3, 12, 0, 0, 0).toISOString(),
    permalink: '/r/example/comments/post-1',
  };
  const chart = echarts.init(null, undefined, {
    renderer: 'svg',
    ssr: true,
    width: 220,
    height: 240,
  });

  try {
    chart.setOption(createPostsOption([toPostBubbleDatum(post, 'alice')], chartData, false, false));

    const renderedText = chart.renderToSVGString().replace(/<[^>]+>/g, ' ');

    expect(renderedText).toContain('Jan 01');
    expect(renderedText).toContain('Jan 08');
  } finally {
    chart.dispose();
  }
});
