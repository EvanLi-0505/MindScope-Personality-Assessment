<script setup lang="ts">
/**
 * Formal A4 report for one result: MBTI-style personality ("mbti") or a
 * wellbeing check-in ("wellbeing"). The page is the print layout itself; the
 * toolbar picks optional sections and is never printed.
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { NButton, NCheckbox, NSpin, useMessage } from 'naive-ui';
import {
  APP_VERSION,
  B5_DOMAINS,
  DIMENSIONS,
  FUNCTIONS,
  fileStamp,
  localize,
  scoreRange,
  type CogFunction,
  type Profile,
  type ScaleBand,
} from '@mindscope/core';
import { dimensionTexts, functionTexts, pick, typeProfiles, type DimensionText } from '@mindscope/banks';
import type { AiNote, StoredBank, StoredBigFive, StoredBigFiveResult, StoredResult, StoredScale, StoredScaleResult } from '@mindscope/storage';
import { useAppStore } from '../stores/app';
import { formatDate } from '../i18n';
import BrandMark from '../components/BrandMark.vue';
import AppIcon from '../components/AppIcon.vue';
import DimensionBar from '../components/result/DimensionBar.vue';
import FunctionRadar from '../components/result/FunctionRadar.vue';
import ScoreBar from '../components/wellbeing/ScoreBar.vue';
import SafetyCard from '../components/wellbeing/SafetyCard.vue';
import ScaleTrendChart from '../components/charts/ScaleTrendChart.vue';
import { LEVEL_COLORS } from '../components/wellbeing/levels';
import AiNoteView from '../components/ai/AiNoteView.vue';
import BigFiveRadar from '../components/bigfive/BigFiveRadar.vue';
import DomainRows from '../components/bigfive/DomainRows.vue';
import FacetTable from '../components/bigfive/FacetTable.vue';
import { useBigFiveText } from '../components/bigfive/useBigFiveText';

const props = defineProps<{ kind: string; id: string }>();
const { t, tm, rt, locale } = useI18n();
const message = useMessage();
const app = useAppStore();

const isMbti = computed(() => props.kind === 'mbti');
const isAi = computed(() => props.kind === 'ai');
const isB5 = computed(() => props.kind === 'bigfive');
const b5 = ref<StoredBigFiveResult | null>(null);
const b5Bank = ref<StoredBigFive | null>(null);
const aiNote = ref<AiNote | null>(null);
const loaded = ref(false);
const generatedAt = new Date().toISOString();
const profile = ref<Profile | null>(null);

// personality
const mbti = ref<StoredResult | null>(null);
const bank = ref<StoredBank | null>(null);
const mbtiAnswers = ref<{ n: number; text: string; answer: string }[]>([]);
// wellbeing
const wb = ref<StoredScaleResult | null>(null);
const scale = ref<StoredScale | null>(null);
const wbHistory = ref<StoredScaleResult[]>([]);

/** Optional sections. Safety information and scale licensing are always printed. */
const show = reactive({ dimensions: true, functions: true, profile: true, method: true, suggestions: true, trend: true, answers: false, facets: true, getAlong: true });

onMounted(async () => {
  try {
    if (isMbti.value) {
      mbti.value = await app.r().results.get(props.id);
      if (mbti.value) {
        profile.value = await app.r().profiles.get(mbti.value.profileId);
        bank.value = await app.r().bank.load(mbti.value.versionId);
        const session = await app.r().sessions.get(mbti.value.sessionId);
        const answers = await app.r().sessions.answers(mbti.value.sessionId);
        const byId = new Map(bank.value.items.map((i) => [i.id, i]));
        const lang = locale.value;
        mbtiAnswers.value = (session?.sequence ?? []).map((e, i) => {
          const item = byId.get(e.itemId);
          const v = answers[e.itemId]?.value ?? null;
          const sc = item ? bank.value!.scales[item.scale] : undefined;
          const labels = sc ? (sc.labels[lang] ?? sc.labels['zh-CN'] ?? []) : [];
          return { n: i + 1, text: item ? localize(item.text, lang) : e.itemId, answer: v == null ? '—' : `${v} · ${labels[v - 1] ?? ''}` };
        });
      }
    } else if (props.kind === 'bigfive') {
      b5.value = await app.r().bigfive.get(props.id);
      if (b5.value) {
        profile.value = await app.r().profiles.get(b5.value.profileId);
        b5Bank.value = await app.r().bigfive.load(b5.value.versionId);
      }
    } else if (props.kind === 'ai') {
      aiNote.value = await app.r().aiNotes.get(props.id);
      if (aiNote.value) profile.value = await app.r().profiles.get(aiNote.value.profileId);
    } else if (props.kind === 'wellbeing') {
      show.answers = true;
      wb.value = await app.r().scales.get(props.id);
      if (wb.value) {
        profile.value = await app.r().profiles.get(wb.value.profileId);
        scale.value = await app.r().scales.load(wb.value.versionId);
        // History up to and including this result, oldest first for the table.
        wbHistory.value = (await app.r().scales.list({ profileIds: [wb.value.profileId], instruments: [wb.value.instrument] })).filter(
          (h) => h.createdAt <= wb.value!.createdAt,
        );
      }
    }
  } finally {
    loaded.value = true;
  }
});

