<script setup lang="ts">
/** The user's own dated notes about a person. Stored locally; only sent to AI when chosen. */
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { NButton, NDatePicker, NInput, useDialog, useMessage } from 'naive-ui';
import { GROWTH_NOTE_MAX, type GrowthNote } from '@mindscope/storage';
import { useAppStore } from '../stores/app';
import AppIcon from './AppIcon.vue';

const props = defineProps<{ profileId: string }>();
const emit = defineEmits<{ changed: [notes: GrowthNote[]] }>();
const { t } = useI18n();
const app = useAppStore();
const dialog = useDialog();
const message = useMessage();

const notes = ref<GrowthNote[]>([]);
const editing = ref<string | null>(null); // note id, or 'new'
const date = ref<number>(Date.now());
const text = ref('');
const showAll = ref(false);

async function load() {
  notes.value = await app.r().growth.list(props.profileId);
  emit('changed', notes.value);
}
onMounted(load);

const visible = computed(() => (showAll.value ? notes.value : notes.value.slice(0, 5)));
const toIsoDate = (ms: number) => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

function startNew() {
  editing.value = 'new';
  date.value = Date.now();
  text.value = '';
}
function startEdit(n: GrowthNote) {
  editing.value = n.id;
  date.value = new Date(`${n.date}T12:00:00`).getTime();
  text.value = n.text;
}

async function submit() {
  if (!text.value.trim()) return message.warning(t('growth.empty'));
  try {
    if (editing.value === 'new') await app.r().growth.add(props.profileId, toIsoDate(date.value), text.value);
    else if (editing.value) await app.r().growth.update(editing.value, toIsoDate(date.value), text.value);
    editing.value = null;
    await load();
  } catch (err) {
    message.error(t('common.failed', { msg: err instanceof Error ? err.message : String(err) }));
  }
}

function remove(n: GrowthNote) {
  dialog.warning({
    title: t('growth.delete'),
    content: t('growth.deleteConfirm', { date: n.date }),
    positiveText: t('common.delete'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      await app.r().growth.remove(n.id);
      await load();
    },
  });
}
</script>

<template>
  <section class="ms-card growth" data-testid="growth-section">
    <div class="head">
      <h2>{{ t('growth.title') }}</h2>
      <n-button v-if="editing === null" size="small" data-testid="growth-add" @click="startNew">
        <template #icon><AppIcon name="plus" :size="16" /></template>{{ t('growth.add') }}
      </n-button>
    </div>
    <p class="ms-subtle">{{ t('growth.hint') }}</p>

    <div v-if="editing !== null" class="editor ms-no-print">
      <n-date-picker v-model:value="date" type="date" :is-date-disabled="(ts: number) => ts > Date.now()" class="date" />
      <n-input
        v-model:value="text"
        type="textarea"
        :autosize="{ minRows: 3, maxRows: 10 }"
        :maxlength="GROWTH_NOTE_MAX"
        show-count
        :placeholder="t('growth.placeholder')"
        data-testid="growth-text"
      />
      <div class="actions">
        <n-button type="primary" size="small" data-testid="growth-save" @click="submit">{{ t('common.save') }}</n-button>
        <n-button size="small" quaternary @click="editing = null">{{ t('common.cancel') }}</n-button>
      </div>
    </div>

    <p v-if="!notes.length && editing === null" class="ms-muted">{{ t('growth.none') }}</p>
    <ul class="list">
      <li v-for="n in visible" :key="n.id" data-testid="growth-note">
        <div class="date-col">{{ n.date }}</div>
        <div class="text">{{ n.text }}</div>
        <div class="row-actions ms-no-print">
          <n-button size="tiny" quaternary :aria-label="t('common.edit')" @click="startEdit(n)"><AppIcon name="edit" :size="15" /></n-button>
          <n-button size="tiny" quaternary :aria-label="t('growth.delete')" @click="remove(n)"><AppIcon name="trash" :size="15" /></n-button>
        </div>
      </li>
    </ul>
    <n-button v-if="notes.length > 5" text size="small" class="ms-no-print" @click="showAll = !showAll">
      {{ showAll ? t('growth.showLess') : t('growth.showAll', { n: notes.length }) }}
    </n-button>
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
.editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 10px 0;
  padding: 12px;
  border-radius: 8px;
  background: var(--ms-surface-2);
}
.date {
  max-width: 220px;
}
.actions {
  display: flex;
  gap: 8px;
}
.list {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
}
.list li {
  display: grid;
  grid-template-columns: 96px 1fr auto;
  gap: 10px;
  padding: 8px 0;
  border-top: 1px solid var(--ms-border);
  break-inside: avoid;
}
.date-col {
  color: var(--ms-text-3);
  font-variant-numeric: tabular-nums;
  font-size: 0.85rem;
  padding-top: 2px;
}
.text {
  white-space: pre-wrap;
  line-height: 1.65;
}
.row-actions {
  display: flex;
}
@media (max-width: 640px) {
  .list li {
    grid-template-columns: 1fr auto;
  }
  .date-col {
    grid-column: 1 / -1;
  }
}
</style>
