<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { NAlert, NButton, NEmpty, NSpin, NTag, useMessage } from 'naive-ui';
import { DIMENSIONS, FUNCTIONS, MODE_IDS, fileStamp, type CogFunction, type ModeId, type Profile } from '@mindscope/core';
import { dimensionTexts, functionTexts, pick, typeProfiles, type DimensionText } from '@mindscope/banks';
import type { GrowthNote, ResultWithProfile, UnfinishedSession } from '@mindscope/storage';
import { useAppStore } from '../stores/app';
import { useResultActions } from '../composables/useResultActions';
import { formatDate } from '../i18n';
import ProfileAvatar from '../components/ProfileAvatar.vue';
import AppIcon from '../components/AppIcon.vue';
import DimensionBar from '../components/result/DimensionBar.vue';
import FunctionRadar from '../components/result/FunctionRadar.vue';
import DimensionTrendChart from '../components/charts/DimensionTrendChart.vue';
import FunctionTrendChart from '../components/charts/FunctionTrendChart.vue';
import ResultTable from '../components/ResultTable.vue';
import WellbeingSummary from '../components/wellbeing/WellbeingSummary.vue';
import BigFiveSummary from '../components/bigfive/BigFiveSummary.vue';
import GrowthNotes from '../components/GrowthNotes.vue';
import AiSection from '../components/ai/AiSection.vue';

const props = defineProps<{ id: string }>();
const { t, locale } = useI18n();
const message = useMessage();
const app = useAppStore();
const { confirmDelete } = useResultActions();

const loaded = ref(false);
const profile = ref<Profile | null>(null);
const results = ref<ResultWithProfile[]>([]);
const unfinished = ref<UnfinishedSession[]>([]);
const modeFilter = ref<ModeId | null>(null);
const selected = ref<string[]>([]);
const wbKey = ref(0);
const growth = ref<GrowthNote[]>([]);

async function load() {
  profile.value = await app.r().profiles.get(props.id);
  if (profile.value) {
    results.value = await app.r().results.list({ profileIds: [props.id] });
    unfinished.value = await app.r().sessions.listUnfinished(props.id);
  }
  selected.value = selected.value.filter((id) => results.value.some((r) => r.id === id));
  wbKey.value++;
  loaded.value = true;
}
onMounted(load);

const latest = computed(() => results.value[0] ?? null);
const filtered = computed(() => (modeFilter.value ? results.value.filter((r) => r.mode === modeFilter.value) : results.value));
const modesPresent = computed(() => MODE_IDS.filter((m) => results.value.some((r) => r.mode === m)));
const withFunctions = computed(() => filtered.value.filter((r) => FUNCTIONS.some((f) => r.result.functions[f].score !== null)));

/** Type to describe: the latest concrete type, or the first candidate when letters are X. */
const describeCode = computed(() => {
  const r = latest.value?.result;
  if (!r) return null;
  if (/^[EI][SN][TF][JP]$/.test(r.typeCode)) return r.typeCode;
  return r.alternatives[0] ?? null;
});
const description = computed(() => (describeCode.value ? pick(typeProfiles[describeCode.value], locale.value) : null));
const latestTitle = computed(() => {
  const code = latest.value?.typeCode;
  return code && /^[EI][SN][TF][JP]$/.test(code) ? pick(typeProfiles[code], locale.value)?.title : null;
});

const dimText = (d: (typeof DIMENSIONS)[number]) => pick(dimensionTexts[d], locale.value) as DimensionText;
const fnNames = computed(
  () => Object.fromEntries(FUNCTIONS.map((f) => [f, pick(functionTexts[f], locale.value)?.name ?? f])) as Record<CogFunction, string>,
);