const found = computed(() =>
  isMbti.value ? !!mbti.value : isAi.value ? !!aiNote.value : isB5.value ? !!(b5.value && b5Bank.value) : !!(wb.value && scale.value),
);
const createdAt = computed(() => mbti.value?.createdAt ?? wb.value?.createdAt ?? aiNote.value?.createdAt ?? b5.value?.createdAt ?? generatedAt);
const reportNo = computed(() => `MS-${fileStamp(new Date(createdAt.value)).replace('-', '')}-${props.id.slice(-6).toUpperCase()}`);
const title = computed(() =>
  isMbti.value ? t('report.mbtiTitle') : isAi.value ? t('report.aiTitle') : isB5.value ? t('report.b5Title') : t('report.wbTitle'),
);
const instrumentName = computed(() =>
  isAi.value && aiNote.value
    ? `${t(`ai.task.${aiNote.value.task}.name`)} · ${aiNote.value.model}`
    : isB5.value && b5.value
      ? `${t('b5.name')} · ${t(`modes.${b5.value.form}.name`)}`
      : isMbti.value ? `${t('assess.mbtiName')} · ${t(`modes.${mbti.value?.mode ?? 'normal'}.name`)}` : scale.value ? localize(scale.value.title, locale.value) : '',
);
const age = computed(() => (profile.value?.birthYear ? new Date(createdAt.value).getFullYear() - profile.value.birthYear : null));

// ── Big Five helpers ──
const { domainText: b5Text, names: b5Names } = useBigFiveText();
const b5Tips = computed(() =>
  b5.value
    ? B5_DOMAINS.filter((d) => b5.value!.result.domains[d].band && b5.value!.result.domains[d].band !== 'mid').map((d) => ({
        d,
        band: b5.value!.result.domains[d].band!,
        text: b5.value!.result.domains[d].band === 'high' ? b5Text(d).getAlongHigh : b5Text(d).getAlongLow,
      }))
    : [],
);
const b5Answers = computed(() => {
  const r = b5.value;
  const bk = b5Bank.value;
  if (!r || !bk) return [];
  const byId = new Map(bk.items.map((i) => [i.id, i]));
  return bk.forms[r.form].entries.map((e, i) => {
    const v = r.result.answers[e.item];
    const opt = bk.options.find((o) => o.value === v);
    return { n: i + 1, text: localize(byId.get(e.item)!.text, locale.value), answer: opt ? `${v} · ${localize(opt.label, locale.value)}` : '—' };
  });
});
const b5Limitations = computed(() => (tm('b5.limitationList') as unknown[]).map((m) => rt(m as never)));
const b5Adapted = computed(() =>
  (b5Bank.value?.items ?? [])
    .filter((i) => i.adapted)
    .map((i) => '“' + localize(i.text, locale.value) + '”')
    .join('、'),
);

// ── personality helpers (same rules as ResultPage) ──
const MIN_ITEMS_FOR_SE = 4;
const r = computed(() => mbti.value?.result ?? null);
const code = computed(() => r.value?.typeCode ?? '????');
const concrete = computed(() => /^[EI][SN][TF][JP]$/.test(code.value));
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
const stack = computed(() => r.value?.theoreticalStack ?? null);
const fmt = (v: number | null | undefined, digits = 2) => (v == null ? '—' : v.toFixed(digits));
function duration(ms: number) {
  const m = Math.round(ms / 60000);
  return m < 1 ? `${Math.round(ms / 1000)}s` : `${m} min`;
}
const mbtiLimitations = computed(() => (tm('result.limitationList') as unknown[]).map((m) => rt(m as never)));

// ── wellbeing helpers ──
const sr = computed(() => wb.value?.result ?? null);
const band = computed<ScaleBand | null>(() => scale.value?.scoring.bands.find((b) => b.key === sr.value?.band?.key) ?? null);
const range = computed(() => (scale.value ? scoreRange(scale.value) : [0, 0]));
const rawMax = computed(() => (scale.value ? range.value[1] / scale.value.scoring.multiplier : 0));
const wbLimitations = computed(() => (tm('wb.limitationList') as unknown[]).map((m) => rt(m as never)));
const wbAnswers = computed(() =>
  (scale.value?.items ?? []).map((item, i) => {
    const v = sr.value?.answers[item.id];
    const opt = scale.value!.options.find((o) => o.value === v);
    return {
      n: i + 1,
      text: localize(item.text, locale.value),
      answer: opt ? `${opt.value} · ${localize(opt.label, locale.value)}` : '—',
      safety: sr.value?.safetyItems.includes(item.id) ?? false,
    };
  }),
);
const bandLabel = (key: string | undefined) => {
  const b = scale.value?.scoring.bands.find((x) => x.key === key);
  return b ? localize(b.label, locale.value) : '—';
};

