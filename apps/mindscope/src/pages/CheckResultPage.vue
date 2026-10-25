<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { NButton, NCollapse, NCollapseItem, NSpin } from 'naive-ui';
import { localize, scoreRange, type ScaleBand } from '@mindscope/core';
import type { StoredScale, StoredScaleResult } from '@mindscope/storage';
import { useAppStore } from '../stores/app';
import { formatDate } from '../i18n';
import ScoreBar from '../components/wellbeing/ScoreBar.vue';
import SafetyCard from '../components/wellbeing/SafetyCard.vue';
import ScaleTrendChart from '../components/charts/ScaleTrendChart.vue';
import { LEVEL_COLORS } from '../components/wellbeing/levels';
import AppIcon from '../components/AppIcon.vue';

const props = defineProps<{ id: string }>();
const { t, tm, rt, locale } = useI18n();
const app = useAppStore();

const loaded = ref(false);
const stored = ref<StoredScaleResult | null>(null);
const scale = ref<StoredScale | null>(null);
const history = ref<StoredScaleResult[]>([]);

onMounted(async () => {
  stored.value = await app.r().scales.get(props.id);
  if (stored.value) {
    scale.value = await app.r().scales.load(stored.value.versionId);
    history.value = await app.r().scales.list({ profileIds: [stored.value.profileId], instruments: [stored.value.instrument] });
  }
  loaded.value = true;
});

const r = computed(() => stored.value?.result ?? null);
const band = computed<ScaleBand | null>(() => scale.value?.scoring.bands.find((b) => b.key === r.value?.band?.key) ?? null);
const range = computed(() => (scale.value ? scoreRange(scale.value) : [0, 0]));
const rawMax = computed(() => (scale.value ? range.value[1] / scale.value.scoring.multiplier : 0));
const limitations = computed(() => (tm('wb.limitationList') as unknown[]).map((m) => rt(m as never)));
const answerRows = computed(() =>
  (scale.value?.items ?? []).map((item, i) => {
    const v = r.value?.answers[item.id];
    const opt = scale.value!.options.find((o) => o.value === v);
    return { n: i + 1, text: localize(item.text, locale.value), answer: opt ? `${opt.value} · ${localize(opt.label, locale.value)}` : '—' };
  }),
);
</script>

