<script setup lang="ts">
/** One row per domain: score on 0–100, band, and what that end of the scale usually means. */
import { useI18n } from 'vue-i18n';
import { B5_DOMAINS, type B5Domain, type B5Score } from '@mindscope/core';
import { useBigFiveText } from './useBigFiveText';

defineProps<{ domains: Record<B5Domain, B5Score>; compact?: boolean }>();
const { t, locale } = useI18n();
const { domainText } = useBigFiveText();
</script>

<template>
  <div class="rows">
    <div v-for="d in B5_DOMAINS" :key="d" class="row" :data-testid="`b5-domain-${d}`">
      <div class="head">
        <span class="name">{{ domainText(d).name }}</span>
        <span v-if="locale === 'zh-CN'" class="en">{{ domainText(d).en }}</span>
        <span class="score">{{ domains[d].score100 ?? '—' }}</span>
        <span v-if="domains[d].band" class="band" :class="`band-${domains[d].band}`" data-testid="b5-band">{{ t(`b5.band.${domains[d].band}`) }}</span>
      </div>
      <div class="track">
        <span class="fill" :style="{ width: `${domains[d].score100 ?? 0}%` }" />
        <span class="midline" />
      </div>
      <p v-if="!compact" class="text">
        <span class="ms-subtle">{{ domainText(d).summary }}</span><br />
        {{ domains[d].band ? domainText(d)[domains[d].band!] : '' }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.row {
  padding: 10px 0;
  border-bottom: 1px solid var(--ms-border);
  break-inside: avoid;
}
.row:last-child {
  border-bottom: none;
}
.head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.name {
  font-weight: 700;
}
.en {
  font-size: 0.8rem;
  color: var(--ms-text-3);
}
.score {
  margin-left: auto;
  font-size: 1.2rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.band {
  font-size: 0.75rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--ms-surface-2);
  color: var(--ms-text-2);
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}
.band.band-high {
  color: #1f7a6d;
  background: color-mix(in srgb, #1f7a6d 14%, transparent);
}
.band.band-low {
  color: #5b4fe0;
  background: color-mix(in srgb, #5b4fe0 14%, transparent);
}
.track {
  position: relative;
  height: 8px;
  border-radius: 999px;
  background: var(--ms-surface-2);
  margin: 6px 0 4px;
  overflow: hidden;
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}
.fill {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #2ba88f, #5b4fe0);
  border-radius: 999px;
}
.midline {
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  width: 1px;
  background: rgba(120, 135, 150, 0.6);
}
.text {
  margin: 4px 0 0;
  font-size: 0.9rem;
  line-height: 1.65;
}
</style>
