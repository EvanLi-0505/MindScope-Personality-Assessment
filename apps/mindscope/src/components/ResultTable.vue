<script setup lang="ts">
/** Result list with selection for comparison (used on person detail and history pages). */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { NButton, NCheckbox } from 'naive-ui';
import type { ResultWithProfile } from '@mindscope/storage';
import { formatDate } from '../i18n';
import AppIcon from './AppIcon.vue';

const props = defineProps<{ results: ResultWithProfile[]; showPerson?: boolean; selected: string[] }>();
const emit = defineEmits<{ 'update:selected': [ids: string[]]; delete: [result: ResultWithProfile] }>();
const { t } = useI18n();
const router = useRouter();

const MAX_COMPARE = 5;
function toggle(id: string, on: boolean) {
  const next = on ? [...props.selected, id] : props.selected.filter((x) => x !== id);
  emit('update:selected', next);
}
const canCompare = computed(() => props.selected.length >= 2 && props.selected.length <= MAX_COMPARE);
function compare() {
  // Keep chronological order so charts read from older to newer.
  const order = props.results.filter((r) => props.selected.includes(r.id)).reverse().map((r) => r.id);
  router.push({ path: '/compare', query: { ids: order.join(',') } });
}
</script>

<template>
  <div class="result-table">
    <div class="bar ms-no-print">
      <span class="ms-subtle">{{ t('detail.compareHint') }}</span>
      <n-button size="small" type="primary" :disabled="!canCompare" data-testid="compare-selected" @click="compare">
        {{ t('detail.compare', { n: selected.length }) }}
      </n-button>
    </div>
    <table>
      <thead>
        <tr>
          <th class="ms-no-print"></th>
          <th>{{ t('detail.colDate') }}</th>
          <th v-if="showPerson">{{ t('history.people') }}</th>
          <th>{{ t('detail.colType') }}</th>
          <th>{{ t('detail.colMode') }}</th>
          <th class="hide-sm">{{ t('detail.colItems') }}</th>
          <th class="ms-no-print"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in results" :key="r.id" data-testid="result-row">
          <td class="ms-no-print">
            <n-checkbox
              :checked="selected.includes(r.id)"
              :disabled="!selected.includes(r.id) && selected.length >= MAX_COMPARE"
              :aria-label="r.id"
              @update:checked="(v: boolean) => toggle(r.id, v)"
            />
          </td>
          <td class="nowrap">{{ formatDate(r.createdAt, true) }}</td>
          <td v-if="showPerson">
            <router-link :to="`/profiles/${r.profileId}`">{{ r.profileName }}</router-link>
          </td>
          <td><b class="code">{{ r.typeCode }}</b></td>
          <td>{{ t(`modes.${r.mode}.name`) }}</td>
          <td class="hide-sm num">{{ r.result.answered }}/{{ r.meta.plannedCount }}</td>
          <td class="ms-no-print actions">
            <router-link :to="`/results/${r.id}`"><n-button size="tiny" secondary>{{ t('detail.view') }}</n-button></router-link>
            <n-button size="tiny" quaternary :aria-label="t('detail.deleteResult')" @click="emit('delete', r)"><AppIcon name="trash" :size="15" /></n-button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}
th {
  text-align: left;
  font-weight: 500;
  color: var(--ms-text-3);
  padding: 6px 8px;
  border-bottom: 1px solid var(--ms-border);
}
td {
  padding: 8px;
  border-bottom: 1px solid var(--ms-border);
}
.code {
  letter-spacing: 0.05em;
  color: var(--ms-brand);
}
.nowrap {
  white-space: nowrap;
}
.num {
  font-variant-numeric: tabular-nums;
}
.actions {
  white-space: nowrap;
  text-align: right;
}
.actions a {
  text-decoration: none;
}
a {
  color: var(--ms-brand);
}
@media (max-width: 640px) {
  .hide-sm {
    display: none;
  }
  td,
  th {
    padding: 6px 4px;
  }
}
</style>
