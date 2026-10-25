<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { onBeforeRouteLeave, useRouter } from 'vue-router';
import { NButton, NSpin, NSwitch, useDialog, useMessage } from 'naive-ui';
import { FIRST_POLE, SECOND_POLE, isDimension, localize, type CogFunction } from '@mindscope/core';
import { functionTexts, pick } from '@mindscope/banks';
import { useTestSession } from '../composables/useTestSession';
import { useAppStore } from '../stores/app';
import LikertScale from '../components/test/LikertScale.vue';
import ProgressPanel from '../components/test/ProgressPanel.vue';
import TestTimer from '../components/test/TestTimer.vue';
import AppIcon from '../components/AppIcon.vue';

const props = defineProps<{ id: string }>();
const { t, locale } = useI18n();
const router = useRouter();
const dialog = useDialog();
const message = useMessage();
const app = useAppStore();
const ts = useTestSession();

const reviewing = ref(false);
const autoAdvance = ref(true);
const profileName = ref('');
let advanceTimer: ReturnType<typeof setTimeout> | null = null;

onMounted(async () => {
  // Listen first: the question can appear before the rest of the page has loaded.
  window.addEventListener('keydown', onKey);
  autoAdvance.value = await app.r().settings.get('test.autoAdvance', true);
  await ts.load(props.id);
  if (ts.session.value) profileName.value = (await app.r().profiles.get(ts.session.value.profileId))?.name ?? '';
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
  if (advanceTimer) clearTimeout(advanceTimer);
});
onBeforeRouteLeave(async () => {
  await ts.persistTime();
  if (ts.session.value?.status === 'in_progress') message.success(t('test.saved'));
});

watch(autoAdvance, (v) => app.r().settings.set('test.autoAdvance', v));

const labels = computed(() => {
  const b = ts.bank.value;
  const item = ts.currentItem.value;
  if (!b || !item) return [];
  const sc = b.scales[item.scale]!;
  return sc.labels[locale.value] ?? sc.labels['zh-CN'] ?? [];
});
const questionText = computed(() => (ts.currentItem.value ? localize(ts.currentItem.value.text, locale.value) : ''));
const percent = computed(() => (ts.total.value ? Math.round((ts.answeredCount.value / ts.total.value) * 100) : 0));

function targetLabel(target: string) {
  if (target === 'total') return '';
  if (isDimension(target)) return `${FIRST_POLE[target]} / ${SECOND_POLE[target]}`;
  return `${target} ${pick(functionTexts[target as CogFunction], locale.value)?.name ?? ''}`;
}
const reasonText = computed(() => {
  const e = ts.current.value;
  if (!e) return '';
  // Big Five: do not show which trait a question measures (it could steer answers).
  if (ts.kind.value === 'bigfive') return t('b5.testChip');
  const label = targetLabel(e.target);
  return t(`test.reason.${e.reason}`, { dim: label, fn: label, target: label });
});
const isFlagged = computed(() => !!ts.current.value && ts.flags.value.has(ts.current.value.itemId));

let choosing = false;
async function choose(v: number) {
  // While saving or auto-advancing, a quick second press must not overwrite the answer just given.
  if (choosing || advanceTimer) return;
  choosing = true;
  try {
    const wasUnanswered = ts.currentAnswer.value == null;
    await ts.answer(v);
    if (autoAdvance.value && wasUnanswered) {
      advanceTimer = setTimeout(async () => {
        try {
          await goNext();
        } finally {
          advanceTimer = null;
        }
      }, 260);
    }
  } finally {
    choosing = false;
  }
}

async function goNext() {
  const r = await ts.next();
  if (r === 'review') reviewing.value = true;
}

async function jumpTo(i: number) {
  reviewing.value = false;
  await ts.jump(i);
}

function onKey(e: KeyboardEvent) {
  if (reviewing.value || !ts.session.value || ts.loadError.value) return;
  const el = e.target as HTMLElement | null;
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
  if (/^[1-9]$/.test(e.key) && Number(e.key) <= labels.value.length) {
    e.preventDefault();
    void choose(Number(e.key));
  } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
    e.preventDefault();
    void goNext();
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    void ts.prev();
  } else if (e.key.toLowerCase() === 'f') {
    void ts.toggleFlag();
  }
}

