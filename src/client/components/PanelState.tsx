import type { DataState } from '../types';

export function PanelState<Data>({
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
