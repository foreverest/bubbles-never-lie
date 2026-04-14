import './index.css';

import { navigateTo } from '@devvit/web/client';
import {
  DataZoomComponent,
  GridComponent,
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
  DataZoomComponent,
  GridComponent,
  ScatterChart,
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

type TimeRange = {
  start: number;
  end: number;
};

type GetVisibleTimeRange = () => TimeRange | null;

const TIME_EDGE_TOLERANCE_MS = 1_000;

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

    chart.setOption(createBubbleOption(chartData, data, () => readVisibleTimeRange(chart)), true);
  }, [chartData, data]);

  return (
    <>
      <div className="chart-title" aria-hidden="true">
        <div className="chart-title__name">
          {data.subredditIconUrl ? (
            <img
              alt=""
              className="chart-title__icon"
              src={data.subredditIconUrl}
            />
          ) : null}
          <span>r/{data.subredditName}</span>
        </div>
      </div>
      <div
        className="chart-stage"
        ref={containerRef}
        role="img"
        aria-label={`Posts in r/${data.subredditName} plotted by comments and upvotes`}
      />
    </>
  );
}

function createBubbleOption(
  data: BubbleDatum[],
  chartData: ChartDataResponse,
  getVisibleTimeRange?: GetVisibleTimeRange
): EChartsCoreOption {
  const minScore = Math.min(0, ...data.map((datum) => datum.score));
  const maxComments = Math.max(1, ...data.map((datum) => datum.comments));
  const minKarma = Math.min(0, ...data.map((datum) => datum.authorSubredditKarma));
  const maxKarma = Math.max(0, ...data.map((datum) => datum.authorSubredditKarma));
  const startTime = Date.parse(chartData.timeframe.startIso);
  const endTime = Date.parse(chartData.timeframe.endIso);

  return {
    grid: {
      top: 42,
      right: 18,
      bottom: 32,
      left: 42,
      containLabel: true,
    },
    dataZoom: {
      type: 'inside',
      filterMode: 'none',
      minSpan: 10,
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
      min: startTime,
      max: endTime,
      splitLine: {
        show: true,
        lineStyle: {
          type: 'dashed',
          color: '#e3ece8',
        },
      },
      axisLine: {
        show: true,
        lineStyle: {
          color: '#9ab0a8',
        },
      },
      axisLabel: {
        formatter: (value: number, tickIndex: number) =>
          formatXAxisLabel(
            value,
            tickIndex,
            { start: startTime, end: endTime },
            getVisibleTimeRange?.() ?? null
          ),
        showMinLabel: true,
        alignMinLabel: 'center',
        showMaxLabel: true,
        alignMaxLabel: 'center',
      },
    },
    yAxis: {
      name: 'Upvotes',
      nameLocation: 'middle',
      nameGap: 40,
      min: minScore,
      minInterval: 1,
      splitLine: {
        show: true,
        lineStyle: {
          type: 'dashed',
          color: '#e3ece8',
        },
      },
      axisLine: {
        show: true,
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

function readVisibleTimeRange(chart: echarts.EChartsType): TimeRange | null {
  const option = chart.getOption() as { dataZoom?: unknown };
  const dataZoomOptions = Array.isArray(option.dataZoom) ? option.dataZoom : [option.dataZoom];
  const dataZoomOption = dataZoomOptions.find(isDataZoomRangeOption);

  return dataZoomOption
    ? {
        start: dataZoomOption.startValue,
        end: dataZoomOption.endValue,
      }
    : null;
}

function isDataZoomRangeOption(value: unknown): value is { startValue: number; endValue: number } {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const option = value as Partial<Record<'startValue' | 'endValue', unknown>>;
  return (
    typeof option.startValue === 'number' &&
    typeof option.endValue === 'number' &&
    Number.isFinite(option.startValue) &&
    Number.isFinite(option.endValue)
  );
}

function formatXAxisLabel(
  value: number,
  tickIndex: number,
  chartTimeRange: TimeRange,
  visibleTimeRange: TimeRange | null
): string {
  const date = new Date(value);
  const currentTimeRange = visibleTimeRange ?? chartTimeRange;
  const isBoundary =
    tickIndex === 0 ||
    isTimeRangeEdge(value, currentTimeRange.start) ||
    isTimeRangeEdge(value, currentTimeRange.end);

  if (isTimeRangeEdge(value, chartTimeRange.end) && date.getMinutes() === 59) {
    date.setMinutes(date.getMinutes() + 1);
    date.setSeconds(0);
    date.setMilliseconds(0);
  }

  if (isBoundary) {
    return isMidnight(date)
      ? echarts.time.format(date.getTime(), '{MMM} {dd}', false)
      : echarts.time.format(date.getTime(), '{MMM} {dd}\n{HH}:{mm}', false);
  }

  return isMidnight(date)
    ? echarts.time.format(value, '{MMM} {dd}', false)
    : echarts.time.format(value, '{HH}:{mm}', false);
}

function isTimeRangeEdge(value: number, edge: number): boolean {
  return Math.abs(value - edge) <= TIME_EDGE_TOLERANCE_MS;
}

function isMidnight(date: Date): boolean {
  return (
    date.getHours() === 0 &&
    date.getMinutes() === 0 &&
    date.getSeconds() === 0 &&
    date.getMilliseconds() === 0
  );
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
