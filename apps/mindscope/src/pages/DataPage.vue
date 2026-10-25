<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { NAlert, NButton, NModal, NSpin, useDialog, useMessage } from 'naive-ui';
import type { BackupInfo, StorageInfo, StorageKind } from '../platform';
import { useAppStore } from '../stores/app';
import { formatBytes, formatDate } from '../i18n';
import AppIcon from '../components/AppIcon.vue';
import NetworkLog from '../components/NetworkLog.vue';

const { t } = useI18n();
const app = useAppStore();
const dialog = useDialog();
const message = useMessage();

const info = ref<StorageInfo | null>(null);
const backups = ref<BackupInfo[]>([]);
const busy = ref<string | null>(null);
const logsText = ref<string | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

const desktop = computed(() => app.platform?.kind === 'desktop');
const loc = (kind: StorageKind) => info.value?.locations.find((l) => l.kind === kind);

async function load() {
  info.value = await app.p().storage.info();
  backups.value = await app.p().storage.listBackups();
}
onMounted(load);

async function run<T>(key: string, fn: () => Promise<T>): Promise<T | undefined> {
  busy.value = key;
  try {
    return await fn();
  } catch (err) {
    message.error(t('common.failed', { msg: err instanceof Error ? err.message : String(err) }));
    return undefined;
  } finally {
    busy.value = null;
  }
}

function confirm(content: string, action: () => Promise<void>) {
  dialog.warning({ title: t('common.confirm'), content, positiveText: t('common.confirm'), negativeText: t('common.cancel'), onPositiveClick: action });
}

const openFolder = (kind: StorageKind | 'backups') => run(`open-${kind}`, () => app.p().storage.openFolder(kind));

function clearLogs() {
  confirm(t('data.clearLogsConfirm'), async () => {
    const r = await run('logs', () => app.p().storage.clearLogs());
    if (r) message.success(t('data.cacheCleared', { size: formatBytes(r.freedBytes) }));
    await load();
  });
}

function clearCache() {
  confirm(t('data.clearCacheConfirm'), async () => {
    const r = await run('cache', () => app.p().storage.clearCache());
    if (r) message.success(t(r.pendingRestart ? 'data.cachePending' : 'data.cacheCleared', { size: formatBytes(r.freedBytes) }));
    await load();
  });
}

async function backupNow() {
  const b = await run('backup', () => app.p().storage.backup());
  if (b) message.success(t('data.backupDone', { name: b.name }));
  await load();
}

function restore(b: BackupInfo) {
  confirm(t('data.restoreConfirm', { name: b.name }), async () => {
    const ok = await run('restore', async () => {
      await app.p().storage.restore(b.name);
      return true;
    });
    if (ok) {
      message.success(t('data.restoreDone'));
      setTimeout(() => location.reload(), 600);
    }
  });
}

function pickRestoreFile() {
  fileInput.value?.click();
}

function onRestoreFile(ev: Event) {
  const file = (ev.target as HTMLInputElement).files?.[0];
  (ev.target as HTMLInputElement).value = '';
  if (!file) return;
  confirm(t('data.restoreConfirm', { name: file.name }), async () => {
    const ok = await run('restore', async () => {
      try {
        await app.p().storage.restore(file);
      } catch (err) {
        if (err instanceof Error && err.message === 'NOT_SQLITE') throw new Error(t('data.restoreBadFile'));
        throw err;
      }
      return true;
    });
    if (ok) {
      message.success(t('data.restoreDone'));
      setTimeout(() => location.reload(), 600);
    }
  });
}

async function relocate() {
  const r = await run('relocate', async () => (await app.p().storage.relocate?.()) ?? null);
  if (!r) return;
  dialog.success({
    title: t('data.relocate'),
    content: t('data.relocateDone', { path: r.newRoot }),
    positiveText: t('data.restartNow'),
    negativeText: t('common.close'),
    onPositiveClick: () => app.p().restart(),
  });
}

