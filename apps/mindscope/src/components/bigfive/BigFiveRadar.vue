<script setup lang="ts">
/** Five-domain pentagon (0–100), clockwise from the top: O C E A N. Several results can be overlaid. */
import { computed } from 'vue';
import { B5_DOMAINS, type B5Domain, type B5Score } from '@mindscope/core';
import EChart from '../EChart.vue';
import { SERIES_COLORS } from '../charts/palette';

const props = withDefaults(
  defineProps<{ sets: { name: string; domains: Record<B5Domain, B5Score> }[]; names: Record<B5Domain, string>; height?: number }>(),
  { height: 340 },
);

// ECharts places indicators counter-clockwise: keep the first, reverse the rest.
const ORDER: B5Domain[] = [B5_DOMAINS[0], ...B5_DOMAINS.slice(1).reverse()];

const option = computed(() => {
  const multi = props.sets.length > 1;
  return {
    animation: false,
    color: SERIES_COLORS,
    tooltip: { trigger: 'item', confine: true },
    legend: multi ? { bottom: 0, textStyle: { color: '#6b7a88' } } : undefined,
    radar: {
      shape: 'polygon',
      radius: multi ? '58%' : '62%',
      center: ['50%', multi ? '47%' : '52%'],
      splitNumber: 4,
      indicator: ORDER.map((d) => ({ name: props.names[d], min: 0, max: 100 })),
      axisName: { color: '#6b7a88', fontSize: 12 },
      splitLine: { lineStyle: { color: 'rgba(120,135,150,0.35)' } },
      splitArea: { show: false },
      axisLine: { lineStyle: { color: 'rgba(120,135,150,0.35)' } },
    },
    series: [
      {
        type: 'radar',
        symbolSize: 6,
        data: props.sets.map((set, i) => ({
          name: set.name,
          value: ORDER.map((d) => set.domains[d].score100 ?? '-'),
          areaStyle: { opacity: multi ? 0.08 : 0.22 },
          lineStyle: { width: 2 },
          label: { show: !multi, color: SERIES_COLORS[i], fontSize: 11 },
        })),
      },
    ],
  };
});
</script>

<template>
  <EChart :option="option" :height="height" />
</template>
