<script setup lang="ts">
/** Big Five results list (history page). */
import { useI18n } from 'vue-i18n';
import { NButton } from 'naive-ui';
import { B5_DOMAINS } from '@mindscope/core';
import type { StoredBigFiveResult } from '@mindscope/storage';
import { formatDate } from '../../i18n';
import AppIcon from '../AppIcon.vue';
import { useBigFiveText } from './useBigFiveText';

defineProps<{ results: StoredBigFiveResult[] }>();
const emit = defineEmits<{ delete: [result: StoredBigFiveResult] }>();
const { t } = useI18n();
const { names } = useBigFiveText();
</script>

<template>
  <div class="wrap">
    <table class="b5-table">
      <thead>
        <tr>
          <th>{{ t('detail.colDate') }}</th>
          <th>{{ t('history.people') }}</th>
          <th>{{ t('b5.colForm') }}</th>
          <th v-for="d in B5_DOMAINS" :key="d" class="num">{{ names[d] }}</th>
          <th class="ms-no-print"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in results" :key="r.id" data-testid="b5-row">
          <td class="nowrap">{{ formatDate(r.createdAt, true) }}</td>
          <td><router-link :to="`/profiles/${r.profileId}`">{{ r.profileName }}</router-link></td>
          <td>{{ t(`modes.${r.form}.name`) }}</td>
          <td v-for="d in B5_DOMAINS" :key="d" class="num">{{ r.result.domains[d].score100 ?? '—' }}</td>
          <td class="ms-no-print actions">
            <router-link :to="`/b5/${r.id}`"><n-button size="tiny" secondary>{{ t('detail.view') }}</n-button></router-link>
            <n-button size="tiny" quaternary :aria-label="t('detail.deleteResult')" @click="emit('delete', r)"><AppIcon name="trash" :size="15" /></n-button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.wrap {
  overflow-x: auto;
}
.b5-table {
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
  white-space: nowrap;
}
td {
  padding: 8px;
  border-bottom: 1px solid var(--ms-border);
}
.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.nowrap {
  white-space: nowrap;
}
.actions {
  text-align: right;
  white-space: nowrap;
}
a {
  color: var(--ms-brand);
  text-decoration: none;
}
</style>