async function showLogs() {
  logsText.value = (await run('readlogs', () => app.p().storage.readRecentLogs(200))) ?? '';
}
</script>

<template>
  <div class="ms-page">
    <div class="ms-page-header">
      <h1 class="ms-page-title">{{ t('data.title') }}</h1>
      <n-button quaternary circle @click="load" :aria-label="t('common.loading')"><AppIcon name="refresh" /></n-button>
    </div>

    <n-spin v-if="!info" />
    <template v-else>
      <div class="ms-card root">
        <div class="ms-subtle">{{ desktop ? t('data.rootFolder') : t('data.browserStorage') }}</div>
        <div class="root-path">
          <code v-if="desktop">{{ info.root }}</code>
          <span v-else>{{ info.quota ? t('data.quota', { usage: formatBytes(info.quota.usage), quota: formatBytes(info.quota.quota) }) : '—' }}</span>
          <span v-if="info.relocated" class="ms-subtle">{{ t('data.relocated') }}</span>
        </div>
        <n-alert v-if="!desktop" :type="!info.durable ? 'error' : info.persisted ? 'success' : 'warning'" :show-icon="true" class="web-note">
          {{ !info.durable ? t('data.notDurable') : info.persisted ? t('data.persisted') : t('data.notPersisted') }}
        </n-alert>
      </div>

      <div class="sections">
        <!-- user data -->
        <section class="ms-card section">
          <div class="sec-head">
            <AppIcon name="data" />
            <h2>{{ t('data.userData') }}</h2>
            <span class="size">{{ formatBytes(loc('data')?.bytes ?? 0) }}</span>
          </div>
          <p class="ms-muted">{{ t('data.userDataDesc') }}</p>
          <code v-if="desktop" class="path">{{ loc('data')?.path }}</code>
          <div class="actions">
            <n-button v-if="desktop" @click="openFolder('data')"><template #icon><AppIcon name="folder" :size="16" /></template>{{ t('data.openFolder') }}</n-button>
            <n-button type="primary" :loading="busy === 'backup'" @click="backupNow" data-testid="backup-now">
              <template #icon><AppIcon name="download" :size="16" /></template>{{ t('data.backupNow') }}
            </n-button>
            <n-button v-if="!desktop" :loading="busy === 'restore'" @click="pickRestoreFile">
              <template #icon><AppIcon name="upload" :size="16" /></template>{{ t('data.restoreFromFile') }}
            </n-button>
            <n-button v-if="desktop" :loading="busy === 'relocate'" @click="relocate">{{ t('data.relocate') }}</n-button>
          </div>
          <p v-if="desktop" class="ms-subtle">{{ t('data.relocateDesc') }}</p>
          <p v-else class="ms-subtle">{{ t('data.backupWebHint') }}</p>
          <input ref="fileInput" type="file" accept=".db,.sqlite,.sqlite3" hidden @change="onRestoreFile" />
        </section>

        <!-- backups (desktop) -->
        <section v-if="desktop" class="ms-card section">
          <div class="sec-head">
            <AppIcon name="shield" />
            <h2>{{ t('data.backups') }}</h2>
            <n-button text size="small" @click="openFolder('backups')">{{ t('data.openFolder') }}</n-button>
          </div>
          <p v-if="!backups.length" class="ms-muted">{{ t('data.noBackups') }}</p>
          <div v-for="b in backups" :key="b.name" class="backup-row">
            <div class="backup-text">
              <div class="backup-name">{{ b.name }}</div>
              <div class="ms-subtle">{{ formatDate(b.createdAt, true) }} · {{ formatBytes(b.bytes) }}</div>
            </div>
            <n-button size="small" :loading="busy === 'restore'" @click="restore(b)">{{ t('data.restore') }}</n-button>
          </div>
        </section>

        <!-- logs -->
        <section class="ms-card section">
          <div class="sec-head">
            <AppIcon name="log" />
            <h2>{{ t('data.logs') }}</h2>
            <span class="size">{{ formatBytes(loc('logs')?.bytes ?? 0) }}<template v-if="desktop"> · {{ t('data.files', { n: loc('logs')?.files ?? 0 }) }}</template></span>
          </div>
          <p class="ms-muted">{{ t('data.logsDesc') }}</p>
          <code v-if="desktop" class="path">{{ loc('logs')?.path }}</code>
          <div class="actions">
            <n-button v-if="desktop" @click="openFolder('logs')"><template #icon><AppIcon name="folder" :size="16" /></template>{{ t('data.openFolder') }}</n-button>
            <n-button @click="showLogs">{{ t('data.showLogs') }}</n-button>
            <n-button :loading="busy === 'logs'" @click="clearLogs"><template #icon><AppIcon name="trash" :size="16" /></template>{{ t('data.clearLogs') }}</n-button>
          </div>
        </section>

        <!-- cache -->
        <section v-if="desktop" class="ms-card section">
          <div class="sec-head">
            <AppIcon name="refresh" />
            <h2>{{ t('data.cache') }}</h2>
            <span class="size">{{ formatBytes(loc('cache')?.bytes ?? 0) }}</span>
          </div>
          <p class="ms-muted">{{ t('data.cacheDesc') }}</p>
          <code class="path">{{ loc('cache')?.path }}</code>
          <div class="actions">
            <n-button @click="openFolder('cache')"><template #icon><AppIcon name="folder" :size="16" /></template>{{ t('data.openFolder') }}</n-button>
            <n-button :loading="busy === 'cache'" @click="clearCache"><template #icon><AppIcon name="trash" :size="16" /></template>{{ t('data.clearCache') }}</n-button>
          </div>
          <p v-if="info.cacheClearPending" class="ms-subtle">{{ t('data.cachePendingNote') }}</p>
        </section>

        <!-- network -->
        <section id="network" class="ms-card section wide">
          <div class="sec-head">
            <AppIcon name="wifiOff" />
            <h2>{{ t('data.network') }}</h2>
          </div>
          <NetworkLog />
        </section>
      </div>
    </template>

    <n-modal :show="logsText !== null" preset="card" :title="t('data.recentLogs')" style="max-width: 860px" @update:show="(v: boolean) => !v && (logsText = null)">
      <pre class="logs">{{ logsText || t('common.none') }}</pre>
    </n-modal>
  </div>
