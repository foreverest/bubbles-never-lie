import './index.css';

import { navigateTo } from '@devvit/web/client';
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

type BubbleDatum = {
  value: [createdAtTime: number, score: number];
  score: number;
  comments: number;
  authorSubredditKarma: number;
  title: string;
  authorName: string;
  authorAvatarUrl: string | null;
  createdAt: string;
  permalink: string;
  authorSubredditKarmaKnown: boolean;
};

const UPVOTE_ICON =
  '<svg aria-hidden="true" class="chart-tooltip__stat-icon" viewBox="0 0 20 20"><path d="M10 3 3.5 10H7v6h6v-6h3.5L10 3Z" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="2"/></svg>';
const COMMENT_ICON =
  '<svg aria-hidden="true" class="chart-tooltip__stat-icon" viewBox="0 0 20 20"><path d="M4 5.5h12v8H8.4L4 16.5v-11Z" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="2"/></svg>';

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
      data.posts.map((post) => ({
        value: [Date.parse(post.createdAt), post.score],
        score: post.score,
        comments: post.comments,
        authorSubredditKarma: post.authorSubredditKarma ?? 0,
        title: post.title,
        authorName: post.authorName,
        authorAvatarUrl: post.authorAvatarUrl,
        createdAt: post.createdAt,
        permalink: post.permalink,
        authorSubredditKarmaKnown: post.authorSubredditKarma !== null,
      })),
    [data.posts]
  );

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const chart = echarts.init(containerRef.current, undefined, { renderer: 'canvas' });
    chartRef.current = chart;

    const handleChartClick = (params: { data?: unknown }) => {
      const datum = getBubbleDatum(params.data);
      if (!datum) {
        return;
      }

      openPost(datum.permalink);
    };

    chart.on('click', handleChartClick);

    const resizeObserver = new ResizeObserver(() => chart.resize());
    resizeObserver.observe(containerRef.current);

    return () => {
      chart.off('click', handleChartClick);
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
  const minScore = Math.min(0, ...data.map((datum) => datum.score));
  const maxComments = Math.max(1, ...data.map((datum) => datum.comments));
  const minKarma = Math.min(0, ...data.map((datum) => datum.authorSubredditKarma));
  const maxKarma = Math.max(0, ...data.map((datum) => datum.authorSubredditKarma));

  return {
    backgroundColor: '#ffffff',
    title: {
      text: `Posts in r/${chartData.subredditName}`.toUpperCase(),
      left: 12,
      top: 8,
      textStyle: {
        color: '#16332d',
        fontSize: 13,
        fontWeight: 700,
      },
      subtext: `created between ${chartData.timeframe.startDate} and ${chartData.timeframe.endDate}`,
      subtextStyle: {
        color: '#5c6b66',
        fontSize: 10,
      },
    },
    grid: {
      top: 58,
      right: 18,
      bottom: 42,
      left: 42,
      containLabel: true,
    },
    tooltip: {
      trigger: 'item',
      confine: true,
      borderWidth: 0,
      backgroundColor: '#101010',
      textStyle: {
        color: '#ffffff',
      },
      extraCssText: 'border-radius:8px;box-shadow:0 12px 30px rgba(0,0,0,0.28);padding:0;',
      formatter(params: { data?: unknown }) {
        const datum = getBubbleDatum(params.data);
        if (!datum) {
          return '';
        }

        const avatar = datum.authorAvatarUrl
          ? `<img alt="" class="chart-tooltip__avatar" src="${escapeHtml(datum.authorAvatarUrl)}">`
          : '<span aria-hidden="true" class="chart-tooltip__avatar chart-tooltip__avatar--fallback"></span>';
        const createdAgo = formatRelativeAge(new Date(datum.createdAt));

        return [
          '<article class="chart-tooltip">',
          '<div class="chart-tooltip__meta">',
          avatar,
          `<span class="chart-tooltip__username">u/${escapeHtml(datum.authorName)}</span>`,
          '<span aria-hidden="true" class="chart-tooltip__separator">&middot;</span>',
          `<span class="chart-tooltip__age">${escapeHtml(createdAgo)}</span>`,
          '</div>',
          `<strong class="chart-tooltip__title">${escapeHtml(datum.title)}</strong>`,
          '<div class="chart-tooltip__stats">',
          `<span class="chart-tooltip__stat">${UPVOTE_ICON}${datum.score.toLocaleString()} upvotes</span>`,
          `<span class="chart-tooltip__stat">${COMMENT_ICON}${datum.comments.toLocaleString()} comments</span>`,
          '</div>',
          '</article>',
        ].join('');
      },
    },
    xAxis: {
      type: 'time',
      min: Date.parse(chartData.timeframe.startIso),
      max: Date.parse(chartData.timeframe.endIso),
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
      nameGap: 30,
      min: minScore,
      minInterval: 1,
      splitLine: {
        show: false,
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
        cursor: 'pointer',
        data,
        symbolSize(_value: unknown, params?: { data?: unknown }) {
          const datum = getBubbleDatum(params?.data);
          const comments = datum ? Math.max(0, datum.comments) : 0;
          return 10 + Math.sqrt(comments / maxComments) * 34;
        },
        itemStyle: {
          borderColor: '#ffffff',
          borderWidth: 2,
          color(params: { data?: unknown }) {
            const datum = getBubbleDatum(params.data);
            if (!datum?.authorSubredditKarmaKnown) {
              return '#8b9b95';
            }

            return getKarmaColor(datum.authorSubredditKarma, minKarma, maxKarma);
          },
          opacity: 0.5,
        },
        emphasis: {
          scale: 1.35,
          itemStyle: {
            opacity: 0.75,
            shadowBlur: 10,
            shadowColor: 'rgba(22, 51, 45, 0.25)',
          },
        },
      },
    ],
  };
}

function getBubbleDatum(value: unknown): BubbleDatum | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const datum = value as Partial<Record<keyof BubbleDatum, unknown>>;
  if (
    !Array.isArray(datum.value) ||
    typeof datum.value[0] !== 'number' ||
    typeof datum.value[1] !== 'number' ||
    typeof datum.score !== 'number' ||
    typeof datum.comments !== 'number' ||
    typeof datum.authorSubredditKarma !== 'number' ||
    typeof datum.title !== 'string' ||
    typeof datum.authorName !== 'string' ||
    (datum.authorAvatarUrl !== null && typeof datum.authorAvatarUrl !== 'string') ||
    typeof datum.createdAt !== 'string' ||
    typeof datum.permalink !== 'string' ||
    typeof datum.authorSubredditKarmaKnown !== 'boolean'
  ) {
    return null;
  }

  return value as BubbleDatum;
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

function formatRelativeAge(date: Date): string {
  const secondsAgo = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  const units = [
    { seconds: 31_536_000, label: 'yr.' },
    { seconds: 2_592_000, label: 'mo.' },
    { seconds: 604_800, label: 'wk.' },
    { seconds: 86_400, label: 'd.' },
    { seconds: 3_600, label: 'hr.' },
    { seconds: 60, label: 'min.' },
  ];

  for (const unit of units) {
    if (secondsAgo >= unit.seconds) {
      return `${Math.floor(secondsAgo / unit.seconds)} ${unit.label} ago`;
    }
  }

  return 'just now';
}

function openPost(permalink: string): void {
  const url = new URL(permalink, 'https://www.reddit.com');
  navigateTo(url.toString());
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
