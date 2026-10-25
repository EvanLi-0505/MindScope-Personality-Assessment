<script setup lang="ts">
/** Grouped horizontal bars: one group per dimension, one bar per compared result. */
import { computed } from 'vue';
import { DIMENSIONS, FIRST_POLE, SECOND_POLE, type HistoryEntry } from '@mindscope/core';
import EChart from '../EChart.vue';
import { AXIS_TEXT, GRID_LINE, SERIES_COLORS } from './palette';

const props = defineProps<{ entries: HistoryEntry[]; labels: string[] }>();

const option = computed(() => ({
  animation: false,
  color: SERIES_COLORS,
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: number | null) => (v == null ? '—' : Math.abs(v).toFixed(0)) },
  legend: { top: 0, textStyle: { color: AXIS_TEXT } },
  grid: { left: 56, right: 56, top: 40, bottom: 28 },
  // Positive S (E/S/T/J) is drawn towards the LEFT labels, negative towards the RIGHT ones,
  // matching the dimension bars on the result page.
  xAxis: {
    type: 'value',
    min: -100,
    max: 100,
    interval: 50,
    inverse: true,
    axisLabel: { color: AXIS_TEXT, formatter: (v: number) => String(Math.abs(v)) },
    splitLine: { lineStyle: { color: GRID_LINE } },
  },
  yAxis: [
    { type: 'category', inverse: true, data: DIMENSIONS.map((d) => FIRST_POLE[d]), axisLabel: { color: AXIS_TEXT, fontWeight: 'bold', fontSize: 13 }, axisTick: { show: false } },
    { type: 'category', inverse: true, data: DIMENSIONS.map((d) => SECOND_POLE[d]), axisLabel: { color: AXIS_TEXT, fontWeight: 'bold', fontSize: 13 }, axisTick: { show: false } },
  ],
  series: props.entries.map((e, i) => ({
    name: props.labels[i],
    type: 'bar',
    barMaxWidth: 14,
    data: DIMENSIONS.map((d) => {
      const s = e.result.dimensions[d].score;
      return s == null ? null : Math.round(s * 100);
    }),
  })),
}));
</script>

<template>
  <EChart :option="option" :height="120 + entries.length * 44" />
</template>
