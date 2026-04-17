import './index.css';

import { context as clientContext, navigateTo } from '@devvit/web/client';
import {
  DataZoomComponent,
  GridComponent,
  TooltipComponent,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import type { EChartsCoreOption } from 'echarts/core';
import { EffectScatterChart, ScatterChart } from 'echarts/charts';
import { CanvasRenderer } from 'echarts/renderers';
import { StrictMode, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  SUBREDDIT_KARMA_BUCKET_COUNT,
  USER_AVATAR_FALLBACK_URL,
  resolveUserAvatarUrl,
} from '../shared/api';
import type {
  SubredditKarmaBucket,
  ContributorsChartDataResponse,
  ChartContributor,
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
  EffectScatterChart,
  ScatterChart,
  TooltipComponent,
]);

type DataState<Data> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: Data }
  | { status: 'error'; message: string };

type TabName = 'posts' | 'comments' | 'contributors' | 'stats';

type ChartPreferences = {
  zoomEnabled: boolean;
  currentUserRippleEnabled: boolean;
};

type BubbleDatum = {
  value: [createdAtTime: number, score: number];
  score: number;
  comments: number;
  authorSubredditKarmaBucket: SubredditKarmaBucket | null;
  title: string;
  authorName: string;
  authorAvatarUrl: string | null;
  createdAt: string;
  permalink: string;
} & CurrentUserDatumFields;

type CommentBubbleDatum = {
  value: [createdAtTime: number, score: number];
  score: number;
  bodyPreview: string;
  authorName: string;
  authorAvatarUrl: string | null;
  createdAt: string;
  permalink: string;
  postId: string;
} & CurrentUserDatumFields;

type ContributorBubbleDatum = {
  value: [commentScore: number, postScore: number, contributionCount: number];
  contributorName: string;
  contributorAvatarUrl: string | null;
  contributorSubredditKarmaBucket: SubredditKarmaBucket | null;
  postCount: number;
  commentCount: number;
  contributionCount: number;
  postScore: number;
  commentScore: number;
  profileUrl: string;
} & CurrentUserDatumFields;

type CurrentUserDatumFields = {
  isCurrentUser: boolean;
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
type SymbolSizeOption = number | ((_value: unknown, params?: { data?: unknown }) => number);
type RippleColorOption = string | ((params: { data?: unknown }) => string);

const TIME_EDGE_TOLERANCE_MS = 1_000;

const TOOLTIP_UPVOTE_ICON =
  '<svg aria-hidden="true" class="chart-tooltip__metric-icon" fill="currentColor" height="16" viewBox="0 0 20 20" width="16" xmlns="http://www.w3.org/2000/svg"><path d="M10 19a3.966 3.966 0 01-3.96-3.962V10.98H2.838a1.731 1.731 0 01-1.605-1.073 1.734 1.734 0 01.377-1.895L9.364.254a.925.925 0 011.272 0l7.754 7.759c.498.499.646 1.242.376 1.894-.27.652-.9 1.073-1.605 1.073h-3.202v4.058A3.965 3.965 0 019.999 19H10zM2.989 9.179H7.84v5.731c0 1.13.81 2.163 1.934 2.278a2.163 2.163 0 002.386-2.15V9.179h4.851L10 2.163 2.989 9.179z"></path></svg>';
const TOOLTIP_DOWNVOTE_ICON =
  '<svg aria-hidden="true" class="chart-tooltip__metric-icon" fill="currentColor" height="16" viewBox="0 0 20 20" width="16" xmlns="http://www.w3.org/2000/svg"><path d="M10 1a3.966 3.966 0 013.96 3.962V9.02h3.202c.706 0 1.335.42 1.605 1.073.27.652.122 1.396-.377 1.895l-7.754 7.759a.925.925 0 01-1.272 0l-7.754-7.76a1.734 1.734 0 01-.376-1.894c.27-.652.9-1.073 1.605-1.073h3.202V4.962A3.965 3.965 0 0110 1zm7.01 9.82h-4.85V5.09c0-1.13-.81-2.163-1.934-2.278a2.163 2.163 0 00-2.386 2.15v5.859H2.989l7.01 7.016 7.012-7.016z"></path></svg>';
const TOOLTIP_COMMENT_ICON =
  '<svg aria-hidden="true" class="chart-tooltip__metric-icon" fill="currentColor" height="16" viewBox="0 0 20 20" width="16" xmlns="http://www.w3.org/2000/svg"><path d="M10 1a9 9 0 00-9 9c0 1.947.79 3.58 1.935 4.957L.231 17.661A.784.784 0 00.785 19H10a9 9 0 009-9 9 9 0 00-9-9zm0 16.2H6.162c-.994.004-1.907.053-3.045.144l-.076-.188a36.981 36.981 0 002.328-2.087l-1.05-1.263C3.297 12.576 2.8 11.331 2.8 10c0-3.97 3.23-7.2 7.2-7.2s7.2 3.23 7.2 7.2-3.23 7.2-7.2 7.2z"></path></svg>';
const TOOLTIP_POST_ICON =
  '<svg aria-hidden="true" class="chart-tooltip__metric-icon" fill="currentColor" height="20" viewBox="0 0 20 20" width="20" xmlns="http://www.w3.org/2000/svg"><path d="M14.7 2H5.3C3.48 2 2 3.48 2 5.3v9.4C2 16.52 3.48 18 5.3 18h9.4c1.82 0 3.3-1.48 3.3-3.3V5.3C18 3.48 16.52 2 14.7 2zm1.5 12.7c0 .83-.67 1.5-1.5 1.5H5.3c-.83 0-1.5-.67-1.5-1.5V5.3c0-.83.67-1.5 1.5-1.5h9.4c.83 0 1.5.67 1.5 1.5v9.4z"></path><path d="M12 11.1H6v1.8h6v-1.8zM14 7.1H6v1.8h8V7.1z"></path></svg>';
const SOAP_BUBBLE_BORDER_COLOR = 'rgba(255, 255, 255, 0.88)';
const SOAP_BUBBLE_EMPHASIS_BORDER_COLOR = 'rgba(255, 255, 255, 0.98)';
const SOAP_BUBBLE_EMPHASIS_SHADOW_COLOR = 'rgba(15, 23, 42, 0.18)';
const SOAP_BUBBLE_FILL_ALPHA = 0.9;
const COMMENT_BUBBLE_FILL_ALPHA = 0.94;
const CHART_GRID_LINE_COLOR = '#edf1f4';
const CHART_AXIS_LINE_COLOR = '#c6d1d8';
const CHART_AXIS_LABEL_COLOR = '#56636d';
const CHART_AXIS_NAME_COLOR = '#697780';
const CHART_TOOLTIP_BACKGROUND_COLOR = '#ffffff';
const CHART_TOOLTIP_EXTRA_CSS =
  'border-radius:8px;box-shadow:0 18px 44px rgba(15,23,42,0.18);padding:0;';
const CURRENT_USER_RIPPLE_SERIES_Z = 4;
const CURRENT_USER_RIPPLE_EFFECT = {
  brushType: 'fill',
  scale: 3,
  period: 3,
  number: 3,
} as const;
const CURRENT_USER_POST_RIPPLE_SERIES_ID = 'current-user-post-ripple';
const CURRENT_USER_CONTRIBUTOR_RIPPLE_SERIES_ID = 'current-user-contributor-ripple';
const CHART_COLOR_PALETTE = [
  '#267c8c',
  '#d65a31',
  '#2f9e74',
  '#c8325e',
  '#6f58c9',
  '#d99a22',
  '#3487d4',
  '#6a9f35',
  '#c84f9b',
  '#60758a',
] as const;
const CHART_COLOR_FALLBACK = CHART_COLOR_PALETTE[0];
const CHART_UNKNOWN_BUCKET_COLOR = '#9aa6b2';
const COMMENT_BUBBLE_SIZE = 10;
const COMMENT_GROUP_EMPHASIZED_BUBBLE_SIZE = 26;
const BUBBLE_MIN_SIZE = 10;
const BUBBLE_MAX_SIZE = 72;
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_ONLY_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});
const bubbleFillColorCache = new Map<string, string>();
const CHART_PREFERENCES_STORAGE_KEY = 'bubble-stats:chart-preferences:v1';
const DEFAULT_CHART_PREFERENCES: ChartPreferences = {
  zoomEnabled: false,
  currentUserRippleEnabled: false,
};

