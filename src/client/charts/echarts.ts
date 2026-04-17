import { EffectScatterChart, ScatterChart } from 'echarts/charts';
import { DataZoomComponent, GridComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import type { EChartsCoreOption } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  CanvasRenderer,
  DataZoomComponent,
  GridComponent,
  EffectScatterChart,
  ScatterChart,
  TooltipComponent,
]);

export { echarts };
export type { EChartsCoreOption };
export type EChartsInstance = echarts.EChartsType;
