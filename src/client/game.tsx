import './index.css';

import {
  GridComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import type { EChartsCoreOption } from 'echarts/core';
import { ScatterChart } from 'echarts/charts';
import { CanvasRenderer } from 'echarts/renderers';
import { StrictMode, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { ChartDataResponse, ChartPost, ErrorResponse } from '../shared/api';

echarts.use([
  CanvasRenderer,
  GridComponent,
  ScatterChart,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
]);

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; data: ChartDataResponse }
  | { status: 'error'; message: string };

type BubbleDatum = [
  createdAtTime: number,
  score: number,
  comments: number,
  authorSubredditKarma: number,
  title: string,
  authorName: string,
  createdAt: string,
  permalink: string,
  id: string,
  authorSubredditKarmaKnown: boolean,
];

function App() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    async function loadPosts() {
      try {
        const response = await fetch('/api/posts');
        const body = (await response.json()) as ChartDataResponse | ErrorResponse;

        if (cancelled) {
          return;
        }

        if (!response.ok || 'status' in body) {
          setState({
            status: 'error',
            message: 'message' in body ? body.message : 'Unable to load posts.',
          });
          return;
        }

        setState({ status: 'ready', data: body });
      } catch (error) {
        if (!cancelled) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : 'Unable to load posts.',
          });
        }
      }
    }

    void loadPosts();

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'loading') {
    return (
      <main className="app-shell app-shell--centered">
        <p className="status-text">Loading subreddit posts...</p>
      </main>
    );
  }

  if (state.status === 'error') {
    return (
      <main className="app-shell app-shell--centered">
        <section className="message-panel" aria-live="polite">
          <p className="eyebrow">Bubble stats</p>
          <h1>Posts could not be loaded.</h1>
          <p>{state.message}</p>
        </section>
      </main>
    );
  }

  const { data } = state;
  const postCount = data.posts.length;

  return (
    <main className="app-shell">
      <header className="chart-header">
        <div>
          <p className="eyebrow">r/{data.subredditName}</p>
          <h1>Bubble stats</h1>
          <p>
            {data.timeframe.startDate} to {data.timeframe.endDate}
          </p>
        </div>
        <dl className="metric-strip" aria-label="Chart summary">
          <div>
            <dt>Posts</dt>
            <dd>{postCount}</dd>
          </div>
          <div>
            <dt>Sampled</dt>
            <dd>{data.sampledPostCount}</dd>
          </div>
          <div>
            <dt>Size</dt>
            <dd>Comments</dd>
          </div>
        </dl>
      </header>

      <section className="chart-region" aria-label="Bubble chart">
        {postCount > 0 ? (
          <BubbleChart posts={data.posts} />
        ) : (
          <div className="empty-state">
            <p>No posts matched this timeframe.</p>
            <span>Try a wider date range from the create-post menu.</span>
          </div>
        )}
      </section>
    </main>
  );
}

function BubbleChart({ posts }: { posts: ChartPost[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.EChartsType | null>(null);
  const chartData = useMemo<BubbleDatum[]>(
    () =>
      posts.map((post) => [
        Date.parse(post.createdAt),
        post.score,
        post.comments,
        post.authorSubredditKarma ?? 0,
        post.title,
        post.authorName,
        post.createdAt,
        post.permalink,
        post.id,
        post.authorSubredditKarma !== null,
      ]),
    [posts]
  );

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const chart = echarts.init(containerRef.current, undefined, { renderer: 'canvas' });
    chartRef.current = chart;

    const resizeObserver = new ResizeObserver(() => chart.resize());
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }

    chart.setOption(createBubbleOption(chartData), true);
  }, [chartData]);

  return (
    <div
      className="chart-stage"
      ref={containerRef}
      role="img"
      aria-label="Posts plotted by comments and upvotes"
    />
  );
}

function createBubbleOption(data: BubbleDatum[]): EChartsCoreOption {
  const minScore = Math.min(0, ...data.map((datum) => datum[1]));
  const maxComments = Math.max(1, ...data.map((datum) => datum[2]));
  const minKarma = Math.min(0, ...data.map((datum) => datum[3]));
  const maxKarma = Math.max(0, ...data.map((datum) => datum[3]));

  return {
    backgroundColor: '#ffffff',
    title: {
      text: 'Creation date vs. upvotes',
      left: 12,
      top: 8,
      textStyle: {
        color: '#16332d',
        fontSize: 13,
        fontWeight: 700,
      },
      subtext: 'Bubble size is comments. Color is author subreddit karma.',
      subtextStyle: {
        color: '#5c6b66',
        fontSize: 10,
      },
    },
    grid: {
      top: 58,
      right: 18,
      bottom: 56,
      left: 54,
      containLabel: true,
    },
    tooltip: {
      trigger: 'item',
      confine: true,
      borderWidth: 0,
      backgroundColor: '#16332d',
      textStyle: {
        color: '#ffffff',
      },
      extraCssText: 'border-radius:8px;box-shadow:0 12px 30px rgba(22,51,45,0.24);',
      formatter(params: { data?: unknown }) {
        const datum = params.data as BubbleDatum;
        const created = new Date(datum[6]).toLocaleString(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        });

        return [
          '<div class="chart-tooltip">',
          `<strong>${escapeHtml(datum[4])}</strong>`,
          `<span>u/${escapeHtml(datum[5])}</span>`,
          `<span>${datum[1].toLocaleString()} upvotes</span>`,
          `<span>${datum[2].toLocaleString()} comments</span>`,
          `<span>${datum[9] ? datum[3].toLocaleString() : 'Unavailable'} subreddit karma</span>`,
          `<span>${escapeHtml(created)}</span>`,
          '</div>',
        ].join('');
      },
    },
    visualMap: {
      min: minKarma,
      max: maxKarma,
      dimension: 3,
      orient: 'horizontal',
      left: 'center',
      bottom: 8,
      text: ['More karma', 'Less karma'],
      calculable: true,
      itemHeight: 130,
      itemWidth: 12,
      inRange: {
        color: ['#0f8b8d', '#4caf50', '#f2c94c', '#e85d75'],
      },
      textStyle: {
        color: '#39514a',
      },
    },
    xAxis: {
      type: 'time',
      name: 'Post creation date',
      nameLocation: 'middle',
      nameGap: 26,
      splitLine: {
        lineStyle: {
          color: '#e3ece8',
        },
      },
      axisLine: {
        lineStyle: {
          color: '#9ab0a8',
        },
      },
    },
    yAxis: {
      name: 'Upvotes',
      nameLocation: 'middle',
      nameGap: 36,
      min: minScore,
      splitLine: {
        lineStyle: {
          color: '#e3ece8',
        },
      },
      axisLine: {
        lineStyle: {
          color: '#9ab0a8',
        },
      },
    },
    series: [
      {
        name: 'Posts',
        type: 'scatter',
        data,
        symbolSize(value: BubbleDatum) {
          const comments = Math.max(0, value[2]);
          return 10 + Math.sqrt(comments / maxComments) * 34;
        },
        itemStyle: {
          borderColor: '#16332d',
          borderWidth: 1,
          opacity: 0.88,
        },
        emphasis: {
          scale: 1.35,
          itemStyle: {
            opacity: 1,
            shadowBlur: 10,
            shadowColor: 'rgba(22, 51, 45, 0.25)',
          },
        },
      },
    ],
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
