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
  AuthorsChartDataResponse,
  ChartAuthor,
  ChartComment,
  ChartResponseMetadata,
  CommentsChartDataResponse,
  ErrorResponse,
  PostsChartDataResponse,
  StatsDataResponse,
  TimeframePostData,
} from '../shared/api';

echarts.use([
  CanvasRenderer,
  DataZoomComponent,
  GridComponent,
  ScatterChart,
  TooltipComponent,
]);

type DataState<Data> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: Data }
  | { status: 'error'; message: string };

type TabName = 'posts' | 'comments' | 'authors' | 'stats';

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

type CommentBubbleDatum = {
  value: [createdAtTime: number, score: number];
  score: number;
  bodyPreview: string;
  authorName: string;
  authorAvatarUrl: string | null;
  createdAt: string;
  permalink: string;
  postId: string;
};

type AuthorBubbleDatum = {
  value: [commentScore: number, postScore: number, contributionCount: number];
  authorName: string;
  authorAvatarUrl: string | null;
  authorSubredditKarmaBucket: AuthorSubredditKarmaBucket | null;
  postCount: number;
  commentCount: number;
  contributionCount: number;
  postScore: number;
  commentScore: number;
  totalScore: number;
  profileUrl: string;
};

type CommentGroup = {
  postId: string;
  comments: CommentBubbleDatum[];
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
const TOOLTIP_AVATAR_FALLBACK =
  '<span aria-hidden="true" class="chart-tooltip__avatar chart-tooltip__avatar--fallback"></span>';
const UNKNOWN_KARMA_COLOR = '#8b9b95';
const SOAP_BUBBLE_BORDER_COLOR = 'rgba(255, 255, 255, 0.76)';
const SOAP_BUBBLE_EMPHASIS_BORDER_COLOR = 'rgba(255, 255, 255, 0.94)';
const SOAP_BUBBLE_EMPHASIS_SHADOW_COLOR = 'rgba(22, 51, 45, 0.18)';
const SOAP_BUBBLE_FILL_ALPHA = 0.84;
const COMMENT_BUBBLE_FILL_ALPHA = 0.92;
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
const COMMENT_BUBBLE_SIZE = 7;
const BUBBLE_MIN_SIZE = 10;
const BUBBLE_MAX_SIZE = 72;
const COMMENT_GROUP_COLORS = [
  '#2d6cdf',
  '#0f8b8d',
  '#5ca760',
  '#f2b84b',
  '#e85d75',
  '#7b61ff',
  '#00a676',
  '#d96c06',
  '#c44569',
  '#607d3b',
];
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_ONLY_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});
const bubbleFillColorCache = new Map<string, string>();

