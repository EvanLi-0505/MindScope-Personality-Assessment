<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { NAlert, NSpin } from 'naive-ui';
import { FUNCTIONS, comparabilityNotes, compareDimensions, type CogFunction } from '@mindscope/core';
import { functionTexts, pick, typeProfiles } from '@mindscope/banks';
import type { ResultWithProfile } from '@mindscope/storage';
import { useAppStore } from '../stores/app';
import { formatDate } from '../i18n';
import CompareDimsChart from '../components/charts/CompareDimsChart.vue';
import FunctionRadar from '../components/result/FunctionRadar.vue';
import { SERIES_COLORS } from '../components/charts/palette';

const MAX = 5;
const { t, locale } = useI18n();
const route = useRoute();
const app = useAppStore();

const loaded = ref(false);
const entries = ref<ResultWithProfile[]>([]);
const truncated = ref(false);

async function load() {
  const ids = String(route.query.ids ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  truncated.value = ids.length > MAX;
  entries.value = await app.r().results.getMany([...new Set(ids)].slice(0, MAX));
  loaded.value = true;
}
onMounted(load);
watch(() => route.query.ids, load);

const multiplePeople = computed(() => new Set(entries.value.map((e) => e.profileId)).size > 1);
const labels = computed(() =>
  entries.value.map((e) => (multiplePeople.value ? `${e.profileName} · ${formatDate(e.createdAt, true)}` : `${formatDate(e.createdAt, true)} · ${t(`modes.${e.mode}.name`)}`)),
);
const notes = computed(() => comparabilityNotes(entries.value));
/** Same mode and same item-bank version: scores are on the same footing (other notes are only cautions). */
const directlyComparable = computed(() => !notes.value.includes('different_modes') && !notes.value.includes('different_banks'));
const dims = computed(() => compareDimensions(entries.value));
const differing = computed(() => dims.value.filter((d) => d.lettersDiffer).map((d) => d.dimension.split('').join('/')));
const fnNames = computed(
  () => Object.fromEntries(FUNCTIONS.map((f) => [f, pick(functionTexts[f], locale.value)?.name ?? f])) as Record<CogFunction, string>,
);
const overlay = computed(() => entries.value.map((e, i) => ({ name: labels.value[i]!, functions: e.result.functions })));

/** One "how to get along" block per distinct person (their latest compared result with a concrete type). */
const along = computed(() => {
  if (!multiplePeople.value) return [];
  const seen = new Set<string>();
  return [...entries.value]
    .reverse()
    .filter((e) => /^[EI][SN][TF][JP]$/.test(e.typeCode ?? '') && !seen.has(e.profileId) && seen.add(e.profileId))
    .reverse()
    .map((e) => ({ name: e.profileName, code: e.typeCode!, text: pick(typeProfiles[e.typeCode!], locale.value) }))
    .filter((x) => x.text);
});
</script>

<template>
  <div class="ms-page compare-page">
    <div class="ms-page-header">
      <h1 class="ms-page-title">{{ t('compare.title') }}</h1>
    </div>
    <n-spin v-if="!loaded" />
    <div v-else-if="entries.length < 2" class="ms-card">{{ t('compare.needTwo') }}</div>

    <template v-else>
      <n-alert v-if="truncated" type="warning" class="gap-sm">{{ t('compare.tooMany') }}</n-alert>
      <n-alert v-if="directlyComparable" type="success" class="gap-sm" data-testid="comparable">{{ t('compare.comparable') }}</n-alert>
      <n-alert v-for="n in notes" :key="n" :type="n === 'different_people' ? 'info' : 'warning'" class="gap-sm" :data-testid="`note-${n}`">
        {{ t(`compare.notes.${n}`) }}
      </n-alert>

      <!-- types -->
      <section class="ms-card">
        <h2>{{ t('compare.types') }}</h2>
        <div class="types">
          <router-link v-for="(e, i) in entries" :key="e.id" :to="`/results/${e.id}`" class="type-card">
            <span class="dot" :style="{ background: SERIES_COLORS[i] }" />
            <span class="code">{{ e.typeCode }}</span>
            <span class="ms-subtle">{{ labels[i] }}</span>
          </router-link>
        </div>
        <p class="summary" data-testid="compare-summary">
          {{ differing.length ? t('compare.summaryDiffer', { list: differing.join('、') }) : t('compare.summarySame') }}
        </p>
      </section>

      <!-- dimensions -->
      <section class="ms-card gap">
        <h2>{{ t('compare.dims') }}</h2>
        <p class="ms-subtle">{{ t('compare.dimsHint') }}</p>
        <CompareDimsChart :entries="entries" :labels="labels" />
        <table class="dim-table">
          <tbody>
            <tr v-for="d in dims" :key="d.dimension">
              <th>{{ d.dimension.split('').join(' / ') }}</th>
              <td v-for="(s, i) in d.scores" :key="i" class="num">
                <span class="dot" :style="{ background: SERIES_COLORS[i] }" />
                {{ d.letters[i] ?? 'X' }} {{ s == null ? '—' : Math.abs(s * 100).toFixed(0) }}
              </td>
              <td><span class="flag" :class="{ differ: d.lettersDiffer }">{{ d.lettersDiffer ? t('compare.differ') : t('compare.same') }}</span></td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- functions -->
      <section class="ms-card gap">
        <h2>{{ t('compare.functions') }}</h2>
        <FunctionRadar :overlay="overlay" :names="fnNames" :height="420" />
      </section>

      <!-- getting along (different people) -->
      <section v-if="along.length" class="ms-card gap">
        <h2>{{ t('compare.getAlong') }}</h2>
        <p class="ms-subtle">{{ t('compare.getAlongHint') }}</p>
        <div class="along-grid">
          <div v-for="a in along" :key="a.name" class="along">
            <h3>{{ t('compare.withPerson', { name: a.name }) }} <span class="ms-subtle">{{ a.code }} {{ a.text!.title }}</span></h3>
            <ul>
              <li v-for="s in a.text!.getAlong.do" :key="s">{{ s }}</li>
            </ul>
            <ul class="avoid">
              <li v-for="s in a.text!.getAlong.avoid" :key="s">{{ s }}</li>
            </ul>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
h2 {
  font-size: 1.05rem;
  margin-bottom: 8px;
}
.gap {
  margin-top: 16px;
}
.gap-sm {
  margin-bottom: 10px;
}
.types {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.type-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border: 1px solid var(--ms-border);
  border-radius: var(--ms-radius-sm);
  color: inherit;
  text-decoration: none;
}
.code {
  font-weight: 800;
  letter-spacing: 0.05em;
  color: var(--ms-brand);
}
.dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}
.summary {
  margin: 12px 0 0;
  font-weight: 600;
}
.dim-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
  margin-top: 8px;
}
.dim-table th {
  text-align: left;
  color: var(--ms-text-2);
  padding: 6px 8px;
  white-space: nowrap;
}
.dim-table td {
  padding: 6px 8px;
  border-top: 1px solid var(--ms-border);
}
.num {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.flag {
  font-size: 0.75rem;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--ms-surface-2);
  color: var(--ms-text-2);
}
.flag.differ {
  background: color-mix(in srgb, #e09a3e 18%, transparent);
  color: #9a5d12;
}
.along-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 14px;
}
.along {
  padding: 4px 16px 12px;
  border-radius: var(--ms-radius-sm);
  background: color-mix(in srgb, var(--ms-brand) 6%, transparent);
}
.along h3 {
  font-size: 0.95rem;
  color: var(--ms-brand);
  margin: 10px 0 6px;
}
.along ul {
  margin: 0;
  padding-left: 20px;
}
.along .avoid li {
  color: #c2410c;
}
</style>
