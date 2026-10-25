<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { NAlert, NButton, NCollapse, NCollapseItem, NRadioButton, NRadioGroup, NSpin } from 'naive-ui';
import { DIMENSIONS, FUNCTIONS, type CogFunction } from '@mindscope/core';
import { dimensionTexts, functionTexts, pick, typeProfiles, type DimensionText } from '@mindscope/banks';
import type { Profile } from '@mindscope/core';
import type { StoredResult } from '@mindscope/storage';
import { useAppStore } from '../stores/app';
import { formatDate } from '../i18n';
import DimensionBar from '../components/result/DimensionBar.vue';
import FunctionRadar from '../components/result/FunctionRadar.vue';
import ProfileAvatar from '../components/ProfileAvatar.vue';
import AppIcon from '../components/AppIcon.vue';

const props = defineProps<{ id: string }>();
/** With fewer answers the standard error itself is too unreliable to print. */
const MIN_ITEMS_FOR_SE = 4;
const { t, tm, rt, locale } = useI18n();
const app = useAppStore();

const stored = ref<StoredResult | null>(null);
const profile = ref<Profile | null>(null);
const loaded = ref(false);
const view = ref<'absolute' | 'relative'>('absolute');

onMounted(async () => {
  stored.value = await app.r().results.get(props.id);
  if (stored.value) profile.value = await app.r().profiles.get(stored.value.profileId);
  loaded.value = true;
});

const r = computed(() => stored.value?.result ?? null);
const code = computed(() => r.value?.typeCode ?? '????');
const concrete = computed(() => /^[EI][SN][TF][JP]$/.test(code.value));
/** Types to describe: the type itself, or each candidate when some letters are X. */
const profileCodes = computed(() => (concrete.value ? [code.value] : (r.value?.alternatives ?? [])));
const mainTitle = computed(() => (concrete.value ? pick(typeProfiles[code.value], locale.value)?.title : null));

const dimText = (d: (typeof DIMENSIONS)[number]) => pick(dimensionTexts[d], locale.value) as DimensionText;
const fnNames = computed(
  () => Object.fromEntries(FUNCTIONS.map((f) => [f, pick(functionTexts[f], locale.value)?.name ?? f])) as Record<CogFunction, string>,
);
const fnRows = computed(() =>
  r.value
    ? [...FUNCTIONS]
        .map((f) => ({ f, s: r.value!.functions[f], text: pick(functionTexts[f], locale.value) }))
        .sort((a, b) => (a.s.rank ?? 99) - (b.s.rank ?? 99))
    : [],
);
const missingFns = computed(() => fnRows.value.filter((x) => x.s.score == null).map((x) => x.f));
const stack = computed(() => r.value?.theoreticalStack ?? null);

function duration(ms: number) {
  const m = Math.round(ms / 60000);
  return m < 1 ? `${Math.round(ms / 1000)}s` : `${m} min`;
}
const metaLine = computed(() => {
  const s = stored.value;
  if (!s) return '';
  return t('result.meta', {
    mode: t(`modes.${s.mode}.name`),
    date: formatDate(s.createdAt, true),
    answered: s.result.answered,
    total: s.meta.plannedCount,
    duration: duration(s.meta.elapsedMs),
  });
});
const fmt = (v: number | null | undefined, digits = 2) => (v == null ? '—' : v.toFixed(digits));
const FORMULA = 'S = Σ wᵢ·keyᵢ·xᵢ / Σ wᵢ　·　SE = √(Σw(v−S)²/Σw ÷ (n_eff−1))　·　xᵢ = (rᵢ − 4) / 3';
function methodLine(d: (typeof DIMENSIONS)[number]) {
  const dim = r.value!.dimensions[d];
  const txt = dimText(d);
  return t('result.methodDim', { dim: `${txt.first.letter}/${txt.second.letter}`, s: fmt(dim.score), se: fmt(dim.se), n: dim.answered });
}
const limitations = computed(() => (tm('result.limitationList') as unknown[]).map((m) => rt(m as never)));