function App() {
  const isMountedRef = useRef(true);
  const [postsState, setPostsState] = useState<DataState<PostsChartDataResponse>>({
    status: 'loading',
  });
  const [commentsState, setCommentsState] = useState<DataState<CommentsChartDataResponse>>({
    status: 'idle',
  });
  const [authorsState, setAuthorsState] = useState<DataState<AuthorsChartDataResponse>>({
    status: 'idle',
  });
  const [statsState, setStatsState] = useState<DataState<StatsDataResponse>>({
    status: 'idle',
  });
  const [activeTab, setActiveTab] = useState<TabName>('posts');
  const [zoomEnabled, setZoomEnabled] = useState(false);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    async function loadPostsData() {
      try {
        const data = await fetchApiData<PostsChartDataResponse>(
          '/api/posts',
          'Unable to load post chart data.'
        );

        if (!isMountedRef.current) {
          return;
        }

        setPostsState({ status: 'ready', data });
      } catch (error) {
        if (isMountedRef.current) {
          console.error('Error loading post chart data:', error);
          setPostsState({
            status: 'error',
            message: error instanceof Error ? error.message : 'Unable to load post chart data.',
          });
        }
      }
    }

    void loadPostsData();
  }, []);

  useEffect(() => {
    if (activeTab !== 'comments' || commentsState.status !== 'idle') {
      return;
    }

    setCommentsState({ status: 'loading' });

    async function loadCommentsData() {
      try {
        const data = await fetchApiData<CommentsChartDataResponse>(
          '/api/comments',
          'Unable to load comment chart data.'
        );

        if (isMountedRef.current) {
          setCommentsState({ status: 'ready', data });
        }
      } catch (error) {
        if (isMountedRef.current) {
          console.error('Error loading comment chart data:', error);
          setCommentsState({
            status: 'error',
            message:
              error instanceof Error ? error.message : 'Unable to load comment chart data.',
          });
        }
      }
    }

    void loadCommentsData();
  }, [activeTab, commentsState.status]);

  useEffect(() => {
    if (activeTab !== 'authors' || authorsState.status !== 'idle') {
      return;
    }

    setAuthorsState({ status: 'loading' });

    async function loadAuthorsData() {
      try {
        const data = await fetchApiData<AuthorsChartDataResponse>(
          '/api/authors',
          'Unable to load author chart data.'
        );

        if (isMountedRef.current) {
          setAuthorsState({ status: 'ready', data });
        }
      } catch (error) {
        if (isMountedRef.current) {
          console.error('Error loading author chart data:', error);
          setAuthorsState({
            status: 'error',
            message:
              error instanceof Error ? error.message : 'Unable to load author chart data.',
          });
        }
      }
    }

    void loadAuthorsData();
  }, [activeTab, authorsState.status]);

  useEffect(() => {
    if (activeTab !== 'stats' || statsState.status !== 'idle') {
      return;
    }

    setStatsState({ status: 'loading' });

    async function loadStatsData() {
      try {
        const data = await fetchApiData<StatsDataResponse>(
          '/api/stats',
          'Unable to load stats data.'
        );

        if (isMountedRef.current) {
          setStatsState({ status: 'ready', data });
        }
      } catch (error) {
        if (isMountedRef.current) {
          console.error('Error loading stats data:', error);
          setStatsState({
            status: 'error',
            message: error instanceof Error ? error.message : 'Unable to load stats data.',
          });
        }
      }
    }

    void loadStatsData();
  }, [activeTab, statsState.status]);

  if (postsState.status === 'loading' || postsState.status === 'idle') {
    return (
      <main className="app-shell app-shell--centered">
        <p className="status-text">Loading subreddit post chart data...</p>
      </main>
    );
  }

  if (postsState.status === 'error') {
    return (
      <main className="app-shell app-shell--centered">
        <section className="message-panel" aria-live="polite">
          <p className="eyebrow">Bubble stats</p>
          <h1>Chart data could not be loaded.</h1>
          <p>{postsState.message}</p>
        </section>
      </main>
    );
  }

  const { data: postsData } = postsState;

  return (
    <main className="app-shell">
      <section className="chart-region" aria-label="Bubble stats">
        <ChartHeader
          data={postsData}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          zoomEnabled={zoomEnabled}
          onZoomEnabledChange={setZoomEnabled}
        />

        {activeTab === 'posts' ? (
          <PostsPanel data={postsData} zoomEnabled={zoomEnabled} />
        ) : activeTab === 'comments' ? (
          <CommentsPanel state={commentsState} zoomEnabled={zoomEnabled} />
        ) : activeTab === 'authors' ? (
          <AuthorsPanel state={authorsState} zoomEnabled={zoomEnabled} />
        ) : (
          <StatsPanel state={statsState} />
        )}
      </section>
    </main>
  );
}

function PostsPanel({
  data,
  zoomEnabled,
}: {
  data: PostsChartDataResponse;
  zoomEnabled: boolean;
}) {
  return (
    <section className="chart-panel" id="posts-panel" aria-label="Posts">
      {data.posts.length > 0 ? (
        <BubbleChart data={data} zoomEnabled={zoomEnabled} />
      ) : (
        <EmptyState
          contentLabel="posts"
          subredditName={data.subredditName}
          timeframe={data.timeframe}
        />
      )}
    </section>
  );
}

function CommentsPanel({
  state,
  zoomEnabled,
}: {
  state: DataState<CommentsChartDataResponse>;
  zoomEnabled: boolean;
}) {
  return (
    <section className="chart-panel" id="comments-panel" aria-label="Comments">
      {state.status === 'ready' ? (
        state.data.comments.length > 0 ? (
          <CommentsChart data={state.data} zoomEnabled={zoomEnabled} />
        ) : (
          <EmptyState
            contentLabel="comments"
            subredditName={state.data.subredditName}
            timeframe={state.data.timeframe}
          />
        )
      ) : (
        <PanelState state={state} loadingMessage="Loading comment chart data..." />
      )}
    </section>
  );
}