const reviewRows = computed(() =>
  ts.sequence.value.map((e, i) => {
    const item = ts.itemById.value.get(e.itemId);
    const v = ts.answers.value[e.itemId];
    const scale = item && ts.bank.value?.scales[item.scale];
    const lbls = scale ? (scale.labels[locale.value] ?? scale.labels['zh-CN']) : [];
    return {
      i,
      text: item ? localize(item.text, locale.value) : e.itemId,
      answer: v != null ? `${v} · ${lbls?.[v - 1] ?? ''}` : null,
      flagged: ts.flags.value.has(e.itemId),
    };
  }),
);
const unansweredCount = computed(() => reviewRows.value.filter((r) => !r.answer).length);
const flaggedCount = computed(() => reviewRows.value.filter((r) => r.flagged).length);

function confirmSubmit() {
  dialog.info({
    title: t('test.submit'),
    content: unansweredCount.value ? t('test.submitWithMissing', { n: unansweredCount.value }) : t('test.submitConfirm'),
    positiveText: t('test.submit'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      try {
        const resultId = await ts.submit();
        await router.replace(ts.resultPath(resultId));
      } catch (err) {
        if (err instanceof Error && err.message === 'B5_INCOMPLETE') message.warning(t('b5.incomplete'), { duration: 6000 });
        else message.error(t('common.failed', { msg: err instanceof Error ? err.message : String(err) }));
      }
    },
  });
}

async function openExistingResult() {
  const s = ts.session.value;
  if (!s) return;
  const r = app.r().bigfive.isBigFiveVersion(s.versionId) ? await app.r().bigfive.bySession(s.id) : await app.r().results.bySession(s.id);
  if (r) await router.replace(app.r().bigfive.isBigFiveVersion(s.versionId) ? `/b5/${r.id}` : `/results/${r.id}`);
}
</script>

