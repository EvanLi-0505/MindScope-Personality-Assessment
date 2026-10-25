<script setup lang="ts">
/**
 * Eight-function octagon radar. Axes are arranged so that each function sits
 * opposite its theoretical counterpart (Ni–Se, Ne–Si, Ti–Fe, Te–Fi), clockwise
 * from the top. Functions without enough answers have no point ('-').
 * Pass `overlay` to draw several results on top of each other.
 */
import { computed } from 'vue';
import type { CogFunction, FunctionScore } from '@mindscope/core';
import EChart from '../EChart.vue';
import { SERIES_COLORS } from '../charts/palette';

type Scores = Record<CogFunction, FunctionScore>;

const props = withDefaults(
  defineProps<{
    functions?: Scores;
    overlay?: { name: string; functions: Scores }[];
    names: Record<CogFunction, string>;
    view?: 'absolute' | 'relative';
    height?: number;
  }>(),
  { view: 'absolute', height: 380 },
);

/** Clockwise order starting at the top. */
const RADAR_ORDER: CogFunction[] = ['Ni', 'Ne', 'Ti', 'Te', 'Se', 'Si', 'Fe', 'Fi'];
// ECharts lays indicators out counter-clockwise, so keep the first and reverse the rest.
const ECHARTS_ORDER: CogFunction[] = [RADAR_ORDER[0]!, ...RADAR_ORDER.slice(1).reverse()];

const option = computed(() => {
  const rel = props.view === 'relative';
  const sets = props.overlay ?? (props.functions ? [{ name: 'score', functions: props.functions }] : []);
  const multi = sets.length > 1;
  const valueOf = (s: FunctionScore) => (rel ? s.relative : s.score);
  const span = rel
    ? Math.max(10, Math.ceil(Math.max(...sets.flatMap((set) => ECHARTS_ORDER.map((f) => Math.abs(set.functions[f].relative ?? 0)))) / 10) * 10)
    : 100;
  return {
    animation: false,
    color: SERIES_COLORS,
    tooltip: { trigger: 'item', confine: true },
    legend: multi ? { bottom: 0, textStyle: { color: '#6b7a88' } } : undefined,
    radar: {
      shape: 'polygon',
      radius: multi ? '56%' : '58%',
      center: ['50%', multi ? '48%' : '52%'],
      splitNumber: 4,
      indicator: ECHARTS_ORDER.map((f) => ({ name: `${f}\n${props.names[f]}`, min: rel ? -span : 0, max: span })),
      axisName: { color: '#6b7a88', fontSize: 11, lineHeight: 14 },
      splitLine: { lineStyle: { color: 'rgba(120,135,150,0.35)' } },
      splitArea: { show: false },
      axisLine: { lineStyle: { color: 'rgba(120,135,150,0.35)' } },
    },
    series: [
      {
        type: 'radar',
        symbolSize: 6,
        data: sets.map((set, i) => ({
          name: set.name,
          value: ECHARTS_ORDER.map((f) => {
            const v = valueOf(set.functions[f]);
            return v == null ? '-' : Math.round(v * 10) / 10;
          }),
          areaStyle: { opacity: multi ? 0.08 : 0.22 },
          lineStyle: { width: 2 },
          label: { show: !multi, color: SERIES_COLORS[i], fontSize: 10 },
        })),
      },
    ],
  };
});
</script>

<template>
  <EChart :option="option" :height="height" />
</template>
