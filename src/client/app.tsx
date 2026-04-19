import { useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';

import type {
  CommentsChartDataResponse,
  ContributorsChartDataResponse,
  InsightsDataResponse,
  PostsChartDataResponse,
} from '../shared/api';
import { CommentsChart } from './charts/CommentsChart';
import { ContributorsChart } from './charts/ContributorsChart';
import { PostsChart } from './charts/PostsChart';
import { ChartHeader } from './components/ChartHeader';
import { EmptyState } from './components/EmptyState';
import { InsightsPanel } from './components/InsightsPanel';
import { PanelState } from './components/PanelState';
import { useApiResource } from './hooks/useApiResource';
import { useChartPreferences } from './hooks/useChartPreferences';
import { useResolvedTheme } from './hooks/useResolvedTheme';
import { useTooltipAvatarFallback } from './hooks/useTooltipAvatarFallback';
import type { DataState, ResolvedTheme, TabName, ThemeMode } from './types';

type AppProps = {
  onRequestExpandedMode?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
};

export function App({ onRequestExpandedMode }: AppProps) {
  const [activeTab, setActiveTab] = useState<TabName>('posts');
  const [chartPreferences, setChartPreferences] = useChartPreferences();
  const { zoomEnabled, currentUserRippleEnabled, themeMode } = chartPreferences;
  const resolvedTheme = useResolvedTheme(themeMode);
  const postsState = useApiResource<PostsChartDataResponse>({
    path: '/api/posts',
    fallbackMessage: 'Unable to load post chart data.',
    errorLogLabel: 'Error loading post chart data:',
  });
  const commentsState = useApiResource<CommentsChartDataResponse>({
    path: '/api/comments',
    fallbackMessage: 'Unable to load comment chart data.',
    errorLogLabel: 'Error loading comment chart data:',
    enabled: activeTab === 'comments',
  });
  const contributorsState = useApiResource<ContributorsChartDataResponse>({
    path: '/api/contributors',
    fallbackMessage: 'Unable to load contributor chart data.',
    errorLogLabel: 'Error loading contributor chart data:',
    enabled: activeTab === 'contributors',
  });
  const insightsState = useApiResource<InsightsDataResponse>({
    path: '/api/insights',
    fallbackMessage: 'Unable to load insights data.',
    errorLogLabel: 'Error loading insights data:',
    enabled: activeTab === 'insights',
  });

  useTooltipAvatarFallback();

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
          <p className="eyebrow">Bubbles Never Lie</p>
          <h1>Chart data could not be loaded.</h1>
          <p>{postsState.message}</p>
        </section>
      </main>
    );
  }

  const { data: postsData } = postsState;
  const chartHeaderProps = {
    data: postsData,
    activeTab,
    onTabChange: setActiveTab,
    zoomEnabled,
    onZoomEnabledChange: (nextZoomEnabled: boolean) =>
      setChartPreferences((preferences) => ({
        ...preferences,
        zoomEnabled: nextZoomEnabled,
      })),
    currentUserRippleEnabled,
    onCurrentUserRippleEnabledChange: (nextCurrentUserRippleEnabled: boolean) =>
      setChartPreferences((preferences) => ({
        ...preferences,
        currentUserRippleEnabled: nextCurrentUserRippleEnabled,
      })),
    themeMode,
    onThemeModeChange: (nextThemeMode: ThemeMode) =>
      setChartPreferences((preferences) => ({
        ...preferences,
        themeMode: nextThemeMode,
      })),
    ...(onRequestExpandedMode ? { onRequestExpandedMode } : {}),
  };

  return (
    <main className="app-shell">
      <section className="chart-region" aria-label="Bubbles Never Lie">
        <ChartHeader {...chartHeaderProps} />

        {activeTab === 'posts' ? (
          <PostsPanel
            data={postsData}
            zoomEnabled={zoomEnabled}
            currentUserRippleEnabled={currentUserRippleEnabled}
            resolvedTheme={resolvedTheme}
          />
        ) : activeTab === 'comments' ? (
          <CommentsPanel
            state={commentsState}
            zoomEnabled={zoomEnabled}
            currentUserRippleEnabled={currentUserRippleEnabled}
            resolvedTheme={resolvedTheme}
          />
        ) : activeTab === 'contributors' ? (
          <ContributorsPanel
            state={contributorsState}
            zoomEnabled={zoomEnabled}
            currentUserRippleEnabled={currentUserRippleEnabled}
            resolvedTheme={resolvedTheme}
          />
        ) : (
          <InsightsPanel state={insightsState} />
        )}
      </section>
    </main>
  );
}

function PostsPanel({
  data,
  zoomEnabled,
  currentUserRippleEnabled,
  resolvedTheme,
}: {
  data: PostsChartDataResponse;
  zoomEnabled: boolean;
  currentUserRippleEnabled: boolean;
  resolvedTheme: ResolvedTheme;
}) {
  return (
    <section className="chart-panel" id="posts-panel" aria-label="Posts">
      {data.posts.length > 0 ? (
        <PostsChart
          data={data}
          zoomEnabled={zoomEnabled}
          currentUserRippleEnabled={currentUserRippleEnabled}
          resolvedTheme={resolvedTheme}
        />
      ) : (
        <EmptyState
          contentLabel="posts"
          subredditName={data.subredditName}
          dateRange={data.dateRange}
        />
      )}
    </section>
  );
}

function CommentsPanel({
  state,
  zoomEnabled,
  currentUserRippleEnabled,
  resolvedTheme,
}: {
  state: DataState<CommentsChartDataResponse>;
  zoomEnabled: boolean;
  currentUserRippleEnabled: boolean;
  resolvedTheme: ResolvedTheme;
}) {
  return (
    <section className="chart-panel" id="comments-panel" aria-label="Comments">
      {state.status === 'ready' ? (
        state.data.comments.length > 0 ? (
          <CommentsChart
            data={state.data}
            zoomEnabled={zoomEnabled}
            currentUserRippleEnabled={currentUserRippleEnabled}
            resolvedTheme={resolvedTheme}
          />
        ) : (
          <EmptyState
            contentLabel="comments"
            subredditName={state.data.subredditName}
            dateRange={state.data.dateRange}
          />
        )
      ) : (
        <PanelState
          state={state}
          loadingMessage="Loading comment chart data..."
        />
      )}
    </section>
  );
}

function ContributorsPanel({
  state,
  zoomEnabled,
  currentUserRippleEnabled,
  resolvedTheme,
}: {
  state: DataState<ContributorsChartDataResponse>;
  zoomEnabled: boolean;
  currentUserRippleEnabled: boolean;
  resolvedTheme: ResolvedTheme;
}) {
  return (
    <section
      className="chart-panel"
      id="contributors-panel"
      aria-label="Contributors"
    >
      {state.status === 'ready' ? (
        state.data.contributors.length > 0 ? (
          <ContributorsChart
            data={state.data}
            zoomEnabled={zoomEnabled}
            currentUserRippleEnabled={currentUserRippleEnabled}
            resolvedTheme={resolvedTheme}
          />
        ) : (
          <EmptyState
            contentLabel="active contributors"
            subredditName={state.data.subredditName}
            dateRange={state.data.dateRange}
          />
        )
      ) : (
        <PanelState
          state={state}
          loadingMessage="Loading contributor chart data..."
        />
      )}
    </section>
  );
}