</template>

<style scoped>
.section.wide {
  grid-column: 1 / -1;
}
.root {
  margin-bottom: 16px;
}
.root-path {
  display: flex;
  gap: 8px;
  align-items: baseline;
  flex-wrap: wrap;
  margin-top: 4px;
  font-weight: 600;
}
code {
  font-family: ui-monospace, 'Cascadia Code', Consolas, monospace;
  font-size: 0.85rem;
  word-break: break-all;
}
.web-note {
  margin-top: 12px;
}
.sections {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sec-head {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--ms-brand);
}
.sec-head h2 {
  font-size: 1.05rem;
  color: var(--ms-text);
}
.size {
  margin-left: auto;
  font-weight: 600;
  color: var(--ms-text-2);
  font-size: 0.9rem;
}
.section p {
  margin: 0;
}
.path {
  display: block;
  background: var(--ms-surface-2);
  border-radius: 8px;
  padding: 6px 10px;
  color: var(--ms-text-2);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 4px 0;
}
.backup-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid var(--ms-border);
}
.backup-text {
  flex: 1;
  min-width: 0;
}
.backup-name {
  font-size: 0.9rem;
  word-break: break-all;
}
.logs {
  max-height: 60vh;
  overflow: auto;
  font-size: 0.78rem;
  background: var(--ms-surface-2);
  padding: 12px;
  border-radius: 8px;
  white-space: pre-wrap;
}
@media (max-width: 900px) {
  .sections {
    grid-template-columns: 1fr;
  }
}
</style>