const infoLine = computed(() => {
  const p = profile.value;
  if (!p) return '';
  const parts: string[] = [];
  if (p.birthYear) parts.push(t('detail.age', { n: new Date().getFullYear() - p.birthYear }));
  if (p.gender) parts.push(t(`profiles.gender.${p.gender}`));
  if (p.occupation) parts.push(p.occupation);
  return parts.join(' · ');
});

async function exportPdf() {
  try {
    const r = await app.p().exportPdf(`MindScope_${profile.value?.name ?? ''}_${fileStamp()}.pdf`);
    if (r.path) message.success(t('pdf.exported', { path: r.path }));
    else if (r.printedWithBrowser) message.info(t('pdf.browserPrint'));
  } catch (err) {
    message.error(t('common.failed', { msg: String(err) }));
  }
}
</script>

<template>
  <div class="ms-page detail-page">
    <n-spin v-if="!loaded" />
    <div v-else-if="!profile" class="ms-card">{{ t('detail.notFound') }}</div>

    <template v-else>
      <!-- header -->
      <section class="ms-card head">
        <ProfileAvatar :avatar="profile.avatar" :size="72" :name="profile.name" />
        <div class="head-text">
          <h1 class="name" data-testid="detail-name">{{ profile.name }}</h1>
          <div v-if="infoLine" class="ms-muted">{{ infoLine }}</div>
          <div v-if="profile.tags.length" class="tags">
            <n-tag v-for="tg in profile.tags" :key="tg.id" size="small" :color="{ color: `${tg.color}22`, textColor: tg.color, borderColor: `${tg.color}55` }">{{ tg.name }}</n-tag>
          </div>
          <p v-if="profile.note" class="note">{{ profile.note }}</p>
          <div class="ms-subtle">{{ t('profiles.createdAt', { date: formatDate(profile.createdAt) }) }}</div>
        </div>
        <div class="head-actions ms-no-print">
          <router-link :to="`/assess?profile=${profile.id}`"><n-button type="primary">{{ t('detail.newTest') }}</n-button></router-link>
          <router-link :to="`/profiles/${profile.id}/edit`"><n-button>{{ t('detail.edit') }}</n-button></router-link>
          <n-button quaternary @click="exportPdf"><template #icon><AppIcon name="download" /></template>{{ t('detail.exportPdf') }}</n-button>
        </div>
      </section>

      <!-- stats -->
      <div class="stats">
        <div class="ms-card stat">
          <div class="v" data-testid="detail-count">{{ results.length }}</div>
          <div class="ms-subtle">{{ t('detail.testCount') }}</div>
        </div>
        <div class="ms-card stat">
          <div class="v small">{{ latest ? formatDate(latest.createdAt, true) : t('detail.none') }}</div>
          <div class="ms-subtle">{{ t('detail.lastTest') }}</div>
        </div>
        <div class="ms-card stat">
          <div class="v code" data-testid="detail-latest-type">{{ latest?.typeCode ?? t('detail.none') }}</div>
          <div class="ms-subtle">{{ latestTitle ?? t('detail.latestType') }}</div>
        </div>
        <div class="ms-card stat">
          <div class="v">{{ unfinished.length }}</div>
          <div class="ms-subtle">{{ t('detail.unfinished') }}</div>
        </div>
      </div>

      <div v-if="unfinished.length" class="ms-card resume ms-no-print">
        <router-link v-for="s in unfinished" :key="s.id" :to="s.kind === 'wellbeing' ? `/check/${s.id}` : `/test/${s.id}`" class="resume-row">
          <AppIcon name="history" :size="16" />
          <span>{{ s.kind === 'wellbeing' ? t('assess.wellbeingName') : s.kind === 'bigfive' ? `${t('b5.short')} · ${t(`modes.${s.mode}.name`)}` : t(`modes.${s.mode}.name`) }} · {{ t('assess.progress', { answered: s.answered, total: s.plannedCount }) }}</span>
          <span class="go">{{ t('assess.continue') }} ›</span>
        </router-link>
      </div>

      <!-- empty state: no invented data -->
      <section v-if="!results.length" class="ms-card empty">
        <n-empty :description="t('detail.noResults')">
          <template #extra>
            <p class="ms-subtle">{{ t('detail.noResultsHint') }}</p>
            <router-link :to="`/assess?profile=${profile.id}`"><n-button type="primary">{{ t('detail.newTest') }}</n-button></router-link>
          </template>
        </n-empty>
      </section>

      <template v-else-if="latest">
        <!-- latest result -->
        <div class="two">
          <section class="ms-card">
            <div class="sec-head">
              <h2>{{ t('detail.latest') }}</h2>
              <router-link :to="`/results/${latest.id}`" class="ms-no-print">{{ t('detail.viewFull') }} ›</router-link>
            </div>
            <div class="latest-type">
              <span class="big">{{ latest.typeCode }}</span>
              <span class="ms-subtle">{{ t(`modes.${latest.mode}.name`) }} · {{ formatDate(latest.createdAt) }}</span>
            </div>
            <DimensionBar v-for="d in DIMENSIONS" :key="d" :score="latest.result.dimensions[d]" :text="dimText(d)" />
          </section>
          <section class="ms-card">
            <h2>{{ t('result.functions') }}</h2>
            <FunctionRadar :functions="latest.result.functions" :names="fnNames" :height="330" />
          </section>
        </div>

        <!-- description & getting along -->
        <section v-if="description" class="ms-card gap">
          <n-alert v-if="describeCode !== latest.typeCode" type="info" class="note-alert">{{ t('detail.balancedNote', { code: describeCode }) }}</n-alert>
          <h2>{{ t('detail.description') }} · {{ describeCode }} {{ description.title }}</h2>
          <p class="summary">{{ description.summary }}</p>
          <div class="cols">
            <div>
              <h3>{{ t('result.strengths') }}</h3>
              <ul><li v-for="s in description.strengths" :key="s">{{ s }}</li></ul>
            </div>
            <div>
              <h3>{{ t('result.challenges') }}</h3>
              <ul><li v-for="s in description.challenges" :key="s">{{ s }}</li></ul>
            </div>
          </div>
          <h3>{{ t('detail.communication') }}</h3>
          <p>{{ description.communication }}</p>
          <div class="along" data-testid="get-along">
            <h3>{{ t('detail.getAlong') }}</h3>
            <div class="cols">
              <div>
                <div class="along-title ok">{{ t('result.getAlongDo') }}</div>
                <ul><li v-for="s in description.getAlong.do" :key="s">{{ s }}</li></ul>
              </div>
              <div>
                <div class="along-title no">{{ t('result.getAlongAvoid') }}</div>
                <ul><li v-for="s in description.getAlong.avoid" :key="s">{{ s }}</li></ul>
              </div>
            </div>
          </div>
        </section>

        <!-- trends -->
        <section class="ms-card gap">
          <div class="sec-head">
            <h2>{{ t('detail.trends') }}</h2>
            <div v-if="modesPresent.length > 1" class="mode-chips ms-no-print">
              <n-tag :checked="modeFilter === null" checkable @update:checked="modeFilter = null">{{ t('detail.allModes') }}</n-tag>
              <n-tag v-for="m in modesPresent" :key="m" checkable :checked="modeFilter === m" @update:checked="modeFilter = m">{{ t(`modes.${m}.name`) }}</n-tag>
            </div>
          </div>
          <p v-if="filtered.length < 2" class="ms-muted" data-testid="need-two">{{ t('detail.needTwo') }}</p>
          <template v-else>
            <p class="ms-subtle">{{ t('detail.trendsHint') }}</p>
            <h3>{{ t('detail.dimTrend') }}</h3>
            <DimensionTrendChart :entries="filtered" />
            <div v-if="withFunctions.length >= 2" class="chart-block">
              <h3>{{ t('detail.fnTrend') }}</h3>
              <p class="ms-subtle ms-no-print">{{ t('detail.fnTrendHint') }}</p>
              <FunctionTrendChart :entries="withFunctions" :names="fnNames" />
            </div>
          </template>
        </section>

        <!-- history -->
        <section class="ms-card gap">
          <h2>{{ t('detail.history') }}</h2>
          <ResultTable v-model:selected="selected" :results="filtered" @delete="(r) => confirmDelete(r, load)" />
        </section>
      </template>

      <!-- Big Five (preview): separate from the 16-type results -->
      <BigFiveSummary :key="`b5-${wbKey}`" :profile-id="profile.id" class="gap" />

      <!-- wellbeing: separate from personality results -->
      <WellbeingSummary :key="wbKey" :profile-id="profile.id" class="gap" />

      <!-- growth notes (local) and optional AI analysis -->
      <GrowthNotes :profile-id="profile.id" class="gap" @changed="(n) => (growth = n)" />
      <AiSection :key="`ai-${wbKey}`" :profile="profile" :results="results" :growth="growth" class="gap" />
    </template>
  </div>
