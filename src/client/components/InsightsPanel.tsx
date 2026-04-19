import type { InsightsDataResponse } from '../../shared/api';
import type { DataState } from '../types';
import { PanelState } from './PanelState';

export function InsightsPanel({
  state,
}: {
  state: DataState<InsightsDataResponse>;
}) {
  if (state.status !== 'ready') {
    return (
      <section
        className="chart-panel"
        id="insights-panel"
        aria-label="Insights"
      >
        <PanelState state={state} loadingMessage="Loading insights data..." />
      </section>
    );
  }

  return (
    <section
      className="chart-panel insights-panel"
      id="insights-panel"
      aria-label="Insights"
    >
      <div className="insights-panel__item">
        <span className="insights-panel__label">Posts</span>
        <strong>{state.data.postCount.toLocaleString()}</strong>
      </div>
      <div className="insights-panel__item">
        <span className="insights-panel__label">Comments</span>
        <strong>{state.data.commentCount.toLocaleString()}</strong>
      </div>
      <div className="insights-panel__item">
        <span className="insights-panel__label">Contributors</span>
        <strong>{state.data.contributorCount.toLocaleString()}</strong>
      </div>
    </section>
  );
}
