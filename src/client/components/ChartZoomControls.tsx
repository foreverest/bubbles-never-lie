import { useEffect, useState, type RefObject } from 'react';

import type { EChartsInstance } from '../charts/echarts';
import {
  readChartZoomMultiplier,
  resetChartZoom,
  zoomChart,
  type ChartZoomDirection,
} from '../charts/zoom';

type ChartZoomControlsProps = {
  chartRef: RefObject<EChartsInstance | null>;
};

export function ChartZoomControls({ chartRef }: ChartZoomControlsProps) {
  const [zoomMultiplier, setZoomMultiplier] = useState<number | null>(null);

  useEffect(() => {
    let animationFrame = 0;
    let detachChartEvents: (() => void) | null = null;

    const attachChartEvents = () => {
      const chart = chartRef.current;
      if (!chart) {
        animationFrame = window.requestAnimationFrame(attachChartEvents);
        return;
      }

      const updateZoomMultiplier = () => {
        setZoomMultiplier(readChartZoomMultiplier(chart));
      };

      chart.on('datazoom', updateZoomMultiplier);
      chart.on('finished', updateZoomMultiplier);
      updateZoomMultiplier();

      detachChartEvents = () => {
        chart.off('datazoom', updateZoomMultiplier);
        chart.off('finished', updateZoomMultiplier);
      };
    };

    attachChartEvents();

    return () => {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }

      detachChartEvents?.();
    };
  }, [chartRef]);

  const handleZoom = (direction: ChartZoomDirection) => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }

    zoomChart(chart, direction);
    setZoomMultiplier(readChartZoomMultiplier(chart));
  };

  const handleResetZoom = () => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }

    resetChartZoom(chart);
    setZoomMultiplier(null);
  };

  return (
    <div className="chart-zoom-controls" aria-label="Chart zoom controls">
      {zoomMultiplier ? (
        <button
          aria-label="Reset zoom to 1X"
          className="chart-zoom-controls__label"
          onClick={handleResetZoom}
          type="button"
        >
          {zoomMultiplier}X
        </button>
      ) : null}
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
