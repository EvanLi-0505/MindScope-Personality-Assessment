<script setup lang="ts">
/** Plain bar chart for counts (type distribution, tests per month, per person). */
import { computed } from 'vue';
import EChart from '../EChart.vue';
import { AXIS_TEXT, GRID_LINE, SERIES_COLORS } from './palette';

const props = withDefaults(defineProps<{ categories: string[]; values: number[]; horizontal?: boolean; color?: string; height?: number }>(), {
  horizontal: false,
  color: SERIES_COLORS[0],
  height: 240,
});

const option = computed(() => {
  const cat = { type: 'category', data: props.categories, axisLabel: { color: AXIS_TEXT, fontSize: 11 }, axisTick: { show: false }, axisLine: { lineStyle: { color: GRID_LINE } } };
  const val = { type: 'value', minInterval: 1, axisLabel: { color: AXIS_TEXT }, splitLine: { lineStyle: { color: GRID_LINE } } };
  return {
    animation: false,
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: props.horizontal ? 90 : 36, right: 20, top: 16, bottom: 28, containLabel: false },
    xAxis: props.horizontal ? val : cat,
    yAxis: props.horizontal ? { ...cat, inverse: true } : val,
    series: [
      {
        type: 'bar',
        data: props.values,
        barMaxWidth: 28,
        itemStyle: { color: props.color, borderRadius: props.horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0] },
        label: { show: true, position: props.horizontal ? 'right' : 'top', color: AXIS_TEXT, fontSize: 11 },
      },
    ],
  };
});
</script>

<template>
  <EChart :option="option" :height="height" />
</template>
