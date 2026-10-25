<script setup lang="ts">
/** Four dimension scores over time: y = S × 100, positive = E/S/T/J. */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { DIMENSIONS, FIRST_POLE, SECOND_POLE, dimensionTrend, type HistoryEntry } from '@mindscope/core';
import EChart from '../EChart.vue';
import { AXIS_TEXT, GRID_LINE, SERIES_COLORS, timeLabels } from './palette';

const props = defineProps<{ entries: HistoryEntry[] }>();
const { t, locale } = useI18n();

const option = computed(() => {
  const ordered = [...props.entries].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const times = timeLabels(ordered.map((e) => e.createdAt), locale.value);
  const labels = ordered.map((e, i) => `${times[i]}\n${t(`modes.${e.mode}.name`)}`);
  return {
    animation: false,
    color: SERIES_COLORS,
    tooltip: { trigger: 'axis', valueFormatter: (v: number | null) => (v == null ? '—' : v.toFixed(0)) },
    legend: { top: 0, textStyle: { color: AXIS_TEXT } },
    grid: { left: 44, right: 16, top: 36, bottom: 48 },
    xAxis: { type: 'category', data: labels, axisLabel: { color: AXIS_TEXT, fontSize: 10 }, axisLine: { lineStyle: { color: GRID_LINE } } },
    yAxis: {
      type: 'value',
      min: -100,
      max: 100,
      interval: 50,
      axisLabel: { color: AXIS_TEXT, formatter: (v: number) => (v === 100 ? '+100' : String(v)) },
      splitLine: { lineStyle: { color: GRID_LINE } },
    },
    series: DIMENSIONS.map((d) => ({
      name: `${FIRST_POLE[d]} ↔ ${SECOND_POLE[d]}`,
      type: 'line',
      connectNulls: false,
      symbolSize: 7,
      data: dimensionTrend(ordered, d).map((p) => (p.value == null ? null : Math.round(p.value))),
      markLine: d === 'EI' ? { silent: true, symbol: 'none', data: [{ yAxis: 0 }], lineStyle: { color: AXIS_TEXT, type: 'dashed' }, label: { show: false } } : undefined,
    })),
  };
});
</script>

<template>
  <EChart :option="option" :height="300" />
</template>