<template>
  <div class="ms-page test-page">
    <!-- not found / already submitted -->
    <div v-if="ts.loadError.value" class="ms-card state">
      <p>{{ ts.loadError.value === 'done' ? t('test.alreadyDone') : t('test.notFound') }}</p>
      <n-button v-if="ts.loadError.value === 'done'" type="primary" @click="openExistingResult">{{ t('test.viewResult') }}</n-button>
      <router-link v-else to="/assess"><n-button>{{ t('nav.assess') }}</n-button></router-link>
    </div>

    <n-spin v-else-if="!ts.session.value || !ts.currentItem.value" class="state" />

    <!-- review -->
    <section v-else-if="reviewing" class="review ms-card">
      <h1 class="ms-page-title">{{ t('test.reviewTitle') }}</h1>
      <p class="ms-muted">{{ t('test.reviewHint', { name: profileName }) }}</p>
      <div class="review-stats">
        <span :class="{ warn: unansweredCount }">{{ t('test.unansweredCount', { n: unansweredCount }) }}</span>
        <span>{{ t('test.flaggedCount', { n: flaggedCount }) }}</span>
      </div>
      <ol class="review-list">
        <li v-for="r in reviewRows" :key="r.i" :class="{ flagged: r.flagged, missing: !r.answer }" @click="jumpTo(r.i)">
          <span class="rn">{{ r.i + 1 }}</span>
          <span class="rt">{{ r.text }}</span>
          <span class="ra">{{ r.answer ?? t('test.unanswered') }}</span>
        </li>
      </ol>
      <div class="review-actions">
        <n-button @click="reviewing = false">{{ t('test.backToEdit') }}</n-button>
        <n-button type="primary" size="large" :loading="ts.busy.value" data-testid="submit-test" @click="confirmSubmit">{{ t('test.submit') }}</n-button>
      </div>
    </section>

    <!-- answering -->
    <div v-else class="grid">
      <section class="main ms-card">
        <div class="progress-row">
          <span class="q-of" data-testid="question-of">{{ t('test.questionOf', { n: ts.index.value + 1, total: ts.total.value }) }}</span>
          <span class="q-pct">{{ t('test.complete', { p: percent }) }}</span>
        </div>
        <div class="bar"><span :style="{ width: `${percent}%` }" /></div>
        <div class="pill">{{ reasonText }}</div>

        <h2 class="question" data-testid="question-text">{{ questionText }}</h2>

        <LikertScale :value="ts.currentAnswer.value" :labels="labels" :disabled="ts.busy.value" @select="choose" />

        <div class="actions">
          <n-button :disabled="ts.index.value === 0" @click="ts.prev()">
            <template #icon><AppIcon name="chevronRight" :size="16" style="transform: rotate(180deg)" /></template>
            {{ t('test.prev') }}
          </n-button>
          <n-button quaternary :type="isFlagged ? 'warning' : 'default'" @click="ts.toggleFlag()">
            {{ isFlagged ? t('test.unflag') : t('test.flag') }}
          </n-button>
          <n-button type="primary" :loading="ts.busy.value" data-testid="next" @click="goNext">
            {{ ts.isLast.value ? t('test.finish') : t('test.next') }}
          </n-button>
        </div>

        <div class="foot ms-subtle">
          <label class="auto"><n-switch v-model:value="autoAdvance" size="small" /> {{ t('test.autoAdvance') }}</label>
          <span class="keys">{{ t('test.keyboardHint') }}</span>
        </div>
      </section>

      <aside class="side">
        <ProgressPanel
          :total="ts.total.value"
          :sequence="ts.sequence.value"
          :answers="ts.answers.value"
          :flags="ts.flags.value"
          :index="ts.index.value"
          @jump="jumpTo"
          @review="reviewing = true"
        />
        <TestTimer :total-ms="ts.totalMs.value" :current-ms="ts.currentMs.value" />
        <router-link to="/assess" class="pause">
          <n-button block>{{ t('test.pause') }}</n-button>
        </router-link>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.test-page {
  max-width: 1240px;
}
.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px;
  text-align: center;
}
.grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 20px;
  align-items: start;
}
.main {
  padding: 28px 30px;
}
.progress-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
}
.q-of {
  font-weight: 600;
  color: var(--ms-text-2);
}
.q-pct {
  font-weight: 700;
  color: var(--ms-brand);
}
.bar {
  height: 8px;
  border-radius: 999px;
  background: var(--ms-surface-2);
  overflow: hidden;
  margin-bottom: 18px;
}
.bar span {
  display: block;
  height: 100%;
  background: var(--ms-gradient);
  transition: width 0.3s ease;
}
.pill {
  display: inline-block;
  padding: 6px 14px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ms-brand) 12%, transparent);
  color: var(--ms-brand);
  font-size: 0.85rem;
  font-weight: 600;
}
.question {
  font-size: clamp(1.2rem, 2.2vw, 1.55rem);
  font-weight: 700;
  line-height: 1.45;
  margin: 26px 0 26px;
  min-height: 3em;
}
.actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-top: 22px;
}
.foot {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--ms-border);
}
.auto {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.side {
  position: sticky;
  top: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.pause {
  text-decoration: none;
}
.review {
  max-width: 900px;
  margin: 0 auto;
}
.review-stats {
  display: flex;
  gap: 16px;
  margin: 10px 0 14px;
  font-weight: 600;
  color: var(--ms-text-2);
}
.review-stats .warn {
  color: #c2410c;
}
.review-list {
  list-style: none;
  padding: 0;
  margin: 0;
  max-height: 58vh;
  overflow-y: auto;
  border-top: 1px solid var(--ms-border);
}
.review-list li {
  display: grid;
  grid-template-columns: 40px 1fr minmax(120px, auto);
  gap: 12px;
  padding: 10px 6px;
  border-bottom: 1px solid var(--ms-border);
  cursor: pointer;
  align-items: baseline;
}
.review-list li:hover {
  background: var(--ms-surface-2);
}
.review-list li.flagged .rn {
  color: #e09a3e;
  font-weight: 800;
}
.review-list li.missing .ra {
  color: #c2410c;
}
.rn {
  color: var(--ms-text-3);
  font-variant-numeric: tabular-nums;
}
.ra {
  color: var(--ms-brand);
  font-weight: 600;
  text-align: right;
}
.review-actions {
  display: flex;
  justify-content: space-between;
  margin-top: 18px;
}
@media (max-width: 1000px) {
  .grid {
    grid-template-columns: 1fr;
  }
  .side {
    position: static;
  }
}
@media (max-width: 640px) {
  .main {
    padding: 18px 16px;
  }
  .keys {
    display: none;
  }
  .review-list li {
    grid-template-columns: 32px 1fr;
  }
  .ra {
    grid-column: 2;
    text-align: left;
  }
}
</style>
