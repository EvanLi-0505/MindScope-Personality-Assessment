<script setup lang="ts">
/** Horizontal bar split into the scale's bands, with a marker at the score. */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { localize, type ScaleBand } from '@mindscope/core';
import { LEVEL_COLORS } from './levels';

const props = defineProps<{ bands: ScaleBand[]; min: number; max: number; score: number }>();
const { locale } = useI18n();

const span = computed(() => props.max - props.min || 1);
const pos = (v: number) => ((v - props.min) / span.value) * 100;
const segments = computed(() =>
  [...props.bands]
    .sort((a, b) => a.min - b.min)
    .map((b, i, all) => {
      // Bands are on whole scores; draw each up to where the next one starts.
      const end = i < all.length - 1 ? all[i + 1]!.min : props.max;
      return { key: b.key, left: pos(b.min), width: pos(end) - pos(b.min), color: LEVEL_COLORS[b.level], label: localize(b.label, locale.value), active: props.score >= b.min && props.score <= b.max };
    }),
);
</script>

<template>
  <div class="score-bar">
    <div class="track">
      <div v-for="s in segments" :key="s.key" class="seg" :class="{ active: s.active }" :style="{ left: `${s.left}%`, width: `${s.width}%`, background: s.color }" />
      <div class="marker" :style="{ left: `${pos(score)}%` }"><span>{{ score }}</span></div>
    </div>
    <div class="labels">
      <span v-for="s in segments" :key="s.key" :style="{ left: `${s.left}%`, width: `${s.width}%` }" :class="{ active: s.active }">{{ s.label }}</span>
    </div>
    <div class="ends ms-subtle"><span>{{ min }}</span><span>{{ max }}</span></div>
  </div>
</template>

<style scoped>
.score-bar {
  margin: 30px 0 8px;
}
.track {
  position: relative;
  height: 12px;
  border-radius: 999px;
  overflow: visible;
  background: var(--ms-surface-2);
}
.seg {
  position: absolute;
  top: 0;
  bottom: 0;
  opacity: 0.35;
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}
.seg:first-child {
  border-radius: 999px 0 0 999px;
}
.seg:last-of-type {
  border-radius: 0 999px 999px 0;
}
.seg.active {
  opacity: 1;
}
.marker {
  position: absolute;
  top: -6px;
  width: 3px;
  height: 24px;
  margin-left: -1.5px;
  background: var(--ms-text);
  border-radius: 2px;
}
.marker span {
  position: absolute;
  bottom: 26px;
  left: 50%;
  transform: translateX(-50%);
  font-weight: 800;
  font-size: 0.85rem;
  white-space: nowrap;
}
.labels {
  position: relative;
  height: 20px;
  margin-top: 6px;
}
.labels span {
  position: absolute;
  text-align: center;
  font-size: 0.72rem;
  color: var(--ms-text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.labels span.active {
  color: var(--ms-text);
  font-weight: 700;
}
.ends {
  display: flex;
  justify-content: space-between;
  font-size: 0.72rem;
}
</style>
