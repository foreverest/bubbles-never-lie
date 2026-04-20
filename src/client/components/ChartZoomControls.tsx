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
        <span aria-hidden="true">+</span>
      </button>
      <button
        aria-label="Zoom out"
        className="chart-zoom-controls__button chart-zoom-controls__button--out"
        onClick={() => handleZoom('out')}
        type="button"
      >
        <span aria-hidden="true">-</span>
      </button>
    </div>
  );
}
