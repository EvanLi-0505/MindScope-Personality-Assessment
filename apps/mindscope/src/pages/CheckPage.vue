<script setup lang="ts">
/**
 * Wellbeing check-in: the whole questionnaire on one page (as the scales are
 * printed), every answer saved immediately. Safety items show crisis
 * resources the moment they are answered above zero.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { onBeforeRouteLeave, useRouter } from 'vue-router';
import { NAlert, NButton, NSpin, useDialog, useMessage } from 'naive-ui';
import { localize, scoreScale } from '@mindscope/core';
import type { StoredScale, TestSession } from '@mindscope/storage';
import { useAppStore } from '../stores/app';
import SafetyCard from '../components/wellbeing/SafetyCard.vue';

const props = defineProps<{ id: string }>();
const { t, locale } = useI18n();
const router = useRouter();
const dialog = useDialog();
const message = useMessage();
const app = useAppStore();

const session = ref<TestSession | null>(null);
const scale = ref<StoredScale | null>(null);
const answers = ref<Record<string, number | null>>({});
const profileName = ref('');
const state = ref<'loading' | 'ready' | 'missing' | 'done'>('loading');
const busy = ref(false);

// Time on the page (visible time only), saved on submit or when leaving.
let visibleSince = performance.now();
let unsaved = 0;
let lastAnswerAt = performance.now();
function takeElapsed() {
  if (document.visibilityState === 'visible') unsaved += performance.now() - visibleSince;
  visibleSince = performance.now();
  const ms = unsaved;
  unsaved = 0;
  return ms;
}
const onVisibility = () => {
  if (document.visibilityState === 'hidden') unsaved += performance.now() - visibleSince;
  visibleSince = performance.now();
};
async function persistElapsed() {
  const ms = takeElapsed();
  if (session.value?.status === 'in_progress' && ms > 0) await app.r().sessions.addElapsed(session.value.id, ms);
}

onMounted(async () => {
  document.addEventListener('visibilitychange', onVisibility);
  const s = await app.r().sessions.get(props.id);
  if (!s) {
    state.value = 'missing';
    return;
  }
  session.value = s;
  if (s.status !== 'in_progress') {
    state.value = 'done';
    return;
  }
  scale.value = await app.r().scales.load(s.versionId);
  const stored = await app.r().sessions.answers(s.id);
  answers.value = Object.fromEntries(Object.entries(stored).map(([k, v]) => [k, v.value]));
  profileName.value = (await app.r().profiles.get(s.profileId))?.name ?? '';
  state.value = 'ready';
});
onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVisibility));
onBeforeRouteLeave(async () => {
  await persistElapsed();
});

const answeredCount = computed(() => scale.value?.items.filter((i) => answers.value[i.id] != null).length ?? 0);
const total = computed(() => scale.value?.items.length ?? 0);
const safetyIds = computed(() => new Set(scale.value?.scoring.safety?.itemIds ?? []));
const showSafety = (itemId: string) => {
  const s = scale.value?.scoring.safety;
  const v = answers.value[itemId];
  return !!s && safetyIds.value.has(itemId) && v != null && v >= s.minValue;
};

async function choose(itemId: string, value: number) {
  if (!session.value || busy.value) return;
  answers.value = { ...answers.value, [itemId]: value };
  const now = performance.now();
  const ms = now - lastAnswerAt;
  lastAnswerAt = now;
  await app.r().sessions.saveAnswer(session.value.id, itemId, value, ms);
}

function submit() {
  if (answeredCount.value < total.value) {
    message.warning(t('check.needAll'));
    const first = scale.value!.items.find((i) => answers.value[i.id] == null);
    if (first) document.getElementById(`q-${first.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  dialog.info({
    title: t('check.submit'),
    content: t('check.submitConfirm'),
    positiveText: t('check.submit'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      busy.value = true;
      try {
        const s = session.value!;
        await persistElapsed();
        const fresh = await app.r().sessions.get(s.id);
        const result = scoreScale(scale.value!, answers.value);
        const id = await app.r().scales.complete(s.id, result, {
          instrument: scale.value!.instrument,
          versionId: s.versionId,
          elapsedMs: fresh?.elapsedMs ?? 0,
        });
        app.p().log('info', `check-in completed (${scale.value!.instrument})`);
        await router.replace(`/wellbeing/${id}`);
      } catch (err) {
        message.error(t('common.failed', { msg: err instanceof Error ? err.message : String(err) }));
      } finally {
        busy.value = false;
      }
    },
  });
}

async function openExisting() {
  const r = (await app.r().scales.list({ profileIds: [session.value!.profileId] })).find((x) => x.sessionId === session.value!.id);
  if (r) await router.replace(`/wellbeing/${r.id}`);
}
</script>

<template>
  <div class="ms-page check-page">
    <n-spin v-if="state === 'loading'" />
    <div v-else-if="state !== 'ready'" class="ms-card state">
      <p>{{ state === 'done' ? t('check.alreadyDone') : t('check.notFound') }}</p>
      <n-button v-if="state === 'done'" type="primary" @click="openExisting">{{ t('check.viewResult') }}</n-button>
    </div>

    <template v-else-if="scale">
      <section class="ms-card head">
        <span class="chip" :class="scale.status">{{ scale.status === 'published' ? t('check.validated') : t('check.experimental') }}</span>
        <h1 class="ms-page-title" data-testid="check-title">{{ localize(scale.title, locale) }}</h1>
        <p class="ms-subtle">{{ t('check.forPerson', { name: profileName }) }}</p>
        <p class="instructions">{{ localize(scale.instructions, locale) }}</p>
        <n-alert type="info" :show-icon="false" class="note">{{ t('check.notDiagnosis') }}</n-alert>
      </section>

      <ol class="items">
        <li v-for="(item, i) in scale.items" :id="`q-${item.id}`" :key="item.id" class="ms-card item" :class="{ answered: answers[item.id] != null }" data-testid="check-item">
          <div class="q"><span class="n">{{ i + 1 }}</span>{{ localize(item.text, locale) }}</div>
          <div class="opts" role="radiogroup">
            <button
              v-for="o in scale.options"
              :key="o.value"
              type="button"
              role="radio"
              class="opt"
              :class="{ on: answers[item.id] === o.value }"
              :aria-checked="answers[item.id] === o.value"
              :data-testid="`opt-${item.id}-${o.value}`"
              @click="choose(item.id, o.value)"
            >
              <span class="v">{{ o.value }}</span>
              <span class="l">{{ localize(o.label, locale) }}</span>
            </button>
          </div>
          <SafetyCard v-if="showSafety(item.id)" class="inline-safety" />
        </li>
      </ol>

      <div class="footer">
        <div class="progress">
          <span data-testid="check-progress">{{ t('check.answered', { answered: answeredCount, total }) }}</span>
          <div class="bar"><span :style="{ width: `${(answeredCount / total) * 100}%` }" /></div>
        </div>
        <router-link to="/assess"><n-button quaternary>{{ t('check.pause') }}</n-button></router-link>
        <n-button type="primary" :loading="busy" data-testid="check-submit" @click="submit">{{ t('check.submit') }}</n-button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.check-page {
  max-width: 880px;
}
.state {
  text-align: center;
  padding: 40px;
}
.chip {
  display: inline-block;
  font-size: 0.75rem;
  padding: 2px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ms-brand) 12%, transparent);
  color: var(--ms-brand);
  margin-bottom: 8px;
}
.chip.experimental {
  background: color-mix(in srgb, #e09a3e 18%, transparent);
  color: #9a5d12;
}
.instructions {
  font-size: 1.05rem;
  font-weight: 600;
  margin: 14px 0 10px;
}
.note {
  margin-top: 6px;
}
.items {
  list-style: none;
  padding: 0;
  margin: 16px 0 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.item {
  padding: 16px 18px;
  border-left: 4px solid transparent;
}
.item.answered {
  border-left-color: var(--ms-brand);
}
.q {
  font-weight: 600;
  font-size: 1.02rem;
  line-height: 1.6;
  margin-bottom: 12px;
}
.n {
  display: inline-flex;
  justify-content: center;
  min-width: 26px;
  margin-right: 8px;
  color: var(--ms-text-3);
}
.opts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 8px;
}
.opt {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 6px;
  border-radius: var(--ms-radius-sm);
  border: 1.5px solid var(--ms-border);
  background: var(--ms-surface);
  color: var(--ms-text-2);
  font: inherit;
  cursor: pointer;
  transition: border-color 0.12s, background 0.12s;
}
.opt:hover {
  border-color: var(--ms-text-3);
}
.opt.on {
  border-color: var(--ms-brand);
  background: color-mix(in srgb, var(--ms-brand) 12%, var(--ms-surface));
  color: var(--ms-brand);
  font-weight: 600;
}
.opt .v {
  font-size: 0.75rem;
  opacity: 0.7;
}
.opt .l {
  font-size: 0.85rem;
  text-align: center;
}
.inline-safety {
  margin-top: 12px;
}
.footer {
  position: sticky;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
  padding: 12px 16px;
  background: var(--ms-surface);
  border: 1px solid var(--ms-border);
  border-radius: var(--ms-radius);
  box-shadow: var(--ms-shadow);
}
.footer a {
  text-decoration: none;
}
.progress {
  flex: 1;
  font-size: 0.85rem;
  color: var(--ms-text-2);
}
.bar {
  height: 6px;
  border-radius: 999px;
  background: var(--ms-surface-2);
  overflow: hidden;
  margin-top: 4px;
}
.bar span {
  display: block;
  height: 100%;
  background: var(--ms-gradient);
  transition: width 0.2s;
}
@media (max-width: 640px) {
  .opts {
    grid-template-columns: 1fr;
  }
  .opt {
    flex-direction: row;
    gap: 10px;
    padding: 10px 12px;
  }
}
</style>
