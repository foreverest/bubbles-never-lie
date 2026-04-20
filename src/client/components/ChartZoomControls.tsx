import type { RefObject } from 'react';

import type { EChartsInstance } from '../charts/echarts';
import { zoomChart, type ChartZoomDirection } from '../charts/zoom';

type ChartZoomControlsProps = {
  chartRef: RefObject<EChartsInstance | null>;
};

export function ChartZoomControls({ chartRef }: ChartZoomControlsProps) {
  const handleZoom = (direction: ChartZoomDirection) => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }

    zoomChart(chart, direction);
  };

  return (
    <div className="chart-zoom-controls" aria-label="Chart zoom controls">
      <button
        aria-label="Zoom in"
        className="chart-zoom-controls__button"
        onClick={() => handleZoom('in')}
        type="button"
      >
        <svg
          aria-hidden="true"
          className="chart-zoom-controls__icon"
          focusable="false"
          viewBox="0 0 16 16"
        >
          <path d="M3 8h10" />
          <path d="M8 3v10" />
        </svg>
      </button>
      <button
        aria-label="Zoom out"
        className="chart-zoom-controls__button chart-zoom-controls__button--out"
        onClick={() => handleZoom('out')}
        type="button"
      >
        <svg
          aria-hidden="true"
          className="chart-zoom-controls__icon"
          focusable="false"
          viewBox="0 0 16 16"
        >
          <path d="M3 8h10" />
        </svg>
      </button>
    </div>
  );
}
