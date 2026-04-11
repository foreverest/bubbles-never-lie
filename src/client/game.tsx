import './index.css';

import {
  GridComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import type { EChartsCoreOption } from 'echarts/core';
import { ScatterChart } from 'echarts/charts';
import { CanvasRenderer } from 'echarts/renderers';
import { StrictMode, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { ChartDataResponse, ErrorResponse } from '../shared/api';

echarts.use([
  CanvasRenderer,
  GridComponent,
  ScatterChart,
  TitleComponent,
  TooltipComponent,
]);

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; data: ChartDataResponse }
  | { status: 'error'; message: string };

type TabName = 'posts' | 'stats';

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
  const [activeTab, setActiveTab] = useState<TabName>('posts');

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
      <nav className="tab-list" aria-label="Bubble stats sections" role="tablist">
        <button
          aria-selected={activeTab === 'posts'}
          className={activeTab === 'posts' ? 'tab-button tab-button--active' : 'tab-button'}
          onClick={() => setActiveTab('posts')}
          role="tab"
          type="button"
        >
          Posts
        </button>
        <button
          aria-selected={activeTab === 'stats'}
          className={activeTab === 'stats' ? 'tab-button tab-button--active' : 'tab-button'}
          onClick={() => setActiveTab('stats')}
          role="tab"
          type="button"
        >
          Stats
        </button>
      </nav>

      {activeTab === 'posts' ? (
        <section className="chart-region" aria-label="Bubble chart" role="tabpanel">
          {postCount > 0 ? (
            <BubbleChart data={data} />
          ) : (
            <div className="empty-state">
              <p>No posts matched this timeframe.</p>
              <span>Try a wider date range from the create-post menu.</span>
            </div>
          )}
        </section>
      ) : (
        <section className="stats-panel" aria-label="Stats" role="tabpanel">
          <span>Posts</span>
          <strong>{postCount.toLocaleString()}</strong>
        </section>
      )}
    </main>
  );
}

function BubbleChart({ data }: { data: ChartDataResponse }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.EChartsType | null>(null);
  const chartData = useMemo<BubbleDatum[]>(
    () =>
      data.posts.map((post) => [
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
    [data.posts]
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

    chart.setOption(createBubbleOption(chartData, data), true);
  }, [chartData, data]);

  return (
    <div
      className="chart-stage"
      ref={containerRef}
      role="img"
      aria-label="Posts plotted by comments and upvotes"
    />
  );
}

function createBubbleOption(data: BubbleDatum[], chartData: ChartDataResponse): EChartsCoreOption {
  const minScore = Math.min(0, ...data.map((datum) => datum[1]));
  const maxComments = Math.max(1, ...data.map((datum) => datum[2]));
  const minKarma = Math.min(0, ...data.map((datum) => datum[3]));
  const maxKarma = Math.max(0, ...data.map((datum) => datum[3]));

  return {
    backgroundColor: '#ffffff',
    title: {
      text: `Posts in ${chartData.subredditName}`,
      left: 12,
      top: 8,
      textStyle: {
        color: '#16332d',
        fontSize: 13,
        fontWeight: 700,
      },
      subtext: `${chartData.timeframe.startDate} to ${chartData.timeframe.endDate}`,
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
          color(params: { data?: unknown }) {
            const datum = params.data as BubbleDatum;
            return datum[9] ? getKarmaColor(datum[3], minKarma, maxKarma) : '#8b9b95';
          },
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

function getKarmaColor(value: number, min: number, max: number): string {
  const ratio = max === min ? 1 : (value - min) / (max - min);

  if (ratio < 0.25) {
    return '#0f8b8d';
  }

  if (ratio < 0.5) {
    return '#4caf50';
  }

  if (ratio < 0.75) {
    return '#f2c94c';
  }

  return '#e85d75';
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