// ── export ──
const exported = ref<string | null>(null);
const busy = ref(false);
const canOpen = computed(() => !!app.p().openExported);

async function exportPdf() {
  if (busy.value) return;
  busy.value = true;
  const what = isMbti.value ? code.value : isAi.value ? 'AI' : isB5.value ? 'BigFive' : (scale.value?.instrument ?? 'check');
  const name = `MindScope_${profile.value?.name ?? ''}_${what}_${fileStamp(new Date(createdAt.value))}.pdf`;
  try {
    const res = await app.p().exportPdf(name);
    if (res.path) {
      exported.value = res.path;
      message.success(t('pdf.exported', { path: res.path }));
    } else if (res.printedWithBrowser) message.info(t('pdf.browserPrint'));
  } catch (err) {
    message.error(t('common.failed', { msg: String(err) }));
  } finally {
    busy.value = false;
  }
}

async function openExported(reveal: boolean) {
  if (!exported.value) return;
  try {
    await app.p().openExported?.(exported.value, reveal);
  } catch (err) {
    message.error(t('common.failed', { msg: String(err) }));
  }
}

const backTo = computed(() =>
  isMbti.value
    ? `/results/${props.id}`
    : isB5.value
      ? `/b5/${props.id}`
      : isAi.value
        ? aiNote.value
          ? `/profiles/${aiNote.value.profileId}`
          : '/'
        : `/wellbeing/${props.id}`,
);
</script>

