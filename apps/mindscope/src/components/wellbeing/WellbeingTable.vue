<script setup lang="ts">
/** List of wellbeing check-in results (history page). */
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { NButton } from 'naive-ui';
import { localize } from '@mindscope/core';
import type { StoredScale, StoredScaleResult } from '@mindscope/storage';
import { useAppStore } from '../../stores/app';
import { formatDate } from '../../i18n';
import { LEVEL_COLORS } from './levels';
import AppIcon from '../AppIcon.vue';

const props = defineProps<{ results: StoredScaleResult[] }>();
const emit = defineEmits<{ delete: [result: StoredScaleResult] }>();
const { t, locale } = useI18n();
const app = useAppStore();

const scales = ref(new Map<string, StoredScale>());
onMounted(async () => {
  for (const v of await app.r().scales.latestVersions()) scales.value.set(v.versionId, await app.r().scales.load(v.versionId));
});
async function scaleOf(versionId: string) {
  if (!scales.value.has(versionId)) scales.value.set(versionId, await app.r().scales.load(versionId));
}
const rows = computed(() =>
  props.results.map((r) => {
    if (!scales.value.has(r.versionId)) void scaleOf(r.versionId);
    const sc = scales.value.get(r.versionId);
    const band = sc?.scoring.bands.find((b) => b.key === r.result.band?.key);
    return {
      r,
      name: sc ? localize(sc.shortName, locale.value) : r.instrument,
      band: band ? { label: localize(band.label, locale.value), color: LEVEL_COLORS[band.level] } : null,
    };
  }),
);
</script>

<template>
  <table class="wb-table">
    <thead>
      <tr>
        <th>{{ t('detail.colDate') }}</th>
        <th>{{ t('history.people') }}</th>
        <th>{{ t('wb.colScale') }}</th>
        <th>{{ t('wb.colScore') }}</th>
        <th>{{ t('wb.colBand') }}</th>
        <th class="ms-no-print"></th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="row in rows" :key="row.r.id" data-testid="wb-row">
        <td class="nowrap">{{ formatDate(row.r.createdAt, true) }}</td>
        <td><router-link :to="`/profiles/${row.r.profileId}`">{{ row.r.profileName }}</router-link></td>
        <td>{{ row.name }}</td>
        <td class="num">{{ row.r.result.score }} / {{ row.r.result.maxScore }}</td>
        <td><span v-if="row.band" class="band" :style="{ '--c': row.band.color }">{{ row.band.label }}</span></td>
        <td class="ms-no-print actions">
          <router-link :to="`/wellbeing/${row.r.id}`"><n-button size="tiny" secondary>{{ t('detail.view') }}</n-button></router-link>
          <n-button size="tiny" quaternary :aria-label="t('detail.deleteResult')" @click="emit('delete', row.r)"><AppIcon name="trash" :size="15" /></n-button>
        </td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.wb-table {
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
.nowrap {
  white-space: nowrap;
}
.num {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.band {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.78rem;
  color: var(--c);
  background: color-mix(in srgb, var(--c) 14%, transparent);
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
