<script setup lang="ts">
/**
 * Shared chart wrapper. Uses the SVG renderer so charts stay sharp in PDFs.
 * Only the chart types we actually use are registered (keeps the bundle small).
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, RadarChart } from 'echarts/charts';
import { GridComponent, LegendComponent, MarkAreaComponent, MarkLineComponent, RadarComponent, TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';

echarts.use([
  RadarChart,
  BarChart,
  LineChart,
  RadarComponent,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
  MarkAreaComponent,
  SVGRenderer,
]);

const props = withDefaults(defineProps<{ option: EChartsCoreOption; height?: number }>(), { height: 320 });
const el = ref<HTMLDivElement | null>(null);
let chart: echarts.ECharts | null = null;
let observer: ResizeObserver | null = null;

onMounted(() => {
  chart = echarts.init(el.value!, undefined, { renderer: 'svg' });
  chart.setOption(props.option);
  observer = new ResizeObserver(() => chart?.resize());
  observer.observe(el.value!);
});

watch(
  () => props.option,
  (opt) => chart?.setOption(opt, true),
  { deep: true },
);

onBeforeUnmount(() => {
  observer?.disconnect();
  chart?.dispose();
});
</script>

<template>
  <div ref="el" class="echart" :style="{ height: `${height}px` }" />
</template>

<style scoped>
.echart {
  width: 100%;
}
/* ECharts sizes its inner box in pixels; keep it centred when printed at another width. */
.echart :deep(> div) {
  margin: 0 auto;
}
</style>
