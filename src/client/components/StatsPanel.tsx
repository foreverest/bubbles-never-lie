import type { StatsDataResponse } from '../../shared/api';
import type { DataState } from '../types';
import { PanelState } from './PanelState';

export function StatsPanel({ state }: { state: DataState<StatsDataResponse> }) {
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
