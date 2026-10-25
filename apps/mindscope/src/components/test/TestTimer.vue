<script setup lang="ts">
import { useI18n } from 'vue-i18n';

defineProps<{ totalMs: number; currentMs: number }>();
const { t } = useI18n();

function fmt(ms: number) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}
</script>

<template>
  <div class="timer ms-card">
    <div class="row">
      <span class="ms-subtle">{{ t('test.totalTime') }}</span>
      <span class="v">{{ fmt(totalMs) }}</span>
    </div>
    <div class="row current">
      <span class="ms-subtle">{{ t('test.currentTime') }}</span>
      <span class="v">{{ fmt(currentMs) }}</span>
    </div>
  </div>
</template>

<style scoped>
.timer {
  padding: 14px 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.v {
  font-family: ui-monospace, 'Cascadia Code', Consolas, monospace;
  font-weight: 700;
  color: var(--ms-brand);
  font-variant-numeric: tabular-nums;
}
.current .v {
  color: var(--ms-text-2);
}
</style>
