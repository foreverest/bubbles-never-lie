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
import { AUTHOR_SUBREDDIT_KARMA_BUCKET_COUNT } from '../shared/api';
import type {
  AuthorSubredditKarmaBucket,
  ChartDataResponse,
  ErrorResponse,
} from '../shared/api';

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
  authorSubredditKarmaBucket: AuthorSubredditKarmaBucket | null;
  title: string;
  authorName: string;
  authorAvatarUrl: string | null;
  createdAt: string;
  permalink: string;
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
const UNKNOWN_KARMA_COLOR = '#8b9b95';
const KARMA_BUCKET_COLORS = [
  '#667085',
  '#5f7488',
  '#527f8d',
  '#438b85',
  '#369875',
  '#43a95f',
  '#73bb51',
  '#aecd45',
  '#e2d13f',
  '#ffb703',
];

function App() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [activeTab, setActiveTab] = useState<TabName>('posts');
  const [zoomEnabled, setZoomEnabled] = useState(false);

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
      <section className="chart-region" aria-label="Bubble stats">
        <ChartHeader
          data={data}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          zoomEnabled={zoomEnabled}
          onZoomEnabledChange={setZoomEnabled}
        />

        {activeTab === 'posts' ? (
          <section className="chart-panel" id="posts-panel" aria-label="Posts">
            {postCount > 0 ? (
              <BubbleChart data={data} zoomEnabled={zoomEnabled} />
            ) : (
              <div className="empty-state">
                <p>No posts matched this timeframe.</p>
                <span>Try a wider date range from the create-post menu.</span>
              </div>
            )}
          </section>
        ) : (
          <section className="chart-panel stats-panel" id="stats-panel" aria-label="Stats">
            <span>Posts</span>
            <strong>{postCount.toLocaleString()}</strong>
          </section>
        )}
      </section>
    </main>
  );
}

function ChartHeader({
  data,
  activeTab,
  onTabChange,
  zoomEnabled,
  onZoomEnabledChange,
}: {
  data: ChartDataResponse;
  activeTab: TabName;
  onTabChange: (tab: TabName) => void;
  zoomEnabled: boolean;
  onZoomEnabledChange: (enabled: boolean) => void;
}) {
  const [sectionMenuOpen, setSectionMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const sectionMenuRef = useRef<HTMLDivElement | null>(null);
  const settingsRef = useRef<HTMLDivElement | null>(null);
  const activeTabLabel = activeTab === 'posts' ? 'Posts' : 'Stats';

  useEffect(() => {
    if (!sectionMenuOpen && !settingsOpen) {
      return;
    }

    const handleDocumentPointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (
        target instanceof Node &&
        sectionMenuOpen &&
        !sectionMenuRef.current?.contains(target)
      ) {
        setSectionMenuOpen(false);
      }

      if (
        target instanceof Node &&
        settingsOpen &&
        !settingsRef.current?.contains(target)
      ) {
        setSettingsOpen(false);
      }
    };

    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSectionMenuOpen(false);
        setSettingsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handleDocumentPointerDown);
    document.addEventListener('keydown', handleDocumentKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handleDocumentPointerDown);
      document.removeEventListener('keydown', handleDocumentKeyDown);
    };
  }, [sectionMenuOpen, settingsOpen]);

  const handleSectionSelect = (tab: TabName) => {
    onTabChange(tab);
    setSectionMenuOpen(false);
  };

  return (
    <header className="chart-header">
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

      <div className="chart-controls">
        <div className="chart-section-menu" ref={sectionMenuRef}>
          <button
            aria-controls={`${activeTab}-panel`}
            aria-expanded={sectionMenuOpen}
            aria-haspopup="true"
            aria-label="Bubble stats section"
            className={
              sectionMenuOpen
                ? 'section-menu-button section-menu-button--open'
                : 'section-menu-button'
            }
            onClick={() => {
              setSettingsOpen(false);
              setSectionMenuOpen((open) => !open);
            }}
            type="button"
          >
            <span>{activeTabLabel}</span>
            <svg
              aria-hidden="true"
              className="section-menu-button__icon"
              viewBox="0 0 12 12"
            >
              <path
                d="M3 4.5 6 7.5l3-3"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.6"
              />
            </svg>
          </button>

          {sectionMenuOpen ? (
            <div
              className="chart-section-menu__menu"
              aria-label="Bubble stats sections"
              role="menu"
            >
              <button
                aria-checked={activeTab === 'posts'}
                className={
                  activeTab === 'posts'
                    ? 'chart-section-menu__item chart-section-menu__item--active'
                    : 'chart-section-menu__item'
                }
                onClick={() => handleSectionSelect('posts')}
                role="menuitemradio"
                type="button"
              >
                Posts
              </button>
              <button
                aria-checked={activeTab === 'stats'}
                className={
                  activeTab === 'stats'
                    ? 'chart-section-menu__item chart-section-menu__item--active'
                    : 'chart-section-menu__item'
                }
                onClick={() => handleSectionSelect('stats')}
                role="menuitemradio"
                type="button"
              >
                Stats
              </button>
            </div>
          ) : null}
        </div>

        <div className="chart-settings" ref={settingsRef}>
          <button
            aria-expanded={settingsOpen}
            aria-haspopup="true"
            aria-label="Chart settings"
            className={
              settingsOpen
                ? 'chart-menu-button chart-menu-button--open'
                : 'chart-menu-button'
            }
            onClick={() => {
              setSectionMenuOpen(false);
              setSettingsOpen((open) => !open);
            }}
            type="button"
          >
            <svg
              aria-hidden="true"
              className="chart-menu-button__icon"
              viewBox="0 0 20 20"
            >
              <path
                d="M8.9 2.5h2.2l.4 2.1c.4.1.8.3 1.1.5l1.8-1.2L16 5.5l-1.2 1.8c.2.4.4.7.5 1.1l2.1.4v2.3l-2.1.4c-.1.4-.3.8-.5 1.1l1.2 1.8-1.6 1.6-1.8-1.2c-.4.2-.7.4-1.1.5l-.4 2.1H8.9l-.4-2.1c-.4-.1-.8-.3-1.1-.5l-1.8 1.2L4 14.5l1.2-1.8c-.2-.4-.4-.7-.5-1.1l-2.1-.4V8.9l2.1-.4c.1-.4.3-.8.5-1.1L4 5.5l1.6-1.6 1.8 1.2c.4-.2.7-.4 1.1-.5l.4-2.1Z"
                fill="none"
                stroke="currentColor"
                strokeLinejoin="round"
                strokeWidth="1.6"
              />
              <circle
                cx="10"
                cy="10"
                fill="none"
                r="2.7"
                stroke="currentColor"
                strokeWidth="1.6"
              />
            </svg>
          </button>

          {settingsOpen ? (
            <div className="chart-settings__menu" aria-label="Chart settings" role="group">
              <button
                aria-checked={zoomEnabled}
                className={
                  zoomEnabled
                    ? 'chart-settings__switch chart-settings__switch--on'
                    : 'chart-settings__switch'
                }
                onClick={() => onZoomEnabledChange(!zoomEnabled)}
                role="switch"
                type="button"
              >
                <span>Zoom</span>
                <span className="chart-settings__switch-track" aria-hidden="true">
                  <span className="chart-settings__switch-thumb" />
                </span>
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function BubbleChart({ data, zoomEnabled }: { data: ChartDataResponse; zoomEnabled: boolean }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.EChartsType | null>(null);
  const chartData = useMemo<BubbleDatum[]>(
    () =>
      data.posts.map((post) => ({
        value: [Date.parse(post.createdAt), post.score],
        score: post.score,
        comments: post.comments,
        authorSubredditKarmaBucket: post.authorSubredditKarmaBucket,
        title: post.title,
        authorName: post.authorName,
        authorAvatarUrl: post.authorAvatarUrl,
        createdAt: post.createdAt,
        permalink: post.permalink,
      })),
    [data.posts]
  );

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const container = containerRef.current;
    const chart = echarts.init(container, undefined, { renderer: 'canvas' });
    chartRef.current = chart;
    let resizeFrame = 0;

    const handleChartClick = (params: { data?: unknown }) => {
      const datum = getBubbleDatum(params.data);
      if (!datum) {
        return;
      }

      openPost(datum.permalink);
    };

    chart.on('click', handleChartClick);

    const resizeChart = () => {
      if (resizeFrame) {
        return;
      }

      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = 0;
        chart.resize();
      });
    };
    const resizeObserver = new ResizeObserver(resizeChart);
    resizeObserver.observe(container);
    window.addEventListener('resize', resizeChart);
    window.visualViewport?.addEventListener('resize', resizeChart);

    return () => {
      if (resizeFrame) {
        window.cancelAnimationFrame(resizeFrame);
      }

      chart.off('click', handleChartClick);
      resizeObserver.disconnect();
      window.removeEventListener('resize', resizeChart);
      window.visualViewport?.removeEventListener('resize', resizeChart);
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }

    chart.setOption(
      createBubbleOption(chartData, data, zoomEnabled, () => readVisibleTimeRange(chart)),
      true
    );
  }, [chartData, data, zoomEnabled]);

  return (
    <div
      className="chart-stage"
      ref={containerRef}
      role="img"
      aria-label={`Posts in r/${data.subredditName} plotted by comments and upvotes`}
    />
  );
}

