<script setup lang="ts">
/**
 * AI analysis on the person card. Every request starts from a click, shows
 * exactly what will be sent, and needs a second click to send.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { NAlert, NButton, NCheckbox, NModal, useDialog, useMessage } from 'naive-ui';
import {
  AI_PROMPT_VERSION,
  TASK_CATEGORIES,
  ageRange,
  buildAiRequest,
  localize,
  toPersonalityPoint,
  type AiCategory,
  type AiInput,
  type AiTaskId,
  type Profile,
} from '@mindscope/core';
import type { AiNote, GrowthNote, ResultWithProfile, StoredScale, StoredScaleResult } from '@mindscope/storage';
import { useAppStore } from '../../stores/app';
import { formatBytes, formatDate } from '../../i18n';
import { hostOf } from '../../ai/config';
import { newRequestId, useAiConfig } from '../../ai/useAiConfig';
import { aiErrorText } from '../../ai/errors';
import { AiCallError, type AiKeyStatus } from '../../platform';
import AiNoteView from './AiNoteView.vue';
import AppIcon from '../AppIcon.vue';

const props = defineProps<{ profile: Profile; results: ResultWithProfile[]; growth: GrowthNote[] }>();
const { t, locale } = useI18n();
const app = useAppStore();
const dialog = useDialog();
const message = useMessage();
const bridge = app.p().ai;
const { config, load: loadConfig } = useAiConfig();

const keyStatus = ref<AiKeyStatus | null>(null);
const notes = ref<AiNote[]>([]);
const wellbeing = ref<{ r: StoredScaleResult; s: StoredScale }[]>([]);

onMounted(async () => {
  await loadConfig();
  if (bridge) keyStatus.value = await bridge.keyStatus();
  await loadNotes();
  const wb = await app.r().scales.list({ profileIds: [props.profile.id] });
  const scales = new Map<string, StoredScale>();
  for (const r of wb) if (!scales.has(r.versionId)) scales.set(r.versionId, await app.r().scales.load(r.versionId));
  wellbeing.value = wb.map((r) => ({ r, s: scales.get(r.versionId)! }));
});
async function loadNotes() {
  notes.value = await app.r().aiNotes.list(props.profile.id);
}

const hasKey = computed(() => keyStatus.value?.state === 'saved' || keyStatus.value?.state === 'session');
const ready = computed(() => !!bridge && config.value.enabled && hasKey.value);
const aiLocale = computed(() => (locale.value === 'zh-CN' ? 'zh-CN' : 'en') as 'zh-CN' | 'en');

// ── the data, minimised ──
const input = computed<Omit<AiInput, 'task'>>(() => {
  const p = props.profile;
  return {
    locale: aiLocale.value,
    personality: [...props.results].reverse().map((r) => toPersonalityPoint(r.result, r.createdAt, r.mode, r.meta.plannedCount)),
    demographics: {
      ageRange: ageRange(p.birthYear),
      gender: p.gender ? t(`profiles.gender.${p.gender}`) : undefined,
      occupation: p.occupation ?? undefined,
    },
    wellbeing: [...wellbeing.value].reverse().map(({ r, s }) => ({
      date: r.createdAt.slice(0, 10),
      scale: localize(s.shortName, locale.value),
      score: r.result.score ?? 0,
      maxScore: r.result.maxScore,
      band: localize(s.scoring.bands.find((b) => b.key === r.result.band?.key)?.label ?? { 'zh-CN': '' }, locale.value),
      higherIsBetter: s.scoring.higherIsBetter,
      safety: r.result.safetyItems.length > 0,
    })),
    growth: props.growth.map((n) => ({ date: n.date, text: n.text })),
  };
});
const available = computed<Record<AiCategory, boolean>>(() => {
  const d = input.value.demographics ?? {};
  return {
    personality: !!input.value.personality?.length,
    demographics: !!(d.ageRange || d.gender || d.occupation),
    wellbeing: !!input.value.wellbeing?.length,
    growth: !!input.value.growth?.length,
  };
});

// ── confirmation dialog ──
const TASKS: AiTaskId[] = ['history', 'growth', 'advice'];
const task = ref<AiTaskId | null>(null);
const chosen = ref<AiCategory[]>([]);
const showPreview = ref(false);
const plan = computed(() => (task.value ? buildAiRequest({ ...input.value, task: task.value }, chosen.value) : null));
const previewText = computed(() =>
  plan.value ? plan.value.messages.map((m) => `【${m.role === 'system' ? t('ai.send.systemPart') : t('ai.send.userPart')}】\n${m.content}`).join('\n\n') : '',
);
const sizeText = computed(() => formatBytes(new TextEncoder().encode(JSON.stringify(plan.value?.messages ?? [])).length));
const categoriesFor = (tk: AiTaskId) => [...TASK_CATEGORIES[tk].required, ...TASK_CATEGORIES[tk].optional];

function open(tk: AiTaskId) {
  task.value = tk;
  chosen.value = [];
  showPreview.value = false;
}
function toggle(c: AiCategory, on: boolean) {
  chosen.value = on ? [...new Set([...chosen.value, c])] : chosen.value.filter((x) => x !== c);
}
watch(task, (v) => {
  if (!v) showPreview.value = false;
});

// ── running a request ──
const running = ref<{ id: string; task: AiTaskId; content: string; basis: string[]; safety: boolean } | null>(null);
const error = ref<string | null>(null);
let lastSent: { task: AiTaskId; chosen: AiCategory[] } | null = null;

async function send() {
  const p = plan.value;
  const tk = task.value;
  if (!p || !tk || !bridge || p.missing.length) return;
  task.value = null;
  error.value = null;
  lastSent = { task: tk, chosen: [...chosen.value] };
  const id = newRequestId();
  running.value = { id, task: tk, content: '', basis: p.basis, safety: p.safety };
  try {
    const out = await bridge.chat({ requestId: id, messages: p.messages, purpose: tk, categories: p.categories }, (d) => {
      if (running.value?.id === id) running.value.content += d;
    });
    if (out.cancelled) {
      message.info(t('ai.stopped'));
    } else {
      await app.r().aiNotes.add({
        profileId: props.profile.id,
        task: tk,
        model: out.model,
        promptVersion: AI_PROMPT_VERSION,
        categories: p.categories,
        basis: { lines: p.basis },
        safety: p.safety,
        content: out.content,
      });
      await loadNotes();
    }
  } catch (err) {
    error.value = err instanceof AiCallError ? aiErrorText(t, err) : String(err);
  } finally {
    running.value = null;
  }
}

function retry() {
  if (!lastSent) return;
  open(lastSent.task);
  chosen.value = lastSent.chosen;
}

async function stop() {
  if (running.value && bridge) await bridge.cancel(running.value.id);
}
onBeforeUnmount(() => void stop());

function removeNote(n: AiNote) {
  dialog.warning({
    title: t('ai.deleteNote'),
    content: t('ai.deleteNoteConfirm'),
    positiveText: t('common.delete'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      await app.r().aiNotes.remove(n.id);
      await loadNotes();
    },
  });
}
</script>

<template>
  <section class="ms-card ai-section" data-testid="ai-section">
    <div class="head">
      <h2>{{ t('ai.sectionTitle') }}</h2>
      <span class="optional">{{ t('ai.optional') }}</span>
    </div>

    <!-- not available / not set up -->
    <p v-if="!bridge" class="ms-muted" data-testid="ai-unavailable">{{ t('ai.webShort') }}</p>
    <div v-else-if="!ready" class="setup ms-no-print" data-testid="ai-setup">
      <p class="ms-muted">{{ !config.enabled ? t('ai.setupOff') : t('ai.setupNoKey') }}</p>
      <router-link to="/ai"><n-button size="small">{{ t('ai.goSettings') }}</n-button></router-link>
    </div>

    <template v-else>
      <p class="ms-subtle">{{ t('ai.sectionHint', { host: hostOf(config.baseUrl) }) }}</p>
      <div class="tasks ms-no-print">
        <button
          v-for="tk in TASKS"
          :key="tk"
          type="button"
          class="task"
          :disabled="!!running"
          :data-testid="`ai-task-${tk}`"
          @click="open(tk)"
        >
          <b>{{ t(`ai.task.${tk}.name`) }}</b>
          <span class="ms-subtle">{{ t(`ai.task.${tk}.desc`) }}</span>
        </button>
      </div>
    </template>

    <!-- live answer -->
    <div v-if="running" class="live" data-testid="ai-running">
      <AiNoteView :task="running.task" :content="running.content || t('ai.waiting')" :basis="running.basis" :model="config.model" :safety="running.safety" streaming />
      <n-button size="small" class="stop ms-no-print" data-testid="ai-stop" @click="stop">{{ t('ai.stop') }}</n-button>
    </div>

    <n-alert v-if="error" type="error" class="err ms-no-print" closable data-testid="ai-error" @close="error = null">
      <div class="pre">{{ error }}</div>
      <n-button size="small" class="retry" @click="retry">{{ t('ai.retry') }}</n-button>
    </n-alert>

    <!-- saved answers -->
    <div v-for="n in notes" :key="n.id" class="saved">
      <AiNoteView :task="n.task" :content="n.content" :basis="n.basis.lines" :model="n.model" :created-at="formatDate(n.createdAt, true)" :safety="n.safety" />
      <div class="note-actions ms-no-print">
        <router-link :to="`/report/ai/${n.id}`"><n-button size="tiny" secondary>{{ t('ai.printNote') }}</n-button></router-link>
        <n-button size="tiny" quaternary data-testid="ai-note-delete" @click="removeNote(n)"><AppIcon name="trash" :size="15" /></n-button>
      </div>
    </div>

    <!-- send confirmation -->
    <n-modal :show="!!task" preset="card" :title="task ? t('ai.send.title', { task: t(`ai.task.${task}.name`) }) : ''" class="send-modal" style="max-width: 680px" @update:show="(v: boolean) => !v && (task = null)">
      <div v-if="task && plan" data-testid="ai-send-dialog">
        <p class="dest">
          {{ t('ai.send.to') }} <b data-testid="ai-send-host">{{ hostOf(config.baseUrl) }}</b> · {{ config.model }}
        </p>
        <h4>{{ t('ai.send.categories') }}</h4>
        <ul class="cats">
          <li v-for="c in categoriesFor(task)" :key="c">
            <n-checkbox
              :checked="TASK_CATEGORIES[task].required.includes(c) || chosen.includes(c)"
              :disabled="TASK_CATEGORIES[task].required.includes(c) || !available[c]"
              :data-testid="`ai-cat-${c}`"
              @update:checked="(v: boolean) => toggle(c, v)"
            >
              <b>{{ t(`ai.cat.${c}.name`) }}</b>
              <span v-if="TASK_CATEGORIES[task].required.includes(c)" class="tag">{{ t('ai.send.required') }}</span>
              <span v-else-if="!available[c]" class="tag">{{ t('ai.send.noData') }}</span>
            </n-checkbox>
            <div class="ms-subtle desc">{{ t(`ai.cat.${c}.desc`) }}</div>
          </li>
        </ul>
        <n-alert v-if="plan.categories.includes('wellbeing')" type="warning" class="gap">{{ t('ai.send.wellbeingWarning') }}</n-alert>
        <p class="never">{{ t('ai.send.never') }}</p>
        <n-alert v-if="plan.missing.length" type="info" class="gap" data-testid="ai-send-missing">
          {{ t('ai.send.missing', { what: plan.missing.map((m) => t(`ai.cat.${m}.name`)).join('、') }) }}
        </n-alert>
        <details class="preview" :open="showPreview" @toggle="(e: Event) => (showPreview = (e.target as HTMLDetailsElement).open)">
          <summary data-testid="ai-preview-toggle">{{ t('ai.send.preview', { size: sizeText }) }}</summary>
          <pre data-testid="ai-preview">{{ previewText }}</pre>
        </details>
        <div class="send-actions">
          <n-button @click="task = null">{{ t('common.cancel') }}</n-button>
          <n-button type="primary" :disabled="plan.missing.length > 0" data-testid="ai-send" @click="send">{{ t('ai.send.confirm') }}</n-button>
        </div>
      </div>
    </n-modal>
  </section>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.head h2 {
  font-size: 1.1rem;
}
.optional {
  font-size: 0.75rem;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--ms-surface-2);
  color: var(--ms-text-3);
}
.setup {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.setup a {
  text-decoration: none;
}
.tasks {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 10px;
}
.task {
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: left;
  padding: 12px 14px;
  border: 1px solid var(--ms-border);
  border-radius: 10px;
  background: var(--ms-surface);
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.task:hover:not(:disabled) {
  border-color: var(--ms-accent);
}
.task:focus-visible {
  outline: 2px solid var(--ms-accent);
  outline-offset: 2px;
}
.task:disabled {
  opacity: 0.6;
  cursor: default;
}
.live,
.saved {
  margin-top: 14px;
}
.stop {
  margin-top: 8px;
}
.err {
  margin-top: 12px;
}
.pre {
  white-space: pre-wrap;
}
.retry {
  margin-top: 8px;
}
.note-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 6px;
}
.note-actions a {
  text-decoration: none;
}
.dest {
  margin: 0 0 10px;
}
h4 {
  margin: 12px 0 6px;
  font-size: 0.95rem;
}
.cats {
  list-style: none;
  margin: 0;
  padding: 0;
}
.cats li {
  padding: 6px 0;
  border-bottom: 1px solid var(--ms-border);
}
.desc {
  margin-left: 26px;
  font-size: 0.82rem;
}
.tag {
  margin-left: 8px;
  font-size: 0.72rem;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--ms-surface-2);
  color: var(--ms-text-3);
}
.gap {
  margin-top: 10px;
}
.never {
  margin: 10px 0 0;
  font-size: 0.85rem;
  color: var(--ms-brand);
}
.preview {
  margin-top: 12px;
}
.preview summary {
  cursor: pointer;
  color: var(--ms-text-2);
}
.preview pre {
  max-height: 300px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 0.78rem;
  background: var(--ms-surface-2);
  padding: 10px;
  border-radius: 6px;
}
.send-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
@media (max-width: 760px) {
  .tasks {
    grid-template-columns: 1fr;
  }
}
</style>
