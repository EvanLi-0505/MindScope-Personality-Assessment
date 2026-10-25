<script setup lang="ts">
/** History of one scale for one person, with the scale's bands as a light background. */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { localize, type ScaleBand } from '@mindscope/core';
import type { StoredScaleResult } from '@mindscope/storage';
import EChart from '../EChart.vue';
import { AXIS_TEXT, GRID_LINE, timeLabels } from './palette';
import { LEVEL_COLORS } from '../wellbeing/levels';

const props = withDefaults(defineProps<{ results: StoredScaleResult[]; bands: ScaleBand[]; min: number; max: number; height?: number }>(), {
  height: 260,
});
const { locale } = useI18n();

const option = computed(() => {
  const ordered = [...props.results].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return {
    animation: false,
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 90, top: 16, bottom: 40 },
    xAxis: {
      type: 'category',
      data: timeLabels(ordered.map((r) => r.createdAt), locale.value),
      axisLabel: { color: AXIS_TEXT, fontSize: 10 },
      axisLine: { lineStyle: { color: GRID_LINE } },
    },
    yAxis: { type: 'value', min: props.min, max: props.max, axisLabel: { color: AXIS_TEXT }, splitLine: { lineStyle: { color: GRID_LINE } } },
    series: [
      {
        type: 'line',
        data: ordered.map((r) => r.result.score),
        symbolSize: 8,
        lineStyle: { color: '#1F7A6D', width: 2 },
        itemStyle: { color: '#1F7A6D' },
        label: { show: true, color: '#1F7A6D', fontSize: 11 },
        markArea: {
          silent: true,
          // Each band is shaded up to where the next one starts, so there are no gaps.
          data: [...props.bands]
            .sort((a, b) => a.min - b.min)
            .map((b, i, all) => [
              {
                yAxis: b.min,
                itemStyle: { color: LEVEL_COLORS[b.level], opacity: 0.1 },
                label: { show: true, position: 'right', color: AXIS_TEXT, fontSize: 10, formatter: localize(b.label, locale.value) },
              },
              { yAxis: i < all.length - 1 ? all[i + 1]!.min : props.max },
            ]),
        },
      },
    ],
  };
});
</script>

<template>
  <EChart :option="option" :height="height" />
</template>