function App() {
  const isMountedRef = useRef(true);
  const [postsState, setPostsState] = useState<DataState<PostsChartDataResponse>>({
    status: 'loading',
  });
  const [commentsState, setCommentsState] = useState<DataState<CommentsChartDataResponse>>({
    status: 'idle',
  });
  const [contributorsState, setContributorsState] =
    useState<DataState<ContributorsChartDataResponse>>({
      status: 'idle',
    });
  const [statsState, setStatsState] = useState<DataState<StatsDataResponse>>({
    status: 'idle',
  });
  const [activeTab, setActiveTab] = useState<TabName>('posts');
  const [chartPreferences, setChartPreferences] =
    useState<ChartPreferences>(readStoredChartPreferences);
  const { zoomEnabled, currentUserRippleEnabled } = chartPreferences;

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    writeStoredChartPreferences(chartPreferences);
  }, [chartPreferences]);

  useEffect(() => {
    const handleAvatarLoadError = (event: Event) => {
      const target = event.target;

      if (
        !(target instanceof HTMLImageElement) ||
        !target.classList.contains('chart-tooltip__avatar') ||
        target.src === USER_AVATAR_FALLBACK_URL
      ) {
        return;
      }

      target.src = USER_AVATAR_FALLBACK_URL;
    };

    document.addEventListener('error', handleAvatarLoadError, true);

    return () => {
      document.removeEventListener('error', handleAvatarLoadError, true);
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
    if (activeTab !== 'contributors' || contributorsState.status !== 'idle') {
      return;
    }

    setContributorsState({ status: 'loading' });

    async function loadContributorsData() {
      try {
        const data = await fetchApiData<ContributorsChartDataResponse>(
          '/api/contributors',
          'Unable to load contributor chart data.'
        );

        if (isMountedRef.current) {
          setContributorsState({ status: 'ready', data });
        }
      } catch (error) {
        if (isMountedRef.current) {
          console.error('Error loading contributor chart data:', error);
          setContributorsState({
            status: 'error',
            message:
              error instanceof Error ? error.message : 'Unable to load contributor chart data.',
          });
        }
      }
    }

    void loadContributorsData();
  }, [activeTab, contributorsState.status]);

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
          onZoomEnabledChange={(nextZoomEnabled) =>
            setChartPreferences((preferences) => ({
              ...preferences,
              zoomEnabled: nextZoomEnabled,
            }))
          }
          currentUserRippleEnabled={currentUserRippleEnabled}
          onCurrentUserRippleEnabledChange={(nextCurrentUserRippleEnabled) =>
            setChartPreferences((preferences) => ({
              ...preferences,
              currentUserRippleEnabled: nextCurrentUserRippleEnabled,
            }))
          }
        />

        {activeTab === 'posts' ? (
          <PostsPanel
            data={postsData}
            zoomEnabled={zoomEnabled}
            currentUserRippleEnabled={currentUserRippleEnabled}
          />
        ) : activeTab === 'comments' ? (
          <CommentsPanel
            state={commentsState}
            zoomEnabled={zoomEnabled}
            currentUserRippleEnabled={currentUserRippleEnabled}
          />
        ) : activeTab === 'contributors' ? (
          <ContributorsPanel
            state={contributorsState}
            zoomEnabled={zoomEnabled}
            currentUserRippleEnabled={currentUserRippleEnabled}
          />
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
  currentUserRippleEnabled,
}: {
  data: PostsChartDataResponse;
  zoomEnabled: boolean;
  currentUserRippleEnabled: boolean;
}) {
  return (
    <section className="chart-panel" id="posts-panel" aria-label="Posts">
      {data.posts.length > 0 ? (
        <BubbleChart
          data={data}
          zoomEnabled={zoomEnabled}
          currentUserRippleEnabled={currentUserRippleEnabled}
        />
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
  currentUserRippleEnabled,
}: {
  state: DataState<CommentsChartDataResponse>;
  zoomEnabled: boolean;
  currentUserRippleEnabled: boolean;
}) {
  return (
    <section className="chart-panel" id="comments-panel" aria-label="Comments">
      {state.status === 'ready' ? (
        state.data.comments.length > 0 ? (
          <CommentsChart
            data={state.data}
            zoomEnabled={zoomEnabled}
            currentUserRippleEnabled={currentUserRippleEnabled}
          />
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

function ContributorsPanel({
  state,
  zoomEnabled,
  currentUserRippleEnabled,
}: {
  state: DataState<ContributorsChartDataResponse>;
  zoomEnabled: boolean;
  currentUserRippleEnabled: boolean;
}) {
  return (
    <section className="chart-panel" id="contributors-panel" aria-label="Contributors">
      {state.status === 'ready' ? (
        state.data.contributors.length > 0 ? (
          <ContributorsChart
            data={state.data}
            zoomEnabled={zoomEnabled}
            currentUserRippleEnabled={currentUserRippleEnabled}
          />
        ) : (
          <EmptyState
            contentLabel="active contributors"
            subredditName={state.data.subredditName}
            timeframe={state.data.timeframe}
          />
        )
      ) : (
        <PanelState state={state} loadingMessage="Loading contributor chart data..." />
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
        <span className="stats-panel__label">Posts</span>
        <strong>{state.data.postCount.toLocaleString()}</strong>
      </div>
      <div className="stats-panel__item">
        <span className="stats-panel__label">Comments</span>
        <strong>{state.data.commentCount.toLocaleString()}</strong>
      </div>
      <div className="stats-panel__item">
        <span className="stats-panel__label">Contributors</span>
        <strong>{state.data.contributorCount.toLocaleString()}</strong>
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

function readStoredChartPreferences(): ChartPreferences {
  if (typeof window === 'undefined') {
    return DEFAULT_CHART_PREFERENCES;
  }

  try {
    const storedPreferences = window.localStorage.getItem(CHART_PREFERENCES_STORAGE_KEY);
    if (!storedPreferences) {
      return DEFAULT_CHART_PREFERENCES;
    }

    return normalizeChartPreferences(JSON.parse(storedPreferences) as unknown);
  } catch {
    return DEFAULT_CHART_PREFERENCES;
  }
}

function writeStoredChartPreferences(preferences: ChartPreferences): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(CHART_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // localStorage can be unavailable in embedded or privacy-restricted browsers.
  }
}

function normalizeChartPreferences(value: unknown): ChartPreferences {
  if (!value || typeof value !== 'object') {
    return DEFAULT_CHART_PREFERENCES;
  }

  const preferences = value as Partial<Record<keyof ChartPreferences, unknown>>;

  return {
    zoomEnabled:
      typeof preferences.zoomEnabled === 'boolean'
        ? preferences.zoomEnabled
        : DEFAULT_CHART_PREFERENCES.zoomEnabled,
    currentUserRippleEnabled:
      typeof preferences.currentUserRippleEnabled === 'boolean'
        ? preferences.currentUserRippleEnabled
        : DEFAULT_CHART_PREFERENCES.currentUserRippleEnabled,
  };
}

function ChartHeader({
  data,
  activeTab,
  onTabChange,
  zoomEnabled,
  onZoomEnabledChange,
  currentUserRippleEnabled,
  onCurrentUserRippleEnabledChange,
}: {
  data: ChartResponseMetadata;
  activeTab: TabName;
  onTabChange: (tab: TabName) => void;
  zoomEnabled: boolean;
  onZoomEnabledChange: (enabled: boolean) => void;
  currentUserRippleEnabled: boolean;
  onCurrentUserRippleEnabledChange: (enabled: boolean) => void;
}) {
  const [sectionMenuOpen, setSectionMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);
  const sectionMenuRef = useRef<HTMLDivElement | null>(null);
  const settingsRef = useRef<HTMLDivElement | null>(null);
  const mobileControlsRef = useRef<HTMLDivElement | null>(null);
  const activeTabLabel = getTabLabel(activeTab);
  const timeframeLabel = formatTimeframeDateRangeLabel(data.timeframe);

  useEffect(() => {
    if (!sectionMenuOpen && !settingsOpen && !mobileControlsOpen) {
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

      if (
        target instanceof Node &&
        mobileControlsOpen &&
        !mobileControlsRef.current?.contains(target)
      ) {
        setMobileControlsOpen(false);
      }
    };

    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSectionMenuOpen(false);
        setSettingsOpen(false);
        setMobileControlsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handleDocumentPointerDown);
    document.addEventListener('keydown', handleDocumentKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handleDocumentPointerDown);
      document.removeEventListener('keydown', handleDocumentKeyDown);
    };
  }, [mobileControlsOpen, sectionMenuOpen, settingsOpen]);

  const handleSectionSelect = (tab: TabName) => {
    onTabChange(tab);
    setSectionMenuOpen(false);
    setMobileControlsOpen(false);
  };

  return (
    <header className="chart-header">
      <div className="chart-header__main">
        <div
          className={
            data.subredditIconUrl ? 'chart-title chart-title--with-icon' : 'chart-title'
          }
        >
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
          <p className="chart-title__meta">{timeframeLabel}</p>
        </div>
      </div>

      <div className="chart-controls chart-controls--desktop">
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
              setMobileControlsOpen(false);
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
                aria-checked={activeTab === 'contributors'}
                className={
                  activeTab === 'contributors'
                    ? 'chart-section-menu__item chart-section-menu__item--active'
                    : 'chart-section-menu__item'
                }
                onClick={() => handleSectionSelect('contributors')}
                role="menuitemradio"
                type="button"
              >
                Contributors
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
              setMobileControlsOpen(false);
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
              <button
                aria-checked={currentUserRippleEnabled}
                className={
                  currentUserRippleEnabled
                    ? 'chart-settings__switch chart-settings__switch--on'
                    : 'chart-settings__switch'
                }
                onClick={() => onCurrentUserRippleEnabledChange(!currentUserRippleEnabled)}
                role="switch"
                type="button"
              >
                <span>My bubbles</span>
                <span className="chart-settings__switch-track" aria-hidden="true">
                  <span className="chart-settings__switch-thumb" />
                </span>
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="chart-mobile-controls" ref={mobileControlsRef}>
        <button
          aria-expanded={mobileControlsOpen}
          aria-haspopup="true"
          aria-label="Chart navigation and settings"
          className={
            mobileControlsOpen
              ? 'chart-mobile-controls__button chart-mobile-controls__button--open'
              : 'chart-mobile-controls__button'
          }
          onClick={() => {
            setSectionMenuOpen(false);
            setSettingsOpen(false);
            setMobileControlsOpen((open) => !open);
          }}
          type="button"
        >
          <span>{activeTabLabel}</span>
          <svg
            aria-hidden="true"
            className="chart-mobile-controls__icon"
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

        {mobileControlsOpen ? (
          <div className="chart-mobile-controls__menu">
            <div
              className="chart-mobile-controls__group"
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
                aria-checked={activeTab === 'contributors'}
                className={
                  activeTab === 'contributors'
                    ? 'chart-section-menu__item chart-section-menu__item--active'
                    : 'chart-section-menu__item'
                }
                onClick={() => handleSectionSelect('contributors')}
                role="menuitemradio"
                type="button"
              >
                Contributors
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

            <div className="chart-mobile-controls__group" aria-label="Chart settings" role="group">
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
              <button
                aria-checked={currentUserRippleEnabled}
                className={
                  currentUserRippleEnabled
                    ? 'chart-settings__switch chart-settings__switch--on'
                    : 'chart-settings__switch'
                }
                onClick={() => onCurrentUserRippleEnabledChange(!currentUserRippleEnabled)}
                role="switch"
                type="button"
              >
                <span>My bubbles</span>
                <span className="chart-settings__switch-track" aria-hidden="true">
                  <span className="chart-settings__switch-thumb" />
                </span>
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </header>
  );
}

function BubbleChart({
  data,
  zoomEnabled,
  currentUserRippleEnabled,
}: {
  data: PostsChartDataResponse;
  zoomEnabled: boolean;
  currentUserRippleEnabled: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.EChartsType | null>(null);
  const currentUsername = normalizeUsername(clientContext.username);
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
        ...getCurrentUserDatumFields(post.authorName, currentUsername),
      })),
    [currentUsername, data.posts]
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
      createBubbleOption(
        chartData,
        data,
        zoomEnabled,
        currentUserRippleEnabled,
        () => readVisibleTimeRange(chart)
      ),
      true
    );
  }, [chartData, currentUserRippleEnabled, data, zoomEnabled]);

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
  currentUserRippleEnabled,
}: {
  data: CommentsChartDataResponse;
  zoomEnabled: boolean;
  currentUserRippleEnabled: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.EChartsType | null>(null);
  const emphasizedCommentGroupRef = useRef<string | null>(null);
  const currentUsername = normalizeUsername(clientContext.username);
  const chartData = useMemo<CommentBubbleDatum[]>(
    () => data.comments.map((comment) => toCommentBubbleDatum(comment, currentUsername)),
    [currentUsername, data.comments]
  );

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const container = containerRef.current;
    const chart = echarts.init(container, undefined, { renderer: 'canvas' });
    chartRef.current = chart;
    let resizeFrame = 0;
    let clearCommentGroupEmphasisFrame = 0;

    const setEmphasizedCommentGroup = (nextPostId: string | null) => {
      const previousPostId = emphasizedCommentGroupRef.current;
      if (previousPostId === nextPostId) {
        return;
      }

      const series = [
        ...(previousPostId
          ? [
              {
                id: getCommentGroupSeriesId(previousPostId),
                symbolSize: COMMENT_BUBBLE_SIZE,
              },
            ]
          : []),
        ...(nextPostId
          ? [
              {
                id: getCommentGroupSeriesId(nextPostId),
                symbolSize: COMMENT_GROUP_EMPHASIZED_BUBBLE_SIZE,
              },
            ]
          : []),
      ];

      emphasizedCommentGroupRef.current = nextPostId;

      if (series.length > 0) {
        chart.setOption({ series });
      }
    };

    const cancelPendingCommentGroupClear = () => {
      if (!clearCommentGroupEmphasisFrame) {
        return;
      }

      window.cancelAnimationFrame(clearCommentGroupEmphasisFrame);
      clearCommentGroupEmphasisFrame = 0;
    };

    const handleChartClick = (params: { data?: unknown }) => {
      const datum = getCommentBubbleDatum(params.data);
      if (!datum) {
        return;
      }

      openPost(datum.permalink);
    };

    const handleCommentMouseOver = (params: { data?: unknown }) => {
      const datum = getCommentBubbleDatum(params.data);
      if (!datum) {
        return;
      }

      cancelPendingCommentGroupClear();
      setEmphasizedCommentGroup(datum.postId);
    };

    const handleCommentMouseOut = (params: { data?: unknown }) => {
      const datum = getCommentBubbleDatum(params.data);
      if (!datum) {
        return;
      }

      cancelPendingCommentGroupClear();
      clearCommentGroupEmphasisFrame = window.requestAnimationFrame(() => {
        clearCommentGroupEmphasisFrame = 0;

        if (emphasizedCommentGroupRef.current === datum.postId) {
          setEmphasizedCommentGroup(null);
        }
      });
    };

    const handleCommentGlobalOut = () => {
      cancelPendingCommentGroupClear();
      setEmphasizedCommentGroup(null);
    };

    chart.on('click', handleChartClick);
    chart.on('mouseover', handleCommentMouseOver);
    chart.on('mouseout', handleCommentMouseOut);
    chart.on('globalout', handleCommentGlobalOut);

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
      cancelPendingCommentGroupClear();

      chart.off('click', handleChartClick);
      chart.off('mouseover', handleCommentMouseOver);
      chart.off('mouseout', handleCommentMouseOut);
      chart.off('globalout', handleCommentGlobalOut);
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

    emphasizedCommentGroupRef.current = null;
    chart.setOption(
      createCommentsOption(
        chartData,
        data,
        zoomEnabled,
        currentUserRippleEnabled,
        () => readVisibleTimeRange(chart)
      ),
      true
    );
  }, [chartData, currentUserRippleEnabled, data, zoomEnabled]);

  return (
    <div
      className="chart-stage"
      ref={containerRef}
      role="img"
      aria-label={`Comments in r/${data.subredditName} plotted by creation time and upvotes`}
    />
  );
}

function ContributorsChart({
  data,
  zoomEnabled,
  currentUserRippleEnabled,
}: {
  data: ContributorsChartDataResponse;
  zoomEnabled: boolean;
  currentUserRippleEnabled: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.EChartsType | null>(null);
  const currentUsername = normalizeUsername(clientContext.username);
  const chartData = useMemo<ContributorBubbleDatum[]>(
    () =>
      data.contributors.map((contributor) =>
        toContributorBubbleDatum(contributor, currentUsername)
      ),
    [currentUsername, data.contributors]
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
      const datum = getContributorBubbleDatum(params.data);
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

    chart.setOption(
      createContributorsOption(chartData, zoomEnabled, currentUserRippleEnabled),
      true
    );
  }, [chartData, currentUserRippleEnabled, zoomEnabled]);

  return (
    <div
      className="chart-stage"
      ref={containerRef}
      role="img"
      aria-label={`Contributors in r/${data.subredditName} plotted by total comment upvotes and total post upvotes`}
    />
  );
}

function createBubbleOption(
  data: BubbleDatum[],
  chartData: ChartResponseMetadata,
  zoomEnabled: boolean,
  currentUserRippleEnabled: boolean,
  getVisibleTimeRange?: GetVisibleTimeRange
): EChartsCoreOption {
  const minScore = Math.min(0, ...data.map((datum) => datum.score));
  const maxComments = Math.max(1, ...data.map((datum) => datum.comments));
  const startTime = Date.parse(chartData.timeframe.startIso);
  const endTime = Date.parse(chartData.timeframe.endIso);
  const currentUserData = data.filter((datum) => datum.isCurrentUser);
  const getPostSymbolSize = (_value: unknown, params?: { data?: unknown }) => {
    const datum = getBubbleDatum(params?.data);
    const comments = datum ? Math.max(0, datum.comments) : 0;
    return getPostBubbleSize(comments, maxComments);
  };
  const getPostBubbleColor = (params: { data?: unknown }) => {
    const datum = getBubbleDatum(params.data);
    return getBubbleFillColor(
      getKarmaBucketColor(datum?.authorSubredditKarmaBucket ?? null),
      SOAP_BUBBLE_FILL_ALPHA
    );
  };

  const option: EChartsCoreOption = {
    grid: {
      top: 34,
      right: 28,
      bottom: 40,
      left: 48,
      containLabel: true,
    },
    tooltip: {
      trigger: 'item',
      confine: true,
      borderWidth: 0,
      backgroundColor: CHART_TOOLTIP_BACKGROUND_COLOR,
      textStyle: {
        color: '#0f1419',
      },
      extraCssText: CHART_TOOLTIP_EXTRA_CSS,
      formatter(params: { data?: unknown }) {
        const datum = getBubbleDatum(params.data);
        if (!datum) {
          return '';
        }

        const createdAgo = formatRelativeAge(new Date(datum.createdAt), { labelStyle: 'long' });

        return [
          '<article class="chart-tooltip chart-tooltip--light chart-tooltip--post">',
          '<div class="chart-tooltip__meta">',
          renderTooltipAvatar(datum.authorAvatarUrl),
          `<span class="chart-tooltip__username">u/${escapeHtml(datum.authorName)}</span>`,
          renderCurrentUserTooltipBadge(datum.isCurrentUser),
          '<span aria-hidden="true" class="chart-tooltip__separator">&middot;</span>',
          `<span class="chart-tooltip__age">${escapeHtml(createdAgo)}</span>`,
          '</div>',
          `<strong class="chart-tooltip__title">${escapeHtml(datum.title)}</strong>`,
          '<div class="chart-tooltip__stats">',
          renderTooltipVotePill(datum.score),
          renderTooltipCommentPill(datum.comments),
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
          type: 'solid',
          color: CHART_GRID_LINE_COLOR,
        },
      },
      axisLine: {
        show: true,
        lineStyle: {
          color: CHART_AXIS_LINE_COLOR,
        },
      },
      axisTick: {
        show: false,
      },
      axisLabel: {
        color: CHART_AXIS_LABEL_COLOR,
        fontSize: 12,
        fontWeight: 600,
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
      nameTextStyle: {
        color: CHART_AXIS_NAME_COLOR,
        fontSize: 12,
        fontWeight: 700,
      },
      type: 'value',
      min: minScore,
      minInterval: 1,
      splitLine: {
        show: true,
        lineStyle: {
          type: 'solid',
          color: CHART_GRID_LINE_COLOR,
        },
      },
      axisLine: {
        show: true,
        lineStyle: {
          color: CHART_AXIS_LINE_COLOR,
        },
      },
      axisTick: {
        show: false,
      },
      axisLabel: {
        color: CHART_AXIS_LABEL_COLOR,
        fontSize: 12,
        fontWeight: 600,
      },
    },
    series: [
      {
        name: 'Posts',
        type: 'scatter',
        cursor: 'pointer',
        data,
        symbolSize: getPostSymbolSize,
        itemStyle: {
          borderColor: SOAP_BUBBLE_BORDER_COLOR,
          borderWidth: 1.5,
          color: getPostBubbleColor,
          opacity: 0.82,
        },
        emphasis: {
          scale: 1.35,
          itemStyle: {
            borderColor: SOAP_BUBBLE_EMPHASIS_BORDER_COLOR,
            borderWidth: 1.5,
            opacity: 0.96,
            shadowBlur: 14,
            shadowColor: SOAP_BUBBLE_EMPHASIS_SHADOW_COLOR,
          },
        },
      },
      ...(currentUserRippleEnabled && currentUserData.length > 0
        ? [
            createCurrentUserRippleSeries({
              id: CURRENT_USER_POST_RIPPLE_SERIES_ID,
              name: 'Posts',
              data: currentUserData,
              symbolSize: getPostSymbolSize,
              color: getPostBubbleColor,
            }),
          ]
        : []),
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
  currentUserRippleEnabled: boolean,
  getVisibleTimeRange?: GetVisibleTimeRange
): EChartsCoreOption {
  const minScore = Math.min(0, ...data.map((datum) => datum.score));
  const startTime = Date.parse(chartData.timeframe.startIso);
  const endTime = Date.parse(chartData.timeframe.endIso);
  const commentGroups = groupCommentsByPost(data);
  const option: EChartsCoreOption = {
    grid: {
      top: 34,
      right: 28,
      bottom: 40,
      left: 48,
      containLabel: true,
    },
    tooltip: {
      trigger: 'item',
      confine: true,
      borderWidth: 0,
      backgroundColor: CHART_TOOLTIP_BACKGROUND_COLOR,
      textStyle: {
        color: '#0f1419',
      },
      extraCssText: CHART_TOOLTIP_EXTRA_CSS,
      formatter(params: { data?: unknown }) {
        const datum = getCommentBubbleDatum(params.data);
        if (!datum) {
          return '';
        }

        const createdAgo = formatRelativeAge(new Date(datum.createdAt), { labelStyle: 'long' });

        return [
          '<article class="chart-tooltip chart-tooltip--light chart-tooltip--comment">',
          '<div class="chart-tooltip__meta">',
          renderTooltipAvatar(datum.authorAvatarUrl),
          `<span class="chart-tooltip__username">u/${escapeHtml(datum.authorName)}</span>`,
          renderCurrentUserTooltipBadge(datum.isCurrentUser),
          '<span aria-hidden="true" class="chart-tooltip__separator">&middot;</span>',
          `<span class="chart-tooltip__age">${escapeHtml(createdAgo)}</span>`,
          '</div>',
          `<strong class="chart-tooltip__title">${escapeHtml(datum.bodyPreview)}</strong>`,
          '<div class="chart-tooltip__stats">',
          renderTooltipInlineVoteMetric(datum.score),
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
          type: 'solid',
          color: CHART_GRID_LINE_COLOR,
        },
      },
      axisLine: {
        show: true,
        lineStyle: {
          color: CHART_AXIS_LINE_COLOR,
        },
      },
      axisTick: {
        show: false,
      },
      axisLabel: {
        color: CHART_AXIS_LABEL_COLOR,
        fontSize: 12,
        fontWeight: 600,
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
      nameTextStyle: {
        color: CHART_AXIS_NAME_COLOR,
        fontSize: 12,
        fontWeight: 700,
      },
      type: 'value',
      min: minScore,
      minInterval: 1,
      splitLine: {
        show: true,
        lineStyle: {
          type: 'solid',
          color: CHART_GRID_LINE_COLOR,
        },
      },
      axisLine: {
        show: true,
        lineStyle: {
          color: CHART_AXIS_LINE_COLOR,
        },
      },
      axisTick: {
        show: false,
      },
      axisLabel: {
        color: CHART_AXIS_LABEL_COLOR,
        fontSize: 12,
        fontWeight: 600,
      },
    },
    series: commentGroups.flatMap((group) => {
      const groupColor = getBubbleFillColor(
        getCommentGroupColor(group.postId),
        COMMENT_BUBBLE_FILL_ALPHA
      );
      const currentUserComments = group.comments.filter((datum) => datum.isCurrentUser);

      return [
        {
          id: getCommentGroupSeriesId(group.postId),
          name: group.postId,
          type: 'scatter',
          cursor: 'pointer',
          data: group.comments,
          symbolSize: COMMENT_BUBBLE_SIZE,
          itemStyle: {
            borderColor: SOAP_BUBBLE_BORDER_COLOR,
            borderWidth: 1,
            color: groupColor,
            opacity: 0.78,
          },
          emphasis: {
            focus: 'series',
            scale: 1.8,
            itemStyle: {
              borderColor: SOAP_BUBBLE_EMPHASIS_BORDER_COLOR,
              borderWidth: 1.5,
              opacity: 0.96,
              shadowBlur: 14,
              shadowColor: SOAP_BUBBLE_EMPHASIS_SHADOW_COLOR,
            },
          },
          blur: {
            itemStyle: {
              opacity: 0.16,
            },
          },
        },
        ...(currentUserRippleEnabled && currentUserComments.length > 0
          ? [
              createCurrentUserRippleSeries({
                id: getCurrentUserCommentRippleSeriesId(group.postId),
                name: group.postId,
                data: currentUserComments,
                symbolSize: COMMENT_BUBBLE_SIZE,
                color: groupColor,
              }),
            ]
          : []),
      ];
    }),
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

function createContributorsOption(
  data: ContributorBubbleDatum[],
  zoomEnabled: boolean,
  currentUserRippleEnabled: boolean
): EChartsCoreOption {
  const minCommentScore = Math.min(0, ...data.map((datum) => datum.commentScore));
  const maxCommentScore = Math.max(0, ...data.map((datum) => datum.commentScore));
  const minPostScore = Math.min(0, ...data.map((datum) => datum.postScore));
  const maxPostScore = Math.max(0, ...data.map((datum) => datum.postScore));
  const maxContributionCount = Math.max(0, ...data.map((datum) => datum.contributionCount));
  const currentUserData = data.filter((datum) => datum.isCurrentUser);
  const getContributorSymbolSize = (_value: unknown, params?: { data?: unknown }) => {
    const datum = getContributorBubbleDatum(params?.data);
    return getContributorBubbleSize(datum?.contributionCount ?? 0, maxContributionCount);
  };
  const getContributorBubbleColor = (params: { data?: unknown }) => {
    const datum = getContributorBubbleDatum(params.data);
    return getBubbleFillColor(
      getKarmaBucketColor(datum?.contributorSubredditKarmaBucket ?? null),
      SOAP_BUBBLE_FILL_ALPHA
    );
  };
  const option: EChartsCoreOption = {
    grid: {
      top: 34,
      right: 28,
      bottom: 44,
      left: 52,
      containLabel: true,
    },
    tooltip: {
      trigger: 'item',
      confine: true,
      borderWidth: 0,
      backgroundColor: CHART_TOOLTIP_BACKGROUND_COLOR,
      textStyle: {
        color: '#0f1419',
      },
      extraCssText: CHART_TOOLTIP_EXTRA_CSS,
      formatter(params: { data?: unknown }) {
        const datum = getContributorBubbleDatum(params.data);
        if (!datum) {
          return '';
        }

        return [
          '<article class="chart-tooltip chart-tooltip--light chart-tooltip--contributor">',
          '<div class="chart-tooltip__meta">',
          renderTooltipAvatar(datum.contributorAvatarUrl),
          `<span class="chart-tooltip__username">u/${escapeHtml(datum.contributorName)}</span>`,
          renderCurrentUserTooltipBadge(datum.isCurrentUser),
          '</div>',
          '<div class="chart-tooltip__stats chart-tooltip__contributor-line">',
          renderTooltipInlineLabeledMetric(TOOLTIP_POST_ICON, datum.postCount, 'posts'),
          renderTooltipInlineLabeledMetric(TOOLTIP_UPVOTE_ICON, datum.postScore, 'post upvotes'),
          '</div>',
          '<div class="chart-tooltip__stats chart-tooltip__contributor-line">',
          renderTooltipInlineLabeledMetric(TOOLTIP_COMMENT_ICON, datum.commentCount, 'comments'),
          renderTooltipInlineLabeledMetric(TOOLTIP_UPVOTE_ICON, datum.commentScore, 'comment upvotes'),
          '</div>',
          '</article>',
        ].join('');
      },
    },
    xAxis: {
      name: 'Comment Upvotes',
      nameLocation: 'middle',
      nameGap: 30,
      nameTextStyle: {
        color: CHART_AXIS_NAME_COLOR,
        fontSize: 12,
        fontWeight: 700,
      },
      type: 'value',
      min: minCommentScore,
      max: maxCommentScore,
      minInterval: 1,
      splitLine: {
        show: true,
        lineStyle: {
          type: 'solid',
          color: CHART_GRID_LINE_COLOR,
        },
      },
      axisLine: {
        show: true,
        lineStyle: {
          color: CHART_AXIS_LINE_COLOR,
        },
      },
      axisTick: {
        show: false,
      },
      axisLabel: {
        color: CHART_AXIS_LABEL_COLOR,
        fontSize: 12,
        fontWeight: 600,
      },
    },
    yAxis: {
      name: 'Post Upvotes',
      nameLocation: 'middle',
      nameGap: 40,
      nameTextStyle: {
        color: CHART_AXIS_NAME_COLOR,
        fontSize: 12,
        fontWeight: 700,
      },
      type: 'value',
      min: minPostScore,
      max: maxPostScore,
      minInterval: 1,
      splitLine: {
        show: true,
        lineStyle: {
          type: 'solid',
          color: CHART_GRID_LINE_COLOR,
        },
      },
      axisLine: {
        show: true,
        lineStyle: {
          color: CHART_AXIS_LINE_COLOR,
        },
      },
      axisTick: {
        show: false,
      },
      axisLabel: {
        color: CHART_AXIS_LABEL_COLOR,
        fontSize: 12,
        fontWeight: 600,
      },
    },
    series: [
      {
        name: 'Contributors',
        type: 'scatter',
        cursor: 'pointer',
        data,
        encode: {
          x: 0,
          y: 1,
        },
        symbolSize: getContributorSymbolSize,
        itemStyle: {
          borderColor: SOAP_BUBBLE_BORDER_COLOR,
          borderWidth: 1.5,
          color: getContributorBubbleColor,
          opacity: 0.82,
        },
        emphasis: {
          scale: 1.35,
          itemStyle: {
            borderColor: SOAP_BUBBLE_EMPHASIS_BORDER_COLOR,
            borderWidth: 2,
            opacity: 0.96,
            shadowBlur: 14,
            shadowColor: SOAP_BUBBLE_EMPHASIS_SHADOW_COLOR,
          },
        },
      },
      ...(currentUserRippleEnabled && currentUserData.length > 0
        ? [
            createCurrentUserRippleSeries({
              id: CURRENT_USER_CONTRIBUTOR_RIPPLE_SERIES_ID,
              name: 'Contributors',
              data: currentUserData,
              symbolSize: getContributorSymbolSize,
              color: getContributorBubbleColor,
              encode: {
                x: 0,
                y: 1,
              },
            }),
          ]
        : []),
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

function createCurrentUserRippleSeries({
  id,
  name,
  data,
  symbolSize,
  color,
  encode,
}: {
  id: string;
  name: string;
  data: unknown[];
  symbolSize: SymbolSizeOption;
  color: RippleColorOption;
  encode?: { x: number; y: number };
}) {
  return {
    id,
    name,
    type: 'effectScatter',
    cursor: 'default',
    silent: true,
    data,
    encode,
    symbolSize,
    showEffectOn: 'render',
    rippleEffect: CURRENT_USER_RIPPLE_EFFECT,
    itemStyle: {
      color,
      opacity: 0,
    },
    emphasis: {
      disabled: true,
    },
    tooltip: {
      show: false,
    },
    z: CURRENT_USER_RIPPLE_SERIES_Z,
  };
}

function getContributorBubbleSize(contributionCount: number, maxContributionCount: number): number {
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
    case 'contributors':
      return 'Contributors';
    case 'stats':
      return 'Stats';
  }
}

function toCommentBubbleDatum(
  comment: ChartComment,
  currentUsername: string | null
): CommentBubbleDatum {
  return {
    value: [Date.parse(comment.createdAt), comment.score],
    score: comment.score,
    bodyPreview: comment.bodyPreview,
    authorName: comment.authorName,
    authorAvatarUrl: comment.authorAvatarUrl,
    createdAt: comment.createdAt,
    permalink: comment.permalink,
    postId: comment.postId,
    ...getCurrentUserDatumFields(comment.authorName, currentUsername),
  };
}

function toContributorBubbleDatum(
  contributor: ChartContributor,
  currentUsername: string | null
): ContributorBubbleDatum {
  const contributionCount = contributor.postCount + contributor.commentCount;

  return {
    value: [contributor.commentScore, contributor.postScore, contributionCount],
    contributorName: contributor.contributorName,
    contributorAvatarUrl: contributor.contributorAvatarUrl,
    contributorSubredditKarmaBucket: contributor.contributorSubredditKarmaBucket,
    postCount: contributor.postCount,
    commentCount: contributor.commentCount,
    contributionCount,
    postScore: contributor.postScore,
    commentScore: contributor.commentScore,
    profileUrl: contributor.profileUrl,
    ...getCurrentUserDatumFields(contributor.contributorName, currentUsername),
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
    !isSubredditKarmaBucket(datum.authorSubredditKarmaBucket) ||
    typeof datum.title !== 'string' ||
    typeof datum.authorName !== 'string' ||
    (datum.authorAvatarUrl !== null && typeof datum.authorAvatarUrl !== 'string') ||
    typeof datum.createdAt !== 'string' ||
    typeof datum.permalink !== 'string' ||
    typeof datum.isCurrentUser !== 'boolean'
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
    typeof datum.postId !== 'string' ||
    typeof datum.isCurrentUser !== 'boolean'
  ) {
    return null;
  }

  return value as CommentBubbleDatum;
}

function getContributorBubbleDatum(value: unknown): ContributorBubbleDatum | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const datum = value as Partial<Record<keyof ContributorBubbleDatum, unknown>>;
  if (
    !Array.isArray(datum.value) ||
    typeof datum.value[0] !== 'number' ||
    typeof datum.value[1] !== 'number' ||
    typeof datum.value[2] !== 'number' ||
    typeof datum.contributorName !== 'string' ||
    (datum.contributorAvatarUrl !== null &&
      typeof datum.contributorAvatarUrl !== 'string') ||
    !isSubredditKarmaBucket(datum.contributorSubredditKarmaBucket) ||
    typeof datum.postCount !== 'number' ||
    typeof datum.commentCount !== 'number' ||
    typeof datum.contributionCount !== 'number' ||
    typeof datum.postScore !== 'number' ||
    typeof datum.commentScore !== 'number' ||
    typeof datum.profileUrl !== 'string' ||
    typeof datum.isCurrentUser !== 'boolean'
  ) {
    return null;
  }

  return value as ContributorBubbleDatum;
}

function isSubredditKarmaBucket(
  value: unknown
): value is SubredditKarmaBucket | null {
  return (
    value === null ||
    (typeof value === 'number' &&
      Number.isInteger(value) &&
      value >= 0 &&
      value < SUBREDDIT_KARMA_BUCKET_COUNT)
  );
}

function getKarmaBucketColor(bucket: SubredditKarmaBucket | null): string {
  return bucket === null ? CHART_UNKNOWN_BUCKET_COLOR : getChartPaletteColor(bucket);
}

function getCommentGroupColor(postId: string): string {
  return getChartPaletteColor(hashString(postId));
}

function getCommentGroupSeriesId(postId: string): string {
  return `comment-group-${postId}`;
}

function getCurrentUserCommentRippleSeriesId(postId: string): string {
  return `current-user-comment-ripple-${postId}`;
}

function normalizeUsername(username: string | null | undefined): string | null {
  if (typeof username !== 'string') {
    return null;
  }

  const normalizedUsername = username.trim().replace(/^u\//i, '').toLowerCase();

  return normalizedUsername === '' ? null : normalizedUsername;
}

function getCurrentUserDatumFields(
  username: string,
  currentUsername: string | null
): CurrentUserDatumFields {
  const isCurrentUser =
    currentUsername !== null && normalizeUsername(username) === currentUsername;

  return { isCurrentUser };
}

function getBubbleFillColor(baseColor: string, alpha: number): string {
  const cacheKey = `${baseColor}:${alpha}`;
  const cachedColor = bubbleFillColorCache.get(cacheKey);
  if (cachedColor) {
    return cachedColor;
  }

  const rgb = hexToRgb(baseColor) ?? hexToRgb(CHART_COLOR_FALLBACK);
  const color = rgb ? toRgba(rgb, alpha) : `rgba(153, 204, 204, ${alpha})`;

  bubbleFillColorCache.set(cacheKey, color);
  return color;
}

function getChartPaletteColor(index: number): string {
  return CHART_COLOR_PALETTE[index % CHART_COLOR_PALETTE.length] ?? CHART_COLOR_FALLBACK;
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

function formatTimeframeDateRangeLabel(timeframe: TimeframePostData): string {
  const startDate = formatDateOnly(timeframe.startDate);
  const endDate = formatDateOnly(timeframe.endDate);

  return timeframe.startDate === timeframe.endDate ? startDate : `${startDate} - ${endDate}`;
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

function renderTooltipAvatar(rawAvatarUrl: string | null): string {
  const avatarUrl = escapeHtml(resolveUserAvatarUrl(rawAvatarUrl));

  return `<img alt="" class="chart-tooltip__avatar" src="${avatarUrl}">`;
}

function renderCurrentUserTooltipBadge(isCurrentUser: boolean): string {
  return isCurrentUser ? '<span class="chart-tooltip__you">you</span>' : '';
}

function renderTooltipVotePill(value: number, label = 'upvotes'): string {
  const valueLabel = value.toLocaleString();

  return `<span class="chart-tooltip__metric chart-tooltip__metric--pill chart-tooltip__metric--vote" aria-label="${escapeHtml(`${valueLabel} ${label}`)}">${TOOLTIP_UPVOTE_ICON}<span class="chart-tooltip__metric-value">${valueLabel}</span>${TOOLTIP_DOWNVOTE_ICON}</span>`;
}

function renderTooltipCommentPill(value: number): string {
  const valueLabel = value.toLocaleString();

  return `<span class="chart-tooltip__metric chart-tooltip__metric--pill chart-tooltip__metric--comments" aria-label="${escapeHtml(`${valueLabel} comments`)}">${TOOLTIP_COMMENT_ICON}<span class="chart-tooltip__metric-value">${valueLabel}</span></span>`;
}

function renderTooltipInlineVoteMetric(value: number, label = 'upvotes'): string {
  const valueLabel = value.toLocaleString();

  return `<span class="chart-tooltip__metric chart-tooltip__metric--inline-vote" aria-label="${escapeHtml(`${valueLabel} ${label}`)}">${TOOLTIP_UPVOTE_ICON}<span class="chart-tooltip__metric-value">${valueLabel}</span>${TOOLTIP_DOWNVOTE_ICON}</span>`;
}

function renderTooltipInlineLabeledMetric(icon: string, value: number, label: string): string {
  const valueLabel = value.toLocaleString();

  return `<span class="chart-tooltip__metric chart-tooltip__metric--inline-labeled" aria-label="${escapeHtml(`${valueLabel} ${label}`)}">${icon}<span class="chart-tooltip__metric-value">${valueLabel}</span><span class="chart-tooltip__metric-label">${escapeHtml(label)}</span></span>`;
}

function hashString(value: string): number {
  let hash = 0;

  for (const symbol of value) {
    hash = (hash * 31 + symbol.codePointAt(0)!) >>> 0;
  }

  return hash;
}

type RelativeAgeLabelStyle = 'short' | 'long';

function formatRelativeAge(
  date: Date,
  options: { labelStyle?: RelativeAgeLabelStyle } = {},
): string {
  const secondsAgo = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  const useLongLabels = options.labelStyle === 'long';
  const units = [
    { seconds: 31_536_000, shortLabel: 'yr.', singularLabel: 'year', pluralLabel: 'years' },
    { seconds: 2_592_000, shortLabel: 'mo.', singularLabel: 'month', pluralLabel: 'months' },
    { seconds: 604_800, shortLabel: 'wk.', singularLabel: 'week', pluralLabel: 'weeks' },
    { seconds: 86_400, shortLabel: 'd.', singularLabel: 'day', pluralLabel: 'days' },
    { seconds: 3_600, shortLabel: 'hr.', singularLabel: 'hour', pluralLabel: 'hours' },
    { seconds: 60, shortLabel: 'min.', singularLabel: 'minute', pluralLabel: 'minutes' },
  ];

  for (const unit of units) {
    if (secondsAgo >= unit.seconds) {
      const value = Math.floor(secondsAgo / unit.seconds);
      const label = useLongLabels
        ? value === 1
          ? unit.singularLabel
          : unit.pluralLabel
        : unit.shortLabel;

      return `${value} ${label} ago`;
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
