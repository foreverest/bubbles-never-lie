import { useEffect, useRef } from 'react';

import { echarts, type EChartsInstance } from './echarts';

type ChartInitHandler = (chart: EChartsInstance) => void | (() => void);

export function useEChart(onInit?: ChartInitHandler) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<EChartsInstance | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const container = containerRef.current;
    const chart = echarts.init(container, undefined, { renderer: 'canvas' });
    chartRef.current = chart;
    let resizeFrame = 0;
    const cleanupChartEvents = onInit?.(chart);

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

      cleanupChartEvents?.();
      resizeObserver.disconnect();
      window.removeEventListener('resize', resizeChart);
      window.visualViewport?.removeEventListener('resize', resizeChart);
      chart.dispose();
      chartRef.current = null;
    };
  }, [onInit]);

  return { containerRef, chartRef };
}