<template>
  <div class="report-root" :class="locale === 'zh-CN' ? 'pages-zh' : 'pages-en'">
    <!-- toolbar: screen only -->
    <header class="toolbar ms-no-print">
      <router-link :to="backTo"><n-button quaternary><template #icon><AppIcon name="chevronLeft" /></template>{{ t('common.back') }}</n-button></router-link>
      <div v-if="!isAi" class="toggles">
        <span class="ms-subtle">{{ t('report.include') }}</span>
        <template v-if="isMbti">
          <n-checkbox v-model:checked="show.dimensions">{{ t('result.dimensions') }}</n-checkbox>
          <n-checkbox v-model:checked="show.functions">{{ t('result.functions') }}</n-checkbox>
          <n-checkbox v-model:checked="show.profile">{{ t('result.profile') }}</n-checkbox>
          <n-checkbox v-model:checked="show.method">{{ t('result.method') }}</n-checkbox>
        </template>
        <template v-else-if="isB5">
          <n-checkbox v-if="b5?.result.facets" v-model:checked="show.facets">{{ t('b5.facets') }}</n-checkbox>
          <n-checkbox v-model:checked="show.getAlong">{{ t('b5.getAlong') }}</n-checkbox>
          <n-checkbox v-model:checked="show.method">{{ t('b5.method') }}</n-checkbox>
        </template>
        <template v-else>
          <n-checkbox v-model:checked="show.suggestions">{{ t('wb.suggestions') }}</n-checkbox>
          <n-checkbox v-model:checked="show.trend">{{ t('wb.trend') }}</n-checkbox>
        </template>
        <n-checkbox v-model:checked="show.answers" data-testid="toggle-answers">{{ t('report.answers') }}</n-checkbox>
      </div>
      <div v-else class="toggles" />
      <div class="export">
        <n-button type="primary" :loading="busy" :disabled="!found" data-testid="report-export" @click="exportPdf">
          <template #icon><AppIcon name="download" /></template>{{ t('report.export') }}
        </n-button>
        <template v-if="exported && canOpen">
          <n-button secondary data-testid="report-open" @click="openExported(false)">{{ t('report.openFile') }}</n-button>
          <n-button quaternary @click="openExported(true)">{{ t('report.showInFolder') }}</n-button>
        </template>
      </div>
    </header>

    <n-spin v-if="!loaded" class="center" />
    <div v-else-if="!found" class="paper"><p>{{ isMbti ? t('result.notFound') : isAi ? t('report.aiNotFound') : isB5 ? t('b5.notFound') : t('wb.notFound') }}</p></div>

    <article v-else class="paper" data-testid="report">
      <!-- letterhead -->
      <div class="letterhead">
        <div class="brand">
          <BrandMark :size="44" />
          <div>
            <div class="brand-name">MindScope</div>
            <div class="brand-sub">{{ t('report.brandSub') }}</div>
          </div>
        </div>
        <div class="doc-title">
          <h1 data-testid="report-title">{{ title }}</h1>
          <div class="report-no">{{ t('report.no') }} {{ reportNo }}</div>
        </div>
      </div>

      <table class="info">
        <tbody>
          <tr>
            <th>{{ t('report.person') }}</th>
            <td data-testid="report-person">{{ profile?.name ?? '—' }}<span v-if="profile?.isDemo" class="demo">{{ t('report.demo') }}</span></td>
            <th>{{ isAi ? t('report.aiDate') : t('report.date') }}</th>
            <td>{{ formatDate(createdAt, true) }}</td>
          </tr>
          <tr>
            <th>{{ isAi ? t('report.aiKind') : t('report.instrument') }}</th>
            <td>{{ instrumentName }}</td>
            <th>{{ t('report.generated') }}</th>
            <td>{{ formatDate(generatedAt, true) }}</td>
          </tr>
          <tr v-if="profile && (age != null || profile.gender || profile.occupation)">
            <th>{{ t('report.about') }}</th>
            <td colspan="3">
              {{ [age != null ? t('report.age', { n: age }) : null, profile.gender, profile.occupation].filter(Boolean).join(' · ') }}
            </td>
          </tr>
        </tbody>
      </table>

      <!-- ═════ personality ═════ -->
      <template v-if="isMbti && mbti && r">
        <section class="sec">
          <h2><span class="num">1</span>{{ t('report.summary') }}</h2>
          <div class="type-row">
            <div class="type-code" data-testid="report-type">
              <span v-for="(ch, i) in code.split('')" :key="i" :class="{ x: ch === 'X' || ch === '?' }">{{ ch }}</span>
            </div>
            <div>
              <div class="ms-subtle">{{ concrete ? t('result.typeTitle') : t('result.balancedTitle') }}</div>
              <div class="type-title">{{ mainTitle ?? r.alternatives.join(' / ') }}</div>
            </div>
          </div>
          <table class="kv">
            <tbody>
              <tr>
                <th>{{ t('report.mode') }}</th>
                <td>{{ t(`modes.${mbti.mode}.name`) }}</td>
                <th>{{ t('report.items') }}</th>
                <td>{{ r.answered }} / {{ mbti.meta.plannedCount }}</td>
              </tr>
              <tr>
                <th>{{ t('report.duration') }}</th>
                <td>{{ duration(mbti.meta.elapsedMs) }}</td>
                <th>{{ t('report.version') }}</th>
                <td>{{ mbti.versionId }} · {{ mbti.engineVersion }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="mbti.mode === 'quick'" class="note">{{ t('result.quickNotice') }}</p>
          <p v-if="!concrete && r.alternatives.length" class="note">{{ t('result.balancedHint', { list: r.alternatives.join('、') }) }}</p>
          <p v-if="code.includes('?')" class="note">{{ t('result.insufficientHint') }}</p>
          <p class="note">{{ t('result.experimental') }}</p>
        </section>

        <section v-if="show.dimensions" class="sec keep">
          <h2><span class="num">2</span>{{ t('result.dimensions') }}</h2>
          <p class="ms-subtle">{{ t('result.dimensionsHint') }}</p>
          <DimensionBar v-for="d in DIMENSIONS" :key="d" :score="r.dimensions[d]" :text="dimText(d)" />
        </section>

        <section v-if="show.functions" class="sec">
          <!-- heading stays on the page with its chart -->
          <div class="keep">
            <h2><span class="num">3</span>{{ t('result.functions') }}</h2>
            <p class="ms-subtle">{{ t('result.functionsHint') }}</p>
            <div class="radar"><FunctionRadar :functions="r.functions" :names="fnNames" view="absolute" :height="330" /></div>
          </div>
          <table class="grid">
            <thead>
              <tr>
                <th>{{ t('result.rank') }}</th>
                <th></th>
                <th>{{ t('result.score') }}</th>
                <th>{{ t('result.relative') }}</th>
                <th>{{ t('report.meaning') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in fnRows" :key="row.f">
                <td class="c">{{ row.s.rank ?? '—' }}</td>
                <td class="nowrap"><b>{{ row.f }}</b> {{ row.text?.name }}</td>
                <td class="nowrap">
                  <template v-if="row.s.score == null">{{ t('band.insufficient') }}</template>
                  <template v-else>{{ row.s.score.toFixed(0) }}<span v-if="row.s.answered >= MIN_ITEMS_FOR_SE"> ± {{ (row.s.se ?? 0).toFixed(0) }}</span></template>
                </td>
                <td class="c">{{ row.s.relative == null ? '—' : `${row.s.relative > 0 ? '+' : ''}${row.s.relative.toFixed(0)}` }}</td>
                <td class="small">{{ row.text?.short }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="stack" class="stack">
            {{ t('result.theory') }}：<b>{{ [stack.dominant, stack.auxiliary, stack.tertiary, stack.inferior].join(' › ') }}</b>
            <span v-if="r.stackAgreement" class="ms-subtle"> — {{ t(`result.agreement.${r.stackAgreement}`) }}</span>
          </p>
        </section>

        <section v-if="show.profile && profileCodes.length" class="sec flow">
          <h2><span class="num">4</span>{{ t('result.profile') }}</h2>
          <template v-for="c in profileCodes" :key="c">
            <div v-if="pick(typeProfiles[c], locale)" class="profile">
              <h3 v-if="profileCodes.length > 1">{{ c }} · {{ pick(typeProfiles[c], locale)!.title }}</h3>
              <p class="lead">{{ pick(typeProfiles[c], locale)!.summary }}</p>
              <div class="cols">
                <div>
                  <h4>{{ t('result.strengths') }}</h4>
                  <ul><li v-for="s in pick(typeProfiles[c], locale)!.strengths" :key="s">{{ s }}</li></ul>
                </div>
                <div>
                  <h4>{{ t('result.challenges') }}</h4>
                  <ul><li v-for="s in pick(typeProfiles[c], locale)!.challenges" :key="s">{{ s }}</li></ul>
                </div>
              </div>
              <h4>{{ t('result.work') }}</h4>
              <p>{{ pick(typeProfiles[c], locale)!.work }}</p>
              <h4>{{ t('result.communication') }}</h4>
              <p>{{ pick(typeProfiles[c], locale)!.communication }}</p>
              <h4>{{ t('result.relationships') }}</h4>
              <p>{{ pick(typeProfiles[c], locale)!.relationships }}</p>
              <h4>{{ t('result.getAlong') }}</h4>
              <div class="cols">
                <div>
                  <div class="sub ok">{{ t('result.getAlongDo') }}</div>
                  <ul><li v-for="s in pick(typeProfiles[c], locale)!.getAlong.do" :key="s">{{ s }}</li></ul>
                </div>
                <div>
                  <div class="sub no">{{ t('result.getAlongAvoid') }}</div>
                  <ul><li v-for="s in pick(typeProfiles[c], locale)!.getAlong.avoid" :key="s">{{ s }}</li></ul>
                </div>
              </div>
              <h4>{{ t('result.growth') }}</h4>
              <ul><li v-for="s in pick(typeProfiles[c], locale)!.growth" :key="s">{{ s }}</li></ul>
            </div>
          </template>
        </section>

        <section v-if="show.method" class="sec flow">
          <h2><span class="num">5</span>{{ t('report.methodAndLimits') }}</h2>
          <p>{{ t('result.methodIntro') }}</p>
          <ul>
            <li v-for="d in DIMENSIONS" :key="d">
              {{ t('result.methodDim', { dim: `${dimText(d).first.letter}/${dimText(d).second.letter}`, s: fmt(r.dimensions[d].score), se: fmt(r.dimensions[d].se), n: r.dimensions[d].answered }) }}
            </li>
          </ul>
          <p>{{ t('result.methodFn') }}</p>
          <h4>{{ t('result.limitations') }}</h4>
          <ul><li v-for="l in mbtiLimitations" :key="l">{{ l }}</li></ul>
        </section>

        <section v-if="show.answers && mbtiAnswers.length" class="sec flow appendix" data-testid="report-answers">
          <h2><span class="num">A</span>{{ t('report.answers') }}</h2>
          <table class="grid answers">
            <tbody>
              <tr v-for="row in mbtiAnswers" :key="row.n">
                <td class="c">{{ row.n }}</td>
                <td>{{ row.text }}</td>
                <td class="nowrap">{{ row.answer }}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </template>

      <!-- ═════ Big Five ═════ -->
      <template v-else-if="isB5 && b5 && b5Bank">
        <section class="sec keep">
          <h2><span class="num">1</span>{{ t('report.summary') }}</h2>
          <p class="note">{{ t('b5.previewNote') }}</p>
          <div class="radar" data-testid="report-b5-radar"><BigFiveRadar :sets="[{ name: b5.profileName, domains: b5.result.domains }]" :names="b5Names" :height="300" /></div>
          <p class="ms-subtle">{{ t('b5.bandHint') }}</p>
        </section>
        <section class="sec flow">
          <h2><span class="num">2</span>{{ t('b5.domains') }}</h2>
          <DomainRows :domains="b5.result.domains" />
        </section>
        <section v-if="show.facets && b5.result.facets" class="sec flow">
          <h2><span class="num">3</span>{{ t('b5.facets') }}</h2>
          <p class="ms-subtle">{{ t('b5.facetsHint') }}</p>
          <FacetTable :facets="b5.result.facets" />
        </section>
        <section v-if="show.getAlong" class="sec">
          <h2><span class="num">4</span>{{ t('b5.getAlong') }}</h2>
          <ul v-if="b5Tips.length">
            <li v-for="tip in b5Tips" :key="tip.d"><b>{{ b5Text(tip.d).name }}{{ t(`b5.band.${tip.band}`) }}：</b>{{ tip.text }}</li>
          </ul>
          <p v-else>{{ t('b5.getAlongNone') }}</p>
        </section>
        <section v-if="show.method" class="sec flow">
          <h2><span class="num">5</span>{{ t('report.methodAndLimits') }}</h2>
          <p>{{ t('b5.methodText') }}</p>
          <ul>
            <li v-for="d in B5_DOMAINS" :key="d">
              {{ t('b5.methodLine', { dim: b5Text(d).name, mean: fmt(b5.result.domains[d].mean), se: fmt(b5.result.domains[d].se), n: b5.result.domains[d].answered, total: b5.result.domains[d].total }) }}
            </li>
          </ul>
          <h4>{{ t('b5.limitations') }}</h4>
          <ul><li v-for="l in b5Limitations" :key="l">{{ l }}</li></ul>
        </section>
        <section v-if="show.answers" class="sec flow appendix" data-testid="report-answers">
          <h2><span class="num">A</span>{{ t('report.answers') }}</h2>
          <table class="grid answers">
            <tbody>
              <tr v-for="row in b5Answers" :key="row.n">
                <td class="c">{{ row.n }}</td>
                <td>{{ row.text }}</td>
                <td class="nowrap">{{ row.answer }}</td>
              </tr>
            </tbody>
          </table>
        </section>
        <section class="sec appendix source" data-testid="report-source">
          <h2><span class="num">B</span>{{ t('b5.about') }}</h2>
          <p><b>{{ t('wb.source') }}：</b>{{ localize(b5Bank.source, locale) }}</p>
          <p><b>{{ t('wb.license') }}：</b>{{ localize(b5Bank.licenseNote, locale) }}</p>
          <p><b>{{ t('wb.translation') }}：</b>{{ localize(b5Bank.translationNote, locale) }}</p>
          <p v-if="b5.result.facets && b5Adapted">{{ t('b5.adaptedNote', { list: b5Adapted }) }}</p>
          <ul><li v-for="c in b5Bank.citations" :key="c">{{ c }}</li></ul>
        </section>
      </template>

      <!-- ═════ wellbeing ═════ -->
      <template v-else-if="wb && sr && scale">
        <section class="sec keep">
          <h2><span class="num">1</span>{{ t('report.summary') }}</h2>
          <div class="score-row">
            <div class="score" data-testid="report-score">{{ sr.score }}<span class="of"> / {{ sr.maxScore }}</span></div>
            <div v-if="band" class="band" :style="{ '--c': LEVEL_COLORS[band.level] }" data-testid="report-band">{{ localize(band.label, locale) }}</div>
          </div>
          <div class="ms-subtle">
            {{ scale.scoring.higherIsBetter ? t('wb.higherBetter') : t('wb.higherWorse') }}
            <template v-if="scale.scoring.multiplier !== 1"> · {{ t('wb.rawScore', { raw: sr.raw, max: rawMax }) }}</template>
          </div>
          <ScoreBar v-if="sr.score !== null" :bands="scale.scoring.bands" :min="range[0]" :max="range[1]" :score="sr.score" />
          <p v-if="band" class="lead">{{ localize(band.summary, locale) }}</p>
          <p v-if="scale.status === 'experimental'" class="note">{{ t('report.experimentalScale') }}</p>
        </section>

        <!-- Always printed when relevant: never hidden by a toggle. -->
        <SafetyCard v-if="sr.safetyItems.length" class="sec-gap" />
        <section v-else-if="sr.band?.seekHelp" class="sec help" data-testid="report-seek-help">
          <h3>{{ t('wb.seekHelpTitle') }}</h3>
          <p>{{ t('wb.seekHelpText') }}</p>
        </section>

        <section v-if="show.suggestions && band?.suggestions.length" class="sec">
          <h2><span class="num">2</span>{{ t('wb.suggestions') }}</h2>
          <ul><li v-for="(s, i) in band.suggestions" :key="i">{{ localize(s, locale) }}</li></ul>
        </section>

        <section v-if="show.trend" class="sec keep">
          <h2><span class="num">3</span>{{ t('wb.trend') }}</h2>
          <p class="ms-subtle">{{ t('wb.trendHint') }}</p>
          <ScaleTrendChart
            v-if="wbHistory.length >= 2"
            :results="wbHistory"
            :bands="scale.scoring.bands"
            :min="range[0]"
            :max="range[1]"
            :height="230"
          />
          <table class="grid">
            <thead>
              <tr>
                <th>{{ t('detail.colDate') }}</th>
                <th>{{ t('wb.colScore') }}</th>
                <th>{{ t('wb.colBand') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="h in [...wbHistory].reverse()" :key="h.id" :class="{ current: h.id === wb.id }">
                <td>{{ formatDate(h.createdAt, true) }}</td>
                <td>{{ h.result.score }} / {{ h.result.maxScore }}</td>
                <td>{{ bandLabel(h.result.band?.key) }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="scale.scoring.meaningfulChange && wbHistory.length >= 2" class="ms-subtle">{{ t('wb.meaningfulChange', { n: scale.scoring.meaningfulChange }) }}</p>
        </section>

        <section class="sec">
          <h2><span class="num">4</span>{{ t('wb.limitations') }}</h2>
          <ul><li v-for="l in wbLimitations" :key="l">{{ l }}</li></ul>
        </section>

        <section v-if="show.answers" class="sec flow appendix" data-testid="report-answers">
          <h2><span class="num">A</span>{{ t('report.answers') }}</h2>
          <table class="grid answers">
            <tbody>
              <tr v-for="row in wbAnswers" :key="row.n">
                <td class="c">{{ row.n }}</td>
                <td>{{ row.text }}</td>
                <td class="nowrap">{{ row.answer }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="sec appendix source" data-testid="report-source">
          <h2><span class="num">B</span>{{ t('wb.about') }}</h2>
          <p>{{ localize(scale.description, locale) }}</p>
          <p><b>{{ t('wb.source') }}：</b>{{ localize(scale.source, locale) }}</p>
          <p><b>{{ t('wb.license') }}：</b>{{ localize(scale.licenseNote, locale) }}</p>
          <p><b>{{ t('wb.citation') }}：</b>{{ scale.citation }}</p>
          <p v-if="scale.translationNote && locale === 'zh-CN'"><b>{{ t('wb.translation') }}：</b>{{ localize(scale.translationNote, locale) }}</p>
        </section>
      </template>

      <!-- ═════ AI note ═════ -->
      <section v-if="isAi && aiNote" class="sec flow" data-testid="report-ai">
        <AiNoteView
          :task="aiNote.task"
          :content="aiNote.content"
          :basis="aiNote.basis.lines"
          :model="aiNote.model"
          :created-at="formatDate(aiNote.createdAt, true)"
          :safety="aiNote.safety"
        />
      </section>

      <!-- closing statement -->
      <footer class="closing">
        <p><b>{{ t('report.disclaimerTitle') }}</b>{{ isMbti ? t('report.disclaimerMbti') : isAi ? t('report.disclaimerAi') : isB5 ? t('report.disclaimerB5') : t('report.disclaimerWb') }}</p>
        <p class="ms-subtle">{{ isAi ? t('report.aiOrigin', { model: aiNote?.model ?? '', version: APP_VERSION }) : t('report.offline', { version: APP_VERSION }) }}</p>
      </footer>
    </article>
  </div>
</template>

<style scoped>
.report-root {
  min-height: 100vh;
  background: var(--ms-bg);
  padding-bottom: 40px;
}
.toolbar {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px 16px;
  padding: 10px 16px;
  background: var(--ms-surface);
  border-bottom: 1px solid var(--ms-border);
}
.toolbar a {
  text-decoration: none;
}
.toggles {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 14px;
  flex: 1;
}
.export {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.center {
  display: flex;
  justify-content: center;
  padding: 60px;
}

/* The sheet: A4 width on screen so the preview matches the PDF. */
.paper {
  width: min(210mm, calc(100% - 24px));
  margin: 20px auto 0;
  padding: 16mm 14mm;
  background: #fff;
  color: #1a1f24;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
  border-radius: 4px;
  font-size: 10.5pt;
  line-height: 1.65;
  /* Charts read these tokens; keep the sheet light even in dark mode. */
  --ms-surface: #fff;
  --ms-surface-2: #f2f5f6;
  --ms-text: #1a1f24;
  --ms-text-2: #3a434b;
  --ms-text-3: #6b757e;
  --ms-border: #d6dde2;
}
.letterhead {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  padding-bottom: 10px;
  border-bottom: 2.5px solid #2ba88f;
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
}
.brand-name {
  font-size: 15pt;
  font-weight: 800;
  letter-spacing: 0.02em;
}
.brand-sub {
  font-size: 8.5pt;
  color: var(--ms-text-3);
}
.doc-title {
  text-align: right;
}
.doc-title h1 {
  font-size: 17pt;
  margin: 0;
  line-height: 1.3;
}
.report-no {
  font-size: 8.5pt;
  color: var(--ms-text-3);
  font-variant-numeric: tabular-nums;
}
.info,
.kv {
  width: 100%;
  border-collapse: collapse;
  margin: 12px 0 4px;
  font-size: 9.5pt;
}
.info th,
.kv th {
  text-align: left;
  font-weight: 500;
  color: var(--ms-text-3);
  white-space: nowrap;
  width: 1%;
  padding: 4px 10px 4px 0;
}
.info td,
.kv td {
  padding: 4px 18px 4px 0;
}
.info {
  background: #f4f8f8;
  border-radius: 4px;
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}
.info th:first-child,
.info td:first-child {
  padding-left: 10px;
}
.demo {
  margin-left: 8px;
  font-size: 8pt;
  padding: 1px 6px;
  border-radius: 3px;
  background: #fff1d6;
  color: #8a5300;
}
.sec {
  margin-top: 18px;
}
.sec-gap {
  margin-top: 16px;
}
.sec h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5pt;
  margin: 0 0 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--ms-border);
}
.num {
  display: inline-grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #2ba88f;
  color: #fff;
  font-size: 9pt;
  font-weight: 700;
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}
.appendix .num {
  background: #6b757e;
}
.sec p {
  margin: 4px 0;
}
.sec ul {
  margin: 4px 0;
  padding-left: 20px;
}
.sec li {
  margin: 2px 0;
}
.lead {
  font-size: 11pt;
}
.note {
  font-size: 9pt;
  color: #8a5300;
}
.type-row {
  display: flex;
  align-items: center;
  gap: 20px;
  margin: 6px 0;
}
.type-code {
  font-size: 34pt;
  font-weight: 900;
  letter-spacing: 0.08em;
  line-height: 1;
  background: linear-gradient(120deg, #2ba88f, #5b4fe0);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}
.type-code .x {
  -webkit-text-fill-color: #8a949c;
}
.type-title {
  font-size: 14pt;
  font-weight: 800;
}
.radar {
  max-width: 120mm;
  margin: 0 auto;
}
.grid {
  width: 100%;
  border-collapse: collapse;
  font-size: 9pt;
  margin: 6px 0;
}
.grid th {
  text-align: left;
  white-space: nowrap;
  font-weight: 500;
  color: var(--ms-text-3);
  border-bottom: 1px solid var(--ms-border);
  padding: 4px 6px;
}
.grid td {
  border-bottom: 1px solid #eef1f3;
  padding: 4px 6px;
  vertical-align: top;
}
.grid tr {
  break-inside: avoid;
}
.grid .current td {
  font-weight: 700;
}
.c {
  text-align: center;
  width: 1%;
  white-space: nowrap;
}
.nowrap {
  white-space: nowrap;
}
.small {
  color: var(--ms-text-2);
}
.answers td:last-child {
  width: 1%;
}
.stack {
  font-size: 9.5pt;
}
.profile h3 {
  font-size: 11pt;
  margin: 14px 0 4px;
}
.profile h4,
.sec h4 {
  font-size: 10pt;
  color: #1f8a75;
  margin: 10px 0 2px;
  break-after: avoid;
}
.cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.sub {
  font-weight: 600;
}
.sub.ok {
  color: #1f8a75;
}
.sub.no {
  color: #b45309;
}
.score-row {
  display: flex;
  align-items: baseline;
  gap: 14px;
}
.score {
  font-size: 30pt;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.of {
  font-size: 11pt;
  color: var(--ms-text-3);
  font-weight: 500;
}
.band {
  padding: 2px 12px;
  border-radius: 999px;
  font-weight: 700;
  color: var(--c);
  background: color-mix(in srgb, var(--c) 14%, transparent);
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}
.help {
  border: 1px solid #c9dcea;
  background: #f3f8fc;
  border-radius: 6px;
  padding: 10px 14px;
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}
.help h3 {
  font-size: 10.5pt;
  margin: 0 0 4px;
}
.source {
  font-size: 9pt;
}
.closing {
  margin-top: 22px;
  padding-top: 10px;
  border-top: 1px solid var(--ms-border);
  font-size: 8.5pt;
  color: var(--ms-text-2);
  break-inside: avoid;
}
.closing p {
  margin: 3px 0;
}
.closing .ms-subtle {
  font-size: inherit;
}

@media (max-width: 640px) {
  .paper {
    padding: 18px 14px;
  }
  .letterhead {
    flex-direction: column;
    align-items: flex-start;
  }
  .doc-title {
    text-align: left;
  }
  .cols {
    grid-template-columns: 1fr;
  }
}

@media print {
  .report-root {
    background: #fff;
    padding: 0;
    min-height: 0;
  }
  .paper {
    width: auto;
    margin: 0;
    padding: 0;
    box-shadow: none;
    border-radius: 0;
  }
  .keep {
    break-inside: avoid;
  }
  .flow {
    break-inside: auto;
  }
}
</style>

<!-- Page numbers in the page margin. Named pages keep this off every other printout. -->
<style>
.pages-zh .paper {
  page: report-zh;
}
.pages-en .paper {
  page: report-en;
}
@page report-zh {
  size: A4;
  margin: 15mm 14mm 16mm;
  @bottom-left {
    content: 'MindScope 自评报告 · 仅供自我了解，不能替代专业诊断';
    font-size: 7.5pt;
    color: #8a949c;
  }
  @bottom-right {
    content: '第 ' counter(page) ' 页 / 共 ' counter(pages) ' 页';
    font-size: 7.5pt;
    color: #8a949c;
  }
}
@page report-en {
  size: A4;
  margin: 15mm 14mm 16mm;
  @bottom-left {
    content: 'MindScope self-assessment report · for self-understanding only, not a diagnosis';
    font-size: 7.5pt;
    color: #8a949c;
  }
  @bottom-right {
    content: 'Page ' counter(page) ' of ' counter(pages);
    font-size: 7.5pt;
    color: #8a949c;
  }
}
</style>
