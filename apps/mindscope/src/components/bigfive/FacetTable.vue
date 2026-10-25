<script setup lang="ts">
/** The 30 facets (senior form), grouped under their domain. */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { B5_DOMAINS, type B5Score } from '@mindscope/core';
import { useBigFiveText } from './useBigFiveText';

const props = defineProps<{ facets: Record<string, B5Score> }>();
const { t } = useI18n();
const { domainText, facetName } = useBigFiveText();
const groups = computed(() =>
  B5_DOMAINS.map((d) => ({
    d,
    rows: Object.keys(props.facets)
      .filter((f) => f[0] === d)
      .sort()
      .map((f) => ({ f, s: props.facets[f]! })),
  })),
);
</script>

<template>
  <div class="facets" data-testid="b5-facets">
    <div v-for="g in groups" :key="g.d" class="group">
      <div class="g-name">{{ domainText(g.d).name }}</div>
      <div v-for="r in g.rows" :key="r.f" class="frow">
        <span class="fname">{{ facetName(r.f) }}</span>
        <span class="track"><span :style="{ width: `${r.s.score100 ?? 0}%` }" /></span>
        <span class="fscore">{{ r.s.score100 ?? '—' }}</span>
        <span class="fband">{{ r.s.band ? t(`b5.band.${r.s.band}`) : '' }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.facets {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 14px 24px;
}
.group {
  break-inside: avoid;
}
.g-name {
  font-weight: 700;
  margin-bottom: 4px;
  color: var(--ms-brand);
}
.frow {
  display: grid;
  grid-template-columns: 7.5em 1fr 2.5em 3em;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  padding: 2px 0;
}
.track {
  height: 6px;
  border-radius: 999px;
  background: var(--ms-surface-2);
  overflow: hidden;
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}
.track span {
  display: block;
  height: 100%;
  background: #4f7be0;
}
.fscore {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.fband {
  color: var(--ms-text-3);
  font-size: 0.78rem;
}
</style>
