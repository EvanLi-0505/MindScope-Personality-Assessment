<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { NButton, useMessage } from 'naive-ui';
import { fileStamp } from '@mindscope/core';
import EChart from '../components/EChart.vue';
import AppIcon from '../components/AppIcon.vue';
import { useAppStore } from '../stores/app';

const { t } = useI18n();
const app = useAppStore();
const message = useMessage();

// Fixed sample values, clearly labelled on the page. Not a result of anyone.
const FUNCS = ['Ni', 'Te', 'Se', 'Fi', 'Ne', 'Ti', 'Si', 'Fe'] as const;
const SAMPLE = [78, 64, 35, 58, 49, 55, 30, 42];

const radar = computed(() => ({
  animation: false,
  radar: {
    shape: 'polygon',
    radius: '68%',
    indicator: FUNCS.map((f) => ({ name: `${f}\n${t(`functions.${f}`)}`, max: 100 })),
    axisName: { color: '#51606e', fontSize: 11 },
    splitArea: { show: false },
  },
  series: [
    {
      type: 'radar',
      data: [{ value: SAMPLE, name: 'sample' }],
      areaStyle: { color: 'rgba(43,168,143,0.25)' },
      lineStyle: { color: '#1F7A6D', width: 2 },
      itemStyle: { color: '#1F7A6D' },
      label: { show: true, color: '#1F7A6D', fontSize: 10 },
    },
  ],
}));

const DIMS = [
  { left: 'E', right: 'I', value: 28 },
  { left: 'S', right: 'N', value: 36 },
  { left: 'T', right: 'F', value: 61 },
  { left: 'J', right: 'P', value: 70 },
];

async function exportPdf() {
  try {
    const r = await app.p().exportPdf(`MindScope_PDF测试_${fileStamp()}.pdf`);
    if (r.path) message.success(t('pdf.exported', { path: r.path }));
    else if (r.printedWithBrowser) message.info(t('pdf.browserPrint'));
  } catch (err) {
    message.error(t('common.failed', { msg: String(err) }));
  }
}
</script>

<template>
  <div class="ms-page pdf-page">
    <div class="ms-page-header">
      <h1 class="ms-page-title">{{ t('pdf.title') }}</h1>
      <n-button type="primary" class="ms-no-print" data-testid="export-pdf" @click="exportPdf">
        <template #icon><AppIcon name="download" /></template>
        {{ t('pdf.export') }}
      </n-button>
    </div>
    <p class="ms-muted">{{ t('pdf.intro') }}</p>
    <p class="sample-note">{{ t('pdf.sampleNote') }}</p>

    <section class="ms-card">
      <h2>{{ t('pdf.paragraphTitle') }}</h2>
      <p>{{ t('pdf.paragraph') }}</p>
      <p>{{ t('pdf.paragraph') }}</p>
    </section>

    <section class="ms-card">
      <h2>{{ t('pdf.barTitle') }}</h2>
      <div v-for="d in DIMS" :key="d.left" class="dim">
        <span class="pole">{{ d.left }}</span>
        <div class="track"><div class="fill" :style="{ width: `${d.value}%` }" /></div>
        <span class="pole">{{ d.right }}</span>
        <span class="pct">{{ d.value }}%</span>
      </div>
    </section>

    <h2 class="ms-page-break break-title">{{ t('pdf.pageBreak') }}</h2>
    <section class="ms-card">
      <h2>{{ t('pdf.radarTitle') }}</h2>
      <EChart :option="radar" :height="380" />
    </section>
  </div>
</template>

<style scoped>
.pdf-page section {
  margin-top: 16px;
}
.pdf-page h2 {
  font-size: 1.05rem;
  margin-bottom: 8px;
}
.sample-note {
  display: inline-block;
  font-size: 0.85rem;
  padding: 4px 10px;
  border-radius: 8px;
  background: color-mix(in srgb, #e09a3e 16%, transparent);
  color: #9a5d12;
}
.dim {
  display: grid;
  grid-template-columns: 24px 1fr 24px 48px;
  gap: 10px;
  align-items: center;
  margin: 10px 0;
}
.pole {
  font-weight: 700;
  text-align: center;
}
.track {
  height: 12px;
  border-radius: 999px;
  background: var(--ms-surface-2);
  overflow: hidden;
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}
.fill {
  height: 100%;
  border-radius: 999px;
  background: var(--ms-gradient);
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}
.pct {
  font-variant-numeric: tabular-nums;
  color: var(--ms-text-2);
}
.break-title {
  margin-top: 28px;
}
</style>