function AuthorsPanel({
  state,
  zoomEnabled,
}: {
  state: DataState<AuthorsChartDataResponse>;
  zoomEnabled: boolean;
}) {
  return (
    <section className="chart-panel" id="authors-panel" aria-label="Authors">
      {state.status === 'ready' ? (
        state.data.authors.length > 0 ? (
          <AuthorsChart data={state.data} zoomEnabled={zoomEnabled} />
        ) : (
          <EmptyState
            contentLabel="active authors"
            subredditName={state.data.subredditName}
            timeframe={state.data.timeframe}
          />
        )
      ) : (
        <PanelState state={state} loadingMessage="Loading author chart data..." />
      )}
    </section>
  );
}

function StatsPanel({ state }: { state: DataState<StatsDataResponse> }) {
  if (state.status !== 'ready') {
    return (
      <section className="chart-panel" id="stats-panel" aria-label="Stats">
        <PanelState state={state} loadingMessage="Loading stats data..." />
      </section>
    );
  }

  return (
    <section className="chart-panel stats-panel" id="stats-panel" aria-label="Stats">
      <div className="stats-panel__item">
        <span>Posts</span>
        <strong>{state.data.postCount.toLocaleString()}</strong>
      </div>
      <div className="stats-panel__item">
        <span>Comments</span>
        <strong>{state.data.commentCount.toLocaleString()}</strong>
      </div>
      <div className="stats-panel__item">
        <span>Authors</span>
        <strong>{state.data.authorCount.toLocaleString()}</strong>
      </div>
    </section>
  );
}

function PanelState<Data>({
  state,
  loadingMessage,
}: {
  state: DataState<Data>;
  loadingMessage: string;
}) {
  if (state.status === 'error') {
    return (
      <div className="empty-state" aria-live="polite">
        <p>Data could not be loaded.</p>
        <span>{state.message}</span>
      </div>
    );
  }

  return (
    <div className="empty-state" aria-live="polite">
      <p>{loadingMessage}</p>
    </div>
  );
}

function EmptyState({
  contentLabel,
  subredditName,
  timeframe,
}: {
  contentLabel: string;
  subredditName: string;
  timeframe: TimeframePostData;
}) {
  const datePhrase = formatTimeframeDatePhrase(timeframe);

  return (
    <div className="empty-state">
      <p>{`No ${contentLabel} found ${datePhrase}.`}</p>
      <span>
        {`Try choosing dates when r/${subredditName} had activity.`}
      </span>
    </div>
  );
}

async function fetchApiData<Data>(path: string, fallbackMessage: string): Promise<Data> {
  const response = await fetch(path);
  const body = (await response.json()) as Data | ErrorResponse;

  if (!response.ok || isErrorResponse(body)) {
    console.error(`Error response from ${path}:`, body);
    throw new Error(isErrorResponse(body) ? body.message : fallbackMessage);
  }

  return body;
}

function isErrorResponse(value: unknown): value is ErrorResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const body = value as Partial<Record<keyof ErrorResponse, unknown>>;
  return body.status === 'error' && typeof body.message === 'string';
}

