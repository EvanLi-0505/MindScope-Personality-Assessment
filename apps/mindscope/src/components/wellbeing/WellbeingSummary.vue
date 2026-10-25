<script setup lang="ts">
/** Per-scale latest result and trend for one person (person-card detail page). */
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { NButton } from 'naive-ui';
import { localize, scoreRange } from '@mindscope/core';
import type { StoredScale, StoredScaleResult } from '@mindscope/storage';
import { useAppStore } from '../../stores/app';
import { formatDate } from '../../i18n';
import ScaleTrendChart from '../charts/ScaleTrendChart.vue';
import { LEVEL_COLORS } from './levels';

const props = defineProps<{ profileId: string }>();
const { t, locale } = useI18n();
const app = useAppStore();

const groups = ref<{ scale: StoredScale; results: StoredScaleResult[] }[]>([]);
const loaded = ref(false);

onMounted(async () => {
  const all = await app.r().scales.list({ profileIds: [props.profileId] });
  const byInstrument = new Map<string, StoredScaleResult[]>();
  for (const r of all) byInstrument.set(r.instrument, [...(byInstrument.get(r.instrument) ?? []), r]);
  const out: typeof groups.value = [];
  for (const [, results] of byInstrument) {
    // Bands and texts come from the version each result was taken with.
    out.push({ scale: await app.r().scales.load(results[0]!.versionId), results });
  }
  groups.value = out;
  loaded.value = true;
});

const bandOf = (scale: StoredScale, key: string | undefined) => scale.scoring.bands.find((b) => b.key === key) ?? null;
const empty = computed(() => loaded.value && !groups.value.length);
</script>

<template>
  <section class="ms-card wb-section" data-testid="wb-section">
    <div class="head">
      <h2>{{ t('wb.section') }}</h2>
      <router-link :to="`/assess?profile=${profileId}&kind=wellbeing`" class="ms-no-print">
        <n-button size="small">{{ t('wb.startCheck') }}</n-button>
      </router-link>
    </div>
    <p class="ms-subtle">{{ t('wb.sectionHint') }}</p>
    <p v-if="empty" class="ms-muted">{{ t('wb.none') }}</p>
    <div v-for="g in groups" :key="g.scale.instrument" class="group">
      <router-link :to="`/wellbeing/${g.results[0]!.id}`" class="latest" :data-testid="`wb-latest-${g.scale.instrument}`">
        <span class="name">{{ localize(g.scale.shortName, locale) }}</span>
        <span class="score">{{ g.results[0]!.result.score }}<span class="of"> / {{ g.results[0]!.result.maxScore }}</span></span>
        <span
          v-if="bandOf(g.scale, g.results[0]!.result.band?.key)"
          class="band"
          :style="{ '--c': LEVEL_COLORS[bandOf(g.scale, g.results[0]!.result.band?.key)!.level] }"
        >
          {{ localize(bandOf(g.scale, g.results[0]!.result.band?.key)!.label, locale) }}
        </span>
        <span class="ms-subtle date">{{ t('wb.latest', { date: formatDate(g.results[0]!.createdAt, true) }) }}</span>
      </router-link>
      <ScaleTrendChart
        v-if="g.results.length >= 2"
        :results="g.results"
        :bands="g.scale.scoring.bands"
        :min="scoreRange(g.scale)[0]"
        :max="scoreRange(g.scale)[1]"
        :height="200"
      />
    </div>
  </section>
</template>

<style scoped>
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}
.head h2 {
  font-size: 1.1rem;
}
.head a {
  text-decoration: none;
}
.group {
  border-top: 1px solid var(--ms-border);
  padding-top: 10px;
  margin-top: 10px;
  break-inside: avoid;
}
.latest {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 12px;
  color: inherit;
  text-decoration: none;
}
.name {
  font-weight: 700;
  min-width: 70px;
}
.score {
  font-size: 1.4rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.of {
  font-size: 0.85rem;
  color: var(--ms-text-3);
  font-weight: 500;
}
.band {
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--c);
  background: color-mix(in srgb, var(--c) 14%, transparent);
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}
.date {
  margin-left: auto;
}
</style>