function createBubbleOption(
  data: BubbleDatum[],
  chartData: ChartDataResponse,
  zoomEnabled: boolean,
  getVisibleTimeRange?: GetVisibleTimeRange
): EChartsCoreOption {
  const minScore = Math.min(0, ...data.map((datum) => datum.score));
  const maxComments = Math.max(1, ...data.map((datum) => datum.comments));
  const startTime = Date.parse(chartData.timeframe.startIso);
  const endTime = Date.parse(chartData.timeframe.endIso);

  const option: EChartsCoreOption = {
    grid: {
      top: 24,
      right: 16,
      bottom: 28,
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
        margin: 14,
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
      type: 'value',
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
            return getKarmaBucketColor(datum?.authorSubredditKarmaBucket ?? null);
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

  if (zoomEnabled) {
    option.dataZoom = {
      type: 'inside',
      filterMode: 'none',
      minSpan: 10,
    };
  }

  return option;
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
    !isAuthorSubredditKarmaBucket(datum.authorSubredditKarmaBucket) ||
    typeof datum.title !== 'string' ||
    typeof datum.authorName !== 'string' ||
    (datum.authorAvatarUrl !== null && typeof datum.authorAvatarUrl !== 'string') ||
    typeof datum.createdAt !== 'string' ||
    typeof datum.permalink !== 'string'
  ) {
    return null;
  }

  return value as BubbleDatum;
}

function isAuthorSubredditKarmaBucket(
  value: unknown
): value is AuthorSubredditKarmaBucket | null {
  return (
    value === null ||
    (typeof value === 'number' &&
      Number.isInteger(value) &&
      value >= 0 &&
      value < AUTHOR_SUBREDDIT_KARMA_BUCKET_COUNT)
  );
}

function getKarmaBucketColor(bucket: AuthorSubredditKarmaBucket | null): string {
  return bucket === null
    ? UNKNOWN_KARMA_COLOR
    : KARMA_BUCKET_COLORS[bucket] ?? UNKNOWN_KARMA_COLOR;
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