</template>

<style scoped>
.detail-page h2 {
  font-size: 1.1rem;
  margin-bottom: 8px;
}
.detail-page h3 {
  font-size: 0.95rem;
  color: var(--ms-brand);
  margin: 16px 0 6px;
}
.gap {
  margin-top: 16px;
}
.head {
  display: flex;
  gap: 18px;
  align-items: flex-start;
  flex-wrap: wrap;
}
.head-text {
  flex: 1;
  min-width: 220px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.name {
  font-size: 1.5rem;
}
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.note {
  margin: 0;
  color: var(--ms-text-2);
  white-space: pre-wrap;
}
.head-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.head-actions a {
  text-decoration: none;
}
.stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin-top: 16px;
}
.stat .v {
  font-size: 1.7rem;
  font-weight: 800;
  color: var(--ms-brand);
}
.stat .v.small {
  font-size: 1rem;
  padding: 8px 0;
}
.stat .v.code {
  letter-spacing: 0.05em;
}
.resume {
  margin-top: 12px;
  padding: 8px 18px;
  border-left: 4px solid #e09a3e;
}
.resume-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  color: inherit;
  text-decoration: none;
}
.resume-row .go {
  margin-left: auto;
  color: var(--ms-brand);
  font-weight: 600;
}
.empty {
  margin-top: 16px;
  padding: 40px 20px;
}
.empty a {
  text-decoration: none;
}
.two {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-top: 16px;
}
.sec-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.sec-head a {
  color: var(--ms-brand);
  text-decoration: none;
  font-size: 0.9rem;
}
.latest-type {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin: 4px 0 6px;
}
.big {
  font-size: 2.2rem;
  font-weight: 900;
  letter-spacing: 0.06em;
  background: var(--ms-gradient);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}
.summary {
  line-height: 1.8;
}
.cols {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}
ul {
  margin: 0;
  padding-left: 20px;
}
li {
  margin: 3px 0;
}
.along {
  margin-top: 8px;
  padding: 4px 16px 14px;
  border-radius: var(--ms-radius-sm);
  background: color-mix(in srgb, var(--ms-brand) 6%, transparent);
}
.along-title {
  font-weight: 600;
  margin-bottom: 4px;
}
.along-title.ok {
  color: var(--ms-brand);
}
.along-title.no {
  color: #c2410c;
}
.note-alert {
  margin-bottom: 12px;
}
.mode-chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
@media (max-width: 900px) {
  .two,
  .cols {
    grid-template-columns: 1fr;
  }
  .stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media print {
  .two {
    grid-template-columns: 1fr;
  }
  .detail-page .ms-card {
    break-inside: auto;
  }
  .detail-page .two > .ms-card,
  .detail-page .chart-block,
  .detail-page li {
    break-inside: avoid;
  }
}
</style>