<template>
  <div class="ms-page wb-page">
    <n-spin v-if="!loaded" />
    <div v-else-if="!stored || !r || !scale" class="ms-card">{{ t('wb.notFound') }}</div>

    <template v-else>
      <section class="ms-card hero">
        <div class="ms-subtle">{{ stored.profileName }} · {{ formatDate(stored.createdAt, true) }}</div>
        <h1 class="ms-page-title">{{ localize(scale.title, locale) }}</h1>
        <div class="score-row">
          <div class="score" data-testid="wb-score">{{ r.score }}<span class="of"> / {{ r.maxScore }}</span></div>
          <div v-if="band" class="band" :style="{ '--c': LEVEL_COLORS[band.level] }" data-testid="wb-band">{{ localize(band.label, locale) }}</div>
        </div>
        <div class="ms-subtle">
          {{ scale.scoring.higherIsBetter ? t('wb.higherBetter') : t('wb.higherWorse') }}
          <template v-if="scale.scoring.multiplier !== 1"> · {{ t('wb.rawScore', { raw: r.raw, max: rawMax }) }}</template>
        </div>
        <ScoreBar v-if="r.score !== null" :bands="scale.scoring.bands" :min="range[0]" :max="range[1]" :score="r.score" />
        <p v-if="band" class="summary">{{ localize(band.summary, locale) }}</p>
        <div class="actions ms-no-print">
          <router-link :to="`/report/wellbeing/${stored.id}`"><n-button type="primary"><template #icon><AppIcon name="file" /></template>{{ t('wb.exportReport') }}</n-button></router-link>
          <router-link :to="`/assess?profile=${stored.profileId}&check=${stored.instrument}`"><n-button>{{ t('wb.retake') }}</n-button></router-link>
          <router-link :to="`/profiles/${stored.profileId}`"><n-button quaternary>{{ t('wb.backToProfile') }}</n-button></router-link>
        </div>
      </section>

      <SafetyCard v-if="r.safetyItems.length" class="gap" />
      <section v-else-if="r.band?.seekHelp" class="ms-card gap help" data-testid="seek-help">
        <h2>{{ t('wb.seekHelpTitle') }}</h2>
        <p>{{ t('wb.seekHelpText') }}</p>
      </section>

      <section v-if="band?.suggestions.length" class="ms-card gap">
        <h2>{{ t('wb.suggestions') }}</h2>
        <ul>
          <li v-for="(s, i) in band.suggestions" :key="i">{{ localize(s, locale) }}</li>
        </ul>
      </section>

      <section class="ms-card gap">
        <h2>{{ t('wb.trend') }}</h2>
        <p class="ms-subtle">{{ t('wb.trendHint') }}</p>
        <ScaleTrendChart v-if="history.length >= 2" :results="history" :bands="scale.scoring.bands" :min="range[0]" :max="range[1]" />
        <p v-else class="ms-muted" data-testid="wb-need-two">{{ t('wb.needTwo') }}</p>
        <p v-if="scale.scoring.meaningfulChange && history.length >= 2" class="ms-subtle">{{ t('wb.meaningfulChange', { n: scale.scoring.meaningfulChange }) }}</p>
      </section>

      <section class="ms-card gap">
        <h2>{{ t('wb.limitations') }}</h2>
        <ul class="muted-list">
          <li v-for="l in limitations" :key="l">{{ l }}</li>
        </ul>
      </section>

      <section class="ms-card gap">
        <n-collapse>
          <n-collapse-item :title="t('wb.answers')" name="answers">
            <table class="answers">
              <tbody>
                <tr v-for="row in answerRows" :key="row.n">
                  <td class="n">{{ row.n }}</td>
                  <td>{{ row.text }}</td>
                  <td class="a">{{ row.answer }}</td>
                </tr>
              </tbody>
            </table>
          </n-collapse-item>
          <n-collapse-item :title="t('wb.about')" name="about">
            <p>{{ localize(scale.description, locale) }}</p>
            <p><b>{{ t('wb.source') }}：</b>{{ localize(scale.source, locale) }}</p>
            <p><b>{{ t('wb.license') }}：</b>{{ localize(scale.licenseNote, locale) }}</p>
            <p><b>{{ t('wb.citation') }}：</b>{{ scale.citation }}</p>
            <p v-if="scale.translationNote && locale === 'zh-CN'"><b>{{ t('wb.translation') }}：</b>{{ localize(scale.translationNote, locale) }}</p>
          </n-collapse-item>
        </n-collapse>
      </section>
    </template>
  </div>
</template>

<style scoped>
.wb-page {
  max-width: 900px;
}
.wb-page h2 {
  font-size: 1.05rem;
  margin-bottom: 8px;
}
.gap {
  margin-top: 16px;
}
.score-row {
  display: flex;
  align-items: baseline;
  gap: 16px;
  margin: 10px 0 2px;
}
.score {
  font-size: 2.8rem;
  font-weight: 900;
  color: var(--ms-text);
  font-variant-numeric: tabular-nums;
}
.of {
  font-size: 1.1rem;
  font-weight: 500;
  color: var(--ms-text-3);
}
.band {
  padding: 4px 14px;
  border-radius: 999px;
  font-weight: 700;
  color: var(--c);
  background: color-mix(in srgb, var(--c) 14%, transparent);
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}
.summary {
  font-size: 1.02rem;
  line-height: 1.8;
}
.actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.actions a {
  text-decoration: none;
}
.help {
  border-left: 4px solid #e08a3e;
}
ul {
  margin: 0;
  padding-left: 20px;
}
li {
  margin: 4px 0;
  line-height: 1.6;
}
.muted-list {
  color: var(--ms-text-2);
}
.answers {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}
.answers td {
  padding: 6px 8px;
  border-bottom: 1px solid var(--ms-border);
}
.answers .n {
  color: var(--ms-text-3);
  width: 30px;
}
.answers .a {
  text-align: right;
  color: var(--ms-brand);
  white-space: nowrap;
}
</style>