</script>

<template>
  <div class="ms-page result-page">
    <n-spin v-if="!loaded" />
    <div v-else-if="!stored || !r" class="ms-card">{{ t('result.notFound') }}</div>

    <template v-else>
      <!-- header -->
      <section class="ms-card hero">
        <div class="who">
          <ProfileAvatar v-if="profile" :avatar="profile.avatar" :size="40" />
          <div>
            <div class="who-name">{{ profile?.name }}</div>
            <div class="ms-subtle">{{ metaLine }}</div>
          </div>
        </div>
        <div class="type-row">
          <div class="type-code" data-testid="type-code">
            <span v-for="(ch, i) in code.split('')" :key="i" :class="{ x: ch === 'X' || ch === '?' }">{{ ch }}</span>
          </div>
          <div class="type-title">
            <div class="ms-subtle">{{ concrete ? t('result.typeTitle') : t('result.balancedTitle') }}</div>
            <div class="title">{{ mainTitle ?? r.alternatives.join(' / ') }}</div>
          </div>
        </div>
        <div class="chips">
          <span class="chip warn">{{ t('result.experimental') }}</span>
          <span class="chip">{{ t('result.bank', { version: stored.versionId, engine: stored.engineVersion }) }}</span>
        </div>
        <div class="hero-actions ms-no-print">
          <router-link :to="`/report/mbti/${stored.id}`">
            <n-button type="primary" data-testid="open-report"><template #icon><AppIcon name="file" /></template>{{ t('result.exportPdf') }}</n-button>
          </router-link>
          <router-link :to="`/assess?profile=${stored.profileId}`"><n-button>{{ t('result.retake') }}</n-button></router-link>
          <router-link :to="`/profiles/${stored.profileId}`"><n-button quaternary>{{ t('result.backToProfile') }}</n-button></router-link>
        </div>
      </section>

      <n-alert v-if="stored.mode === 'quick'" type="warning" class="gap">{{ t('result.quickNotice') }}</n-alert>
      <n-alert v-if="!concrete && r.alternatives.length" type="info" class="gap">
        {{ t('result.balancedHint', { list: r.alternatives.join('、') }) }}
      </n-alert>
      <n-alert v-if="code.includes('?')" type="error" class="gap">{{ t('result.insufficientHint') }}</n-alert>

      <div class="two">
        <!-- four dimensions -->
        <section class="ms-card">
          <h2>{{ t('result.dimensions') }}</h2>
          <p class="ms-subtle">{{ t('result.dimensionsHint') }}</p>
          <DimensionBar v-for="d in DIMENSIONS" :key="d" :score="r.dimensions[d]" :text="dimText(d)" />
        </section>

        <!-- eight functions -->
        <section class="ms-card">
          <div class="sec-head">
            <h2>{{ t('result.functions') }}</h2>
            <n-radio-group v-model:value="view" size="small" class="ms-no-print">
              <n-radio-button value="absolute">{{ t('result.absolute') }}</n-radio-button>
              <n-radio-button value="relative">{{ t('result.relative') }}</n-radio-button>
            </n-radio-group>
          </div>
          <p class="ms-subtle">{{ t('result.functionsHint') }}</p>
          <FunctionRadar :functions="r.functions" :names="fnNames" :view="view" :height="360" />
          <p v-if="missingFns.length" class="ms-subtle">{{ t('result.functionsMissing', { list: missingFns.join(', ') }) }}</p>
        </section>
      </div>

      <section class="ms-card gap">
        <table class="fn-table">
          <thead>
            <tr>
              <th>{{ t('result.rank') }}</th>
              <th></th>
              <th>{{ t('result.score') }}</th>
              <th>{{ t('result.relative') }}</th>
              <th class="desc-col"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in fnRows" :key="row.f">
              <td class="num">{{ row.s.rank ?? '—' }}</td>
              <td><b>{{ row.f }}</b> {{ row.text?.name }}</td>
              <td class="num">
                <template v-if="row.s.score == null">{{ t('band.insufficient') }}</template>
                <template v-else>
                  {{ row.s.score.toFixed(0) }}<span v-if="row.s.answered >= MIN_ITEMS_FOR_SE" class="se"> ± {{ (row.s.se ?? 0).toFixed(0) }}</span>
                  <span class="n">{{ t('result.itemsN', { n: row.s.answered }) }}</span>
                </template>
              </td>
              <td class="num">{{ row.s.relative == null ? '—' : `${row.s.relative > 0 ? '+' : ''}${row.s.relative.toFixed(0)}` }}</td>
              <td class="desc-col ms-muted">{{ row.text?.short }}</td>
            </tr>
          </tbody>
        </table>
        <div v-if="stack" class="theory">
          <div class="ms-subtle">{{ t('result.theory') }}</div>
          <div class="stack">
            <span v-for="(f, i) in [stack.dominant, stack.auxiliary, stack.tertiary, stack.inferior]" :key="f">
              {{ f }}<template v-if="i < 3"> › </template>
            </span>
          </div>
          <p v-if="r.stackAgreement" class="ms-muted">{{ t(`result.agreement.${r.stackAgreement}`) }}</p>
        </div>
      </section>

      <!-- description -->
      <section v-if="profileCodes.length" class="ms-card gap">
        <h2>{{ t('result.profile') }}</h2>
        <template v-for="c in profileCodes" :key="`p-${c}`">
          <div v-if="pick(typeProfiles[c], locale)" class="profile">
            <h3 v-if="profileCodes.length > 1" class="alt-title">{{ c }} · {{ pick(typeProfiles[c], locale)!.title }}</h3>
            <p class="summary">{{ pick(typeProfiles[c], locale)!.summary }}</p>
            <div class="cols">
              <div>
                <h4>{{ t('result.strengths') }}</h4>
                <ul>
                  <li v-for="s in pick(typeProfiles[c], locale)!.strengths" :key="s">{{ s }}</li>
                </ul>
              </div>
              <div>
                <h4>{{ t('result.challenges') }}</h4>
                <ul>
                  <li v-for="s in pick(typeProfiles[c], locale)!.challenges" :key="s">{{ s }}</li>
                </ul>
              </div>
            </div>
            <h4>{{ t('result.work') }}</h4>
            <p>{{ pick(typeProfiles[c], locale)!.work }}</p>
            <h4>{{ t('result.communication') }}</h4>
            <p>{{ pick(typeProfiles[c], locale)!.communication }}</p>
            <h4>{{ t('result.relationships') }}</h4>
            <p>{{ pick(typeProfiles[c], locale)!.relationships }}</p>
            <h4>{{ t('result.getAlong') }}</h4>
            <div class="cols along">
              <div>
                <div class="along-title ok">{{ t('result.getAlongDo') }}</div>
                <ul>
                  <li v-for="s in pick(typeProfiles[c], locale)!.getAlong.do" :key="s">{{ s }}</li>
                </ul>
              </div>
              <div>
                <div class="along-title no">{{ t('result.getAlongAvoid') }}</div>
                <ul>
                  <li v-for="s in pick(typeProfiles[c], locale)!.getAlong.avoid" :key="s">{{ s }}</li>
                </ul>
              </div>
            </div>
            <h4>{{ t('result.growth') }}</h4>
            <ul>
              <li v-for="s in pick(typeProfiles[c], locale)!.growth" :key="s">{{ s }}</li>
            </ul>
          </div>
        </template>
      </section>

      <!-- limitations -->
      <section class="ms-card gap limits">
        <h2>{{ t('result.limitations') }}</h2>
        <ul>
          <li v-for="l in limitations" :key="l">{{ l }}</li>
        </ul>
      </section>

      <!-- method: collapsible on screen, always printed in full -->
      <section class="ms-card gap method ms-no-print">
        <n-collapse>
          <n-collapse-item :title="t('result.method')" name="m">
            <p>{{ t('result.methodIntro') }}</p>
            <ul>
              <li v-for="d in DIMENSIONS" :key="d">{{ methodLine(d) }}</li>
            </ul>
            <p>{{ t('result.methodFn') }}</p>
            <p class="ms-subtle">{{ FORMULA }}</p>
          </n-collapse-item>
        </n-collapse>
      </section>
      <section class="ms-card gap ms-print-only">
        <h2>{{ t('result.method') }}</h2>
        <p>{{ t('result.methodIntro') }}</p>
        <ul>
          <li v-for="d in DIMENSIONS" :key="d">{{ methodLine(d) }}</li>
        </ul>
        <p>{{ t('result.methodFn') }}</p>
        <p class="ms-subtle">{{ FORMULA }}</p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.result-page h2 {
  font-size: 1.1rem;
  margin-bottom: 4px;
}
.gap {
  margin-top: 16px;
}
.hero {
  background:
    linear-gradient(120deg, color-mix(in srgb, var(--ms-brand-2) 12%, transparent), color-mix(in srgb, var(--ms-accent) 10%, transparent)),
    var(--ms-surface);
}
.who {
  display: flex;
  align-items: center;
  gap: 12px;
}
.who-name {
  font-weight: 700;
}
.type-row {
  display: flex;
  align-items: center;
  gap: 22px;
  margin: 18px 0 12px;
  flex-wrap: wrap;
}
.type-code {
  font-size: clamp(2.6rem, 7vw, 3.6rem);
  font-weight: 900;
  letter-spacing: 0.08em;
  background: var(--ms-gradient);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  line-height: 1;
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}
.type-code .x {
  -webkit-text-fill-color: var(--ms-text-3);
}
.title {
  font-size: 1.4rem;
  font-weight: 800;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.chip {
  font-size: 0.75rem;
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--ms-surface-2);
  color: var(--ms-text-2);
}
.chip.warn {
  background: color-mix(in srgb, #e09a3e 18%, transparent);
  color: #9a5d12;
}
.hero-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 16px;
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
  gap: 8px;
}
.fn-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}
.fn-table th {
  text-align: left;
  font-weight: 500;
  color: var(--ms-text-3);
  padding: 6px 8px;
  border-bottom: 1px solid var(--ms-border);
}
.fn-table td {
  padding: 8px;
  border-bottom: 1px solid var(--ms-border);
}
.num {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.num .se {
  color: var(--ms-text-3);
}
.num .n {
  margin-left: 6px;
  font-size: 0.75rem;
  color: var(--ms-text-3);
}
.theory {
  margin-top: 14px;
}
.stack {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--ms-accent);
  margin: 4px 0;
}
.summary {
  font-size: 1.02rem;
  line-height: 1.8;
}
.profile h4 {
  margin: 16px 0 6px;
  color: var(--ms-brand);
}
.profile p {
  margin: 0;
}
.profile ul {
  margin: 0;
  padding-left: 20px;
}
.profile li {
  margin: 3px 0;
}
.alt-title {
  margin-top: 22px;
  padding-top: 14px;
  border-top: 1px dashed var(--ms-border);
}
.cols {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
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
.limits ul {
  padding-left: 20px;
  margin: 8px 0 0;
  color: var(--ms-text-2);
}
@media (max-width: 900px) {
  .two,
  .cols {
    grid-template-columns: 1fr;
  }
  .desc-col {
    display: none;
  }
}
@media print {
  .two {
    grid-template-columns: 1fr;
  }
  /* Long text cards may flow across pages; charts and small blocks stay whole. */
  .result-page .ms-card {
    break-inside: auto;
  }
  .result-page .hero,
  .result-page .two > .ms-card,
  .result-page .profile li,
  .result-page .profile h4,
  .fn-table tr {
    break-inside: avoid;
  }
  .result-page .profile h4 {
    break-after: avoid;
  }
}
</style>
