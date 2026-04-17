import { useState } from 'react';

import type {
  CommentsChartDataResponse,
  ContributorsChartDataResponse,
  PostsChartDataResponse,
  StatsDataResponse,
} from '../shared/api';
import { CommentsChart } from './charts/CommentsChart';
import { ContributorsChart } from './charts/ContributorsChart';
import { PostsChart } from './charts/PostsChart';
import { ChartHeader } from './components/ChartHeader';
import { EmptyState } from './components/EmptyState';
import { PanelState } from './components/PanelState';
import { StatsPanel } from './components/StatsPanel';
import { useApiResource } from './hooks/useApiResource';
import { useChartPreferences } from './hooks/useChartPreferences';
import { useResolvedTheme } from './hooks/useResolvedTheme';
import { useTooltipAvatarFallback } from './hooks/useTooltipAvatarFallback';
import type { DataState, ResolvedTheme, TabName } from './types';

export function App() {
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
  const statsState = useApiResource<StatsDataResponse>({
    path: '/api/stats',
    fallbackMessage: 'Unable to load stats data.',
    errorLogLabel: 'Error loading stats data:',
    enabled: activeTab === 'stats',
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
          themeMode={themeMode}
          onThemeModeChange={(nextThemeMode) =>
            setChartPreferences((preferences) => ({
              ...preferences,
              themeMode: nextThemeMode,
            }))
          }
        />

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
  resolvedTheme,
}: {
  state: DataState<ContributorsChartDataResponse>;
  zoomEnabled: boolean;
  currentUserRippleEnabled: boolean;
  resolvedTheme: ResolvedTheme;
}) {
  return (
    <section className="chart-panel" id="contributors-panel" aria-label="Contributors">
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
            timeframe={state.data.timeframe}
          />
        )
      ) : (
        <PanelState state={state} loadingMessage="Loading contributor chart data..." />
      )}
    </section>
  );
}
