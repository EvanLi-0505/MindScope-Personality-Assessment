<script setup lang="ts">
/** Every outbound request the app made (AI only), newest first. Content and keys are never recorded. */
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { NButton, useDialog, useMessage } from 'naive-ui';
import type { NetworkRecord } from '@mindscope/storage';
import { useAppStore } from '../stores/app';
import { formatBytes, formatDate } from '../i18n';
import { hostOf } from '../ai/config';

const { t, te } = useI18n();
const app = useAppStore();
const dialog = useDialog();
const message = useMessage();
const rows = ref<NetworkRecord[]>([]);
const loaded = ref(false);

async function load() {
  rows.value = await app.r().network.list(100);
  loaded.value = true;
}
onMounted(load);

const purposeLabel = (p: string) => (te(`ai.purpose.${p}`) ? t(`ai.purpose.${p}`) : p);
const categoryLabel = (c: string) => (te(`ai.cat.${c}.name`) ? t(`ai.cat.${c}.name`) : c);

function clear() {
  dialog.warning({
    title: t('data.networkClear'),
    content: t('data.networkClearConfirm'),
    positiveText: t('common.delete'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      await app.r().network.clear();
      app.p().log('info', 'network record cleared');
      message.success(t('common.deleted'));
      await load();
    },
  });
}
</script>

<template>
  <div>
    <p class="ms-muted" data-testid="network-status">
      {{ !loaded ? '' : rows.length === 0 ? t('data.networkNone') : t('data.networkCount', { n: rows.length }) }}
    </p>
    <div v-if="rows.length" class="table-wrap">
      <table class="net" data-testid="network-table">
        <thead>
          <tr>
            <th>{{ t('data.netTime') }}</th>
            <th>{{ t('data.netHost') }}</th>
            <th>{{ t('data.netPurpose') }}</th>
            <th>{{ t('data.netData') }}</th>
            <th>{{ t('data.netSize') }}</th>
            <th>{{ t('data.netResult') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.id" data-testid="network-row">
            <td class="nowrap">{{ formatDate(r.at, true) }}</td>
            <td class="mono">{{ hostOf(r.endpoint) }}<div class="ms-subtle">{{ r.model }}</div></td>
            <td>{{ purposeLabel(r.purpose) }}</td>
            <td>{{ r.categories.length ? r.categories.map(categoryLabel).join('、') : t('data.netNoPersonal') }}</td>
            <td class="nowrap">{{ formatBytes(r.bytes) }}<div v-if="r.tokens" class="ms-subtle">{{ r.tokens }} tokens</div></td>
            <td :class="r.outcome === 'ok' ? 'ok' : 'bad'">{{ r.outcome === 'ok' ? t('data.netOk') : r.outcome }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="ms-subtle">{{ t('data.networkNote') }}</p>
    <n-button v-if="rows.length" size="small" quaternary @click="clear">{{ t('data.networkClear') }}</n-button>
  </div>
</template>

<style scoped>
.table-wrap {
  overflow-x: auto;
  margin: 8px 0;
}
.net {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
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
  padding: 6px 8px;
  border-bottom: 1px solid var(--ms-border);
  vertical-align: top;
}
.nowrap {
  white-space: nowrap;
}
.mono {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 0.8rem;
}
.ok {
  color: var(--ms-brand);
}
.bad {
  color: #b45309;
}
</style>
