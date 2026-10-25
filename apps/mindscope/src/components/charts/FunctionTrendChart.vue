<script setup lang="ts">
/** Eight function scores over time (0–100). Results without a score leave a gap. */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { FUNCTIONS, type CogFunction, type HistoryEntry } from '@mindscope/core';
import EChart from '../EChart.vue';
import { AXIS_TEXT, GRID_LINE, SERIES_COLORS, timeLabels } from './palette';

const props = defineProps<{ entries: HistoryEntry[]; names: Record<CogFunction, string> }>();
const { t, locale } = useI18n();

const option = computed(() => {
  const ordered = [...props.entries].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return {
    animation: false,
    color: SERIES_COLORS,
    tooltip: { trigger: 'axis', valueFormatter: (v: number | null) => (v == null ? '—' : v.toFixed(0)) },
    legend: { top: 0, textStyle: { color: AXIS_TEXT }, formatter: (name: string) => name },
    grid: { left: 40, right: 16, top: 56, bottom: 48 },
    xAxis: {
      type: 'category',
      data: timeLabels(ordered.map((e) => e.createdAt), locale.value).map((d, i) => `${d}\n${t(`modes.${ordered[i]!.mode}.name`)}`),
      axisLabel: { color: AXIS_TEXT, fontSize: 10 },
      axisLine: { lineStyle: { color: GRID_LINE } },
    },
    yAxis: { type: 'value', min: 0, max: 100, interval: 25, axisLabel: { color: AXIS_TEXT }, splitLine: { lineStyle: { color: GRID_LINE } } },
    series: FUNCTIONS.map((f) => ({
      name: `${f} ${props.names[f]}`,
      type: 'line',
      symbolSize: 6,
      connectNulls: false,
      data: ordered.map((e) => {
        const s = e.result.functions[f].score;
        return s == null ? null : Math.round(s);
      }),
    })),
  };
});
</script>

<template>
  <EChart :option="option" :height="320" />
</template>