function ChartHeader({
  data,
  activeTab,
  onTabChange,
  zoomEnabled,
  onZoomEnabledChange,
}: {
  data: ChartResponseMetadata;
  activeTab: TabName;
  onTabChange: (tab: TabName) => void;
  zoomEnabled: boolean;
  onZoomEnabledChange: (enabled: boolean) => void;
}) {
  const [sectionMenuOpen, setSectionMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const sectionMenuRef = useRef<HTMLDivElement | null>(null);
  const settingsRef = useRef<HTMLDivElement | null>(null);
  const activeTabLabel = getTabLabel(activeTab);

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
                aria-checked={activeTab === 'comments'}
                className={
                  activeTab === 'comments'
                    ? 'chart-section-menu__item chart-section-menu__item--active'
                    : 'chart-section-menu__item'
                }
                onClick={() => handleSectionSelect('comments')}
                role="menuitemradio"
                type="button"
              >
                Comments
              </button>
              <button
                aria-checked={activeTab === 'authors'}
                className={
                  activeTab === 'authors'
                    ? 'chart-section-menu__item chart-section-menu__item--active'
                    : 'chart-section-menu__item'
                }
                onClick={() => handleSectionSelect('authors')}
                role="menuitemradio"
                type="button"
              >
                Authors
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

function BubbleChart({
  data,
  zoomEnabled,
}: {
  data: PostsChartDataResponse;
  zoomEnabled: boolean;
}) {
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

function CommentsChart({
  data,
  zoomEnabled,
}: {
  data: CommentsChartDataResponse;
  zoomEnabled: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.EChartsType | null>(null);
  const chartData = useMemo<CommentBubbleDatum[]>(
    () => data.comments.map(toCommentBubbleDatum),
    [data.comments]
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
      const datum = getCommentBubbleDatum(params.data);
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
      createCommentsOption(chartData, data, zoomEnabled, () => readVisibleTimeRange(chart)),
      true
    );
  }, [chartData, data, zoomEnabled]);

  return (
    <div
      className="chart-stage"
      ref={containerRef}
      role="img"
      aria-label={`Comments in r/${data.subredditName} plotted by creation time and upvotes`}
    />
  );
}

function AuthorsChart({
  data,
  zoomEnabled,
}: {
  data: AuthorsChartDataResponse;
  zoomEnabled: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.EChartsType | null>(null);
  const chartData = useMemo<AuthorBubbleDatum[]>(
    () => data.authors.map(toAuthorBubbleDatum),
    [data.authors]
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
      const datum = getAuthorBubbleDatum(params.data);
      if (!datum) {
        return;
      }

      openPost(datum.profileUrl);
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

    chart.setOption(createAuthorsOption(chartData, zoomEnabled), true);
  }, [chartData, zoomEnabled]);

  return (
    <div
      className="chart-stage"
      ref={containerRef}
      role="img"
      aria-label={`Authors in r/${data.subredditName} plotted by total comment upvotes and total post upvotes`}
    />
  );
}

function createBubbleOption(
  data: BubbleDatum[],
  chartData: ChartResponseMetadata,
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

        const createdAgo = formatRelativeAge(new Date(datum.createdAt));

        return [
          '<article class="chart-tooltip">',
          '<div class="chart-tooltip__meta">',
          renderTooltipAvatar(datum.authorAvatarUrl),
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
          return getPostBubbleSize(comments, maxComments);
        },
        itemStyle: {
          borderColor: SOAP_BUBBLE_BORDER_COLOR,
          borderWidth: 1.5,
          color(params: { data?: unknown }) {
            const datum = getBubbleDatum(params.data);
            return getBubbleFillColor(
              getKarmaBucketColor(datum?.authorSubredditKarmaBucket ?? null),
              SOAP_BUBBLE_FILL_ALPHA
            );
          },
          opacity: 0.6,
        },
        emphasis: {
          scale: 1.35,
          itemStyle: {
            borderColor: SOAP_BUBBLE_EMPHASIS_BORDER_COLOR,
            borderWidth: 1.5,
            opacity: 0.9,
            shadowBlur: 8,
            shadowColor: SOAP_BUBBLE_EMPHASIS_SHADOW_COLOR,
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

function createCommentsOption(
  data: CommentBubbleDatum[],
  chartData: ChartResponseMetadata,
  zoomEnabled: boolean,
  getVisibleTimeRange?: GetVisibleTimeRange
): EChartsCoreOption {
  const minScore = Math.min(0, ...data.map((datum) => datum.score));
  const startTime = Date.parse(chartData.timeframe.startIso);
  const endTime = Date.parse(chartData.timeframe.endIso);
  const commentGroups = groupCommentsByPost(data);
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
        const datum = getCommentBubbleDatum(params.data);
        if (!datum) {
          return '';
        }

        const createdAgo = formatRelativeAge(new Date(datum.createdAt));

        return [
          '<article class="chart-tooltip chart-tooltip--comment">',
          '<div class="chart-tooltip__meta">',
          renderTooltipAvatar(datum.authorAvatarUrl),
          `<span class="chart-tooltip__username">u/${escapeHtml(datum.authorName)}</span>`,
          '<span aria-hidden="true" class="chart-tooltip__separator">&middot;</span>',
          `<span class="chart-tooltip__age">${escapeHtml(createdAgo)}</span>`,
          '</div>',
          `<strong class="chart-tooltip__title">${escapeHtml(datum.bodyPreview)}</strong>`,
          '<div class="chart-tooltip__stats">',
          `<span class="chart-tooltip__stat">${UPVOTE_ICON}${datum.score.toLocaleString()} upvotes</span>`,
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
    series: commentGroups.map((group) => ({
      name: group.postId,
      type: 'scatter',
      cursor: 'pointer',
      data: group.comments,
      symbolSize: COMMENT_BUBBLE_SIZE,
      itemStyle: {
        borderColor: SOAP_BUBBLE_BORDER_COLOR,
        borderWidth: 1,
        color: getBubbleFillColor(getCommentGroupColor(group.postId), COMMENT_BUBBLE_FILL_ALPHA),
        opacity: 0.6,
      },
      emphasis: {
        focus: 'series',
        scale: 1.8,
        itemStyle: {
          borderColor: SOAP_BUBBLE_EMPHASIS_BORDER_COLOR,
          borderWidth: 1.5,
          opacity: 0.9,
          shadowBlur: 8,
          shadowColor: SOAP_BUBBLE_EMPHASIS_SHADOW_COLOR,
        },
      },
      blur: {
        itemStyle: {
          opacity: 0.12,
        },
      },
    })),
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

function createAuthorsOption(
  data: AuthorBubbleDatum[],
  zoomEnabled: boolean
): EChartsCoreOption {
  const minCommentScore = Math.min(0, ...data.map((datum) => datum.commentScore));
  const maxCommentScore = Math.max(0, ...data.map((datum) => datum.commentScore));
  const minPostScore = Math.min(0, ...data.map((datum) => datum.postScore));
  const maxPostScore = Math.max(0, ...data.map((datum) => datum.postScore));
  const maxContributionCount = Math.max(0, ...data.map((datum) => datum.contributionCount));
  const option: EChartsCoreOption = {
    grid: {
      top: 24,
      right: 16,
      bottom: 32,
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
        const datum = getAuthorBubbleDatum(params.data);
        if (!datum) {
          return '';
        }

        return [
          '<article class="chart-tooltip">',
          '<div class="chart-tooltip__meta">',
          renderTooltipAvatar(datum.authorAvatarUrl),
          `<span class="chart-tooltip__username">u/${escapeHtml(datum.authorName)}</span>`,
          '</div>',
          '<div class="chart-tooltip__stats">',
          `<span class="chart-tooltip__stat">${datum.postCount.toLocaleString()} posts</span>`,
          `<span class="chart-tooltip__stat">${datum.commentCount.toLocaleString()} comments</span>`,
          '</div>',
          '<div class="chart-tooltip__stats">',
          `<span class="chart-tooltip__stat">${UPVOTE_ICON}${datum.postScore.toLocaleString()} post upvotes</span>`,
          `<span class="chart-tooltip__stat">${UPVOTE_ICON}${datum.commentScore.toLocaleString()} comment upvotes</span>`,
          '</div>',
          '<div class="chart-tooltip__stats">',
          `<span class="chart-tooltip__stat">${UPVOTE_ICON}${datum.totalScore.toLocaleString()} total upvotes</span>`,
          '</div>',
          '</article>',
        ].join('');
      },
    },
    xAxis: {
      name: 'Comment Upvotes',
      nameLocation: 'middle',
      nameGap: 30,
      type: 'value',
      min: minCommentScore,
      max: maxCommentScore,
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
    yAxis: {
      name: 'Post Upvotes',
      nameLocation: 'middle',
      nameGap: 40,
      type: 'value',
      min: minPostScore,
      max: maxPostScore,
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
        name: 'Authors',
        type: 'scatter',
        cursor: 'pointer',
        data,
        encode: {
          x: 0,
          y: 1,
        },
        symbolSize(_value: unknown, params?: { data?: unknown }) {
          const datum = getAuthorBubbleDatum(params?.data);
          return getAuthorBubbleSize(datum?.contributionCount ?? 0, maxContributionCount);
        },
        itemStyle: {
          borderColor: SOAP_BUBBLE_BORDER_COLOR,
          borderWidth: 1.5,
          color(params: { data?: unknown }) {
            const datum = getAuthorBubbleDatum(params.data);
            return getBubbleFillColor(
              getKarmaBucketColor(datum?.authorSubredditKarmaBucket ?? null),
              SOAP_BUBBLE_FILL_ALPHA
            );
          },
          opacity: 0.6,
        },
        emphasis: {
          scale: 1.35,
          itemStyle: {
            borderColor: SOAP_BUBBLE_EMPHASIS_BORDER_COLOR,
            borderWidth: 2,
            opacity: 0.9,
            shadowBlur: 8,
            shadowColor: SOAP_BUBBLE_EMPHASIS_SHADOW_COLOR,
          },
        },
      },
    ],
  };

  if (zoomEnabled) {
    option.dataZoom = [
      {
        type: 'inside',
        xAxisIndex: 0,
        filterMode: 'none',
        minSpan: 1,
      },
      {
        type: 'inside',
        yAxisIndex: 0,
        filterMode: 'none',
        minSpan: 1,
      },
    ];
  }

  return option;
}

function getAuthorBubbleSize(contributionCount: number, maxContributionCount: number): number {
  const count = Math.max(0, contributionCount);

  if (maxContributionCount <= 0) {
    return BUBBLE_MIN_SIZE;
  }

  return getScaledBubbleSize(count / maxContributionCount);
}

function getPostBubbleSize(commentCount: number, maxCommentCount: number): number {
  const count = Math.max(0, commentCount);

  if (maxCommentCount <= 0) {
    return BUBBLE_MIN_SIZE;
  }

  return getScaledBubbleSize(Math.sqrt(count / maxCommentCount));
}

function getScaledBubbleSize(ratio: number): number {
  const clampedRatio = Math.min(Math.max(ratio, 0), 1);

  return BUBBLE_MIN_SIZE + clampedRatio * (BUBBLE_MAX_SIZE - BUBBLE_MIN_SIZE);
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

function getTabLabel(tab: TabName): string {
  switch (tab) {
    case 'posts':
      return 'Posts';
    case 'comments':
      return 'Comments';
    case 'authors':
      return 'Authors';
    case 'stats':
      return 'Stats';
  }
}

function toCommentBubbleDatum(comment: ChartComment): CommentBubbleDatum {
  return {
    value: [Date.parse(comment.createdAt), comment.score],
    score: comment.score,
    bodyPreview: comment.bodyPreview,
    authorName: comment.authorName,
    authorAvatarUrl: comment.authorAvatarUrl,
    createdAt: comment.createdAt,
    permalink: comment.permalink,
    postId: comment.postId,
  };
}

function toAuthorBubbleDatum(author: ChartAuthor): AuthorBubbleDatum {
  const contributionCount = author.postCount + author.commentCount;

  return {
    value: [author.commentScore, author.postScore, contributionCount],
    authorName: author.authorName,
    authorAvatarUrl: author.authorAvatarUrl,
    authorSubredditKarmaBucket: author.authorSubredditKarmaBucket,
    postCount: author.postCount,
    commentCount: author.commentCount,
    contributionCount,
    postScore: author.postScore,
    commentScore: author.commentScore,
    totalScore: author.totalScore,
    profileUrl: author.profileUrl,
  };
}

function groupCommentsByPost(data: CommentBubbleDatum[]): CommentGroup[] {
  const groups = new Map<string, CommentGroup>();

  data.forEach((datum) => {
    const group = groups.get(datum.postId);

    if (group) {
      group.comments.push(datum);
      return;
    }

    groups.set(datum.postId, {
      postId: datum.postId,
      comments: [datum],
    });
  });

  return [...groups.values()].sort((a, b) => a.postId.localeCompare(b.postId));
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

function getCommentBubbleDatum(value: unknown): CommentBubbleDatum | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const datum = value as Partial<Record<keyof CommentBubbleDatum, unknown>>;
  if (
    !Array.isArray(datum.value) ||
    typeof datum.value[0] !== 'number' ||
    typeof datum.value[1] !== 'number' ||
    typeof datum.score !== 'number' ||
    typeof datum.bodyPreview !== 'string' ||
    typeof datum.authorName !== 'string' ||
    (datum.authorAvatarUrl !== null && typeof datum.authorAvatarUrl !== 'string') ||
    typeof datum.createdAt !== 'string' ||
    typeof datum.permalink !== 'string' ||
    typeof datum.postId !== 'string'
  ) {
    return null;
  }

  return value as CommentBubbleDatum;
}

function getAuthorBubbleDatum(value: unknown): AuthorBubbleDatum | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const datum = value as Partial<Record<keyof AuthorBubbleDatum, unknown>>;
  if (
    !Array.isArray(datum.value) ||
    typeof datum.value[0] !== 'number' ||
    typeof datum.value[1] !== 'number' ||
    typeof datum.value[2] !== 'number' ||
    typeof datum.authorName !== 'string' ||
    (datum.authorAvatarUrl !== null && typeof datum.authorAvatarUrl !== 'string') ||
    !isAuthorSubredditKarmaBucket(datum.authorSubredditKarmaBucket) ||
    typeof datum.postCount !== 'number' ||
    typeof datum.commentCount !== 'number' ||
    typeof datum.contributionCount !== 'number' ||
    typeof datum.postScore !== 'number' ||
    typeof datum.commentScore !== 'number' ||
    typeof datum.totalScore !== 'number' ||
    typeof datum.profileUrl !== 'string'
  ) {
    return null;
  }

  return value as AuthorBubbleDatum;
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

function getCommentGroupColor(postId: string): string {
  return COMMENT_GROUP_COLORS[hashString(postId) % COMMENT_GROUP_COLORS.length] ?? '#0f8b8d';
}

function getBubbleFillColor(baseColor: string, alpha: number): string {
  const cacheKey = `${baseColor}:${alpha}`;
  const cachedColor = bubbleFillColorCache.get(cacheKey);
  if (cachedColor) {
    return cachedColor;
  }

  const rgb = hexToRgb(baseColor) ?? hexToRgb('#0f8b8d');
  const color = rgb ? toRgba(rgb, alpha) : `rgba(15, 139, 141, ${alpha})`;

  bubbleFillColorCache.set(cacheKey, color);
  return color;
}

function hexToRgb(color: string): { red: number; green: number; blue: number } | null {
  const hex = color.startsWith('#') ? color.slice(1) : color;

  if (!/^[\da-f]{6}$/i.test(hex)) {
    return null;
  }

  const colorValue = Number.parseInt(hex, 16);
  return {
    red: (colorValue >> 16) & 255,
    green: (colorValue >> 8) & 255,
    blue: colorValue & 255,
  };
}

function toRgba(
  { red, green, blue }: { red: number; green: number; blue: number },
  alpha: number
): string {
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function formatTimeframeDatePhrase(timeframe: TimeframePostData): string {
  const startDate = formatDateOnly(timeframe.startDate);
  const endDate = formatDateOnly(timeframe.endDate);

  return timeframe.startDate === timeframe.endDate
    ? `on ${startDate}`
    : `from ${startDate} through ${endDate}`;
}

function formatDateOnly(value: string): string {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) {
    return value;
  }

  const [, rawYear, rawMonth, rawDay] = match;
  const year = Number(rawYear);
  const month = Number(rawMonth);
  const day = Number(rawDay);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return value;
  }

  return DATE_ONLY_FORMATTER.format(date);
}

function renderTooltipAvatar(authorAvatarUrl: string | null): string {
  return authorAvatarUrl
    ? `<img alt="" class="chart-tooltip__avatar" src="${escapeHtml(authorAvatarUrl)}">`
    : TOOLTIP_AVATAR_FALLBACK;
}

function hashString(value: string): number {
  let hash = 0;

  for (const symbol of value) {
    hash = (hash * 31 + symbol.codePointAt(0)!) >>> 0;
  }

  return hash;
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
