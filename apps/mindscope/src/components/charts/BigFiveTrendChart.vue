<script setup lang="ts">
/** Big Five domains (0–100) over time for one person. */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { B5_DOMAINS } from '@mindscope/core';
import type { StoredBigFiveResult } from '@mindscope/storage';
import EChart from '../EChart.vue';
import { AXIS_TEXT, GRID_LINE, SERIES_COLORS, timeLabels } from './palette';
import { useBigFiveText } from '../bigfive/useBigFiveText';

const props = withDefaults(defineProps<{ results: StoredBigFiveResult[]; height?: number }>(), { height: 280 });
const { t, locale } = useI18n();
const { names } = useBigFiveText();

const option = computed(() => {
  const ordered = [...props.results].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const times = timeLabels(ordered.map((r) => r.createdAt), locale.value);
  return {
    animation: false,
    color: SERIES_COLORS,
    tooltip: { trigger: 'axis' },
    legend: { top: 0, textStyle: { color: AXIS_TEXT } },
    grid: { left: 40, right: 16, top: 36, bottom: 48 },
    xAxis: {
      type: 'category',
      data: ordered.map((r, i) => `${times[i]}\n${t(`modes.${r.form}.name`)}`),
      axisLabel: { color: AXIS_TEXT, fontSize: 10 },
      axisLine: { lineStyle: { color: GRID_LINE } },
    },
    yAxis: { type: 'value', min: 0, max: 100, interval: 25, axisLabel: { color: AXIS_TEXT }, splitLine: { lineStyle: { color: GRID_LINE } } },
    series: B5_DOMAINS.map((d) => ({
      name: names.value[d],
      type: 'line',
      symbolSize: 7,
      data: ordered.map((r) => r.result.domains[d].score100),
    })),
  };
});
</script>

<template>
  <EChart :option="option" :height="height" />
</template>
