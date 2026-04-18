import './theme';
import './styles/index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { ChartEntry } from './ChartEntry';

export function renderChartApp(): void {
  const root = document.getElementById('root');

  if (!root) {
    throw new Error('Root element was not found.');
  }

  createRoot(root).render(
    <StrictMode>
      <ChartEntry />
    </StrictMode>
  );
}
