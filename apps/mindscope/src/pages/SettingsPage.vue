<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { NButton, NRadioButton, NRadioGroup, NSelect, NSwitch, useDialog } from 'naive-ui';
import { setSplashEnabled, splashEnabled } from '../splash';
import { SOURCE_URL } from '@mindscope/core';
import type { EnvInfo } from '../platform';
import { useAppStore, type ThemePref } from '../stores/app';
import { LOCALES, type Locale } from '../i18n';
import BrandMark from '../components/BrandMark.vue';
import AppIcon from '../components/AppIcon.vue';

const { t } = useI18n();
const app = useAppStore();
const dialog = useDialog();
const env = ref<EnvInfo | null>(null);
const splashOn = ref(splashEnabled());
function toggleSplash(on: boolean) {
  splashOn.value = on;
  setSplashEnabled(on);
}

onMounted(async () => {
  env.value = await app.p().env();
});

/** Opening an external page needs the network, so we always ask first. */
function openSource() {
  dialog.info({
    title: t('settings.source'),
    content: t('settings.openSourceConfirm', { url: SOURCE_URL }),
    positiveText: t('common.open'),
    negativeText: t('common.cancel'),
    onPositiveClick: () => app.p().openExternal(SOURCE_URL),
  });
}
</script>

<template>
  <div class="ms-page narrow">
    <div class="ms-page-header">
      <h1 class="ms-page-title">{{ t('settings.title') }}</h1>
    </div>

    <section class="ms-card block">
      <h2>{{ t('settings.appearance') }}</h2>
      <div class="row">
        <span>{{ t('settings.theme') }}</span>
        <n-radio-group :value="app.theme" @update:value="(v: ThemePref) => app.setTheme(v)">
          <n-radio-button value="system">{{ t('settings.themeSystem') }}</n-radio-button>
          <n-radio-button value="light">{{ t('settings.themeLight') }}</n-radio-button>
          <n-radio-button value="dark">{{ t('settings.themeDark') }}</n-radio-button>
        </n-radio-group>
      </div>
      <div class="row">
        <span>
          {{ t('settings.splash') }}
          <span class="ms-subtle"> · {{ t('settings.splashHint') }}</span>
        </span>
        <n-switch :value="splashOn" data-testid="splash-toggle" @update:value="toggleSplash" />
      </div>
      <div class="row">
        <span>{{ t('settings.language') }}</span>
        <n-select :value="app.locale" :options="LOCALES" style="width: 180px" @update:value="(v: Locale) => app.changeLocale(v)" />
      </div>
    </section>

    <section class="ms-card block">
      <h2>{{ t('settings.about') }}</h2>
      <div class="about-head">
        <BrandMark :size="52" />
        <div>
          <div class="app-name">MindScope</div>
          <div class="ms-subtle">{{ t('app.tagline') }}</div>
        </div>
      </div>
      <dl v-if="env">
        <dt>{{ t('settings.version') }}</dt>
        <dd>{{ env.appVersion }}</dd>
        <dt>{{ t('settings.platform') }}</dt>
        <dd>{{ env.platform }} · {{ env.os }}</dd>
        <dt>{{ t('settings.engine') }}</dt>
        <dd>{{ env.engine }}</dd>
        <dt>{{ t('settings.license') }}</dt>
        <dd>{{ t('settings.licenseText') }}</dd>
      </dl>
      <p class="ms-subtle">{{ t('settings.trademark') }}</p>
      <n-button @click="openSource">{{ t('settings.source') }}</n-button>
    </section>

    <section class="ms-card block">
      <h2>{{ t('settings.diagnostics') }}</h2>
      <router-link to="/diagnostics/pdf" class="link-row">
        <AppIcon name="file" />
        <span>{{ t('settings.pdfTest') }}</span>
        <AppIcon name="chevronRight" :size="16" class="chev" />
      </router-link>
    </section>
  </div>
</template>

<style scoped>
.narrow {
  max-width: 760px;
}
.block {
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.block h2 {
  font-size: 1.05rem;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.about-head {
  display: flex;
  gap: 12px;
  align-items: center;
}
.app-name {
  font-weight: 800;
  font-size: 1.1rem;
}
dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 6px 16px;
  margin: 0;
}
dt {
  color: var(--ms-text-3);
}
dd {
  margin: 0;
  word-break: break-word;
}
.link-row {
  display: flex;
  align-items: center;
  gap: 12px;
  color: inherit;
  text-decoration: none;
}
.chev {
  margin-left: auto;
  color: var(--ms-text-3);
}
</style>
