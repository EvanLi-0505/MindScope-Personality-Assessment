<script setup lang="ts">
import { computed, onMounted, ref, watchEffect } from 'vue';
import {
  NConfigProvider,
  NDialogProvider,
  NMessageProvider,
  NButton,
  NSpin,
  darkTheme,
  zhCN,
  dateZhCN,
  enUS,
  dateEnUS,
} from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { useAppStore } from './stores/app';
import { darkOverrides, lightOverrides } from './theme/naive';
import AppShell from './layouts/AppShell.vue';
import BrandMark from './components/BrandMark.vue';
import SmokeRunner from './components/SmokeRunner.vue';
import SplashScreen from './components/SplashScreen.vue';
import DialogRouteCloser from './components/DialogRouteCloser.vue';
import { shouldShowSplash } from './splash';

const app = useAppStore();
const splash = ref(shouldShowSplash());
const route = useRoute();
const router = useRouter();
const { t } = useI18n();

const naiveTheme = computed(() => (app.isDark ? darkTheme : null));
const overrides = computed(() => (app.isDark ? darkOverrides : lightOverrides));
const naiveLocale = computed(() => (app.locale === 'zh-CN' ? zhCN : enUS));
const naiveDateLocale = computed(() => (app.locale === 'zh-CN' ? dateZhCN : dateEnUS));

watchEffect(() => {
  document.documentElement.dataset.theme = app.isDark ? 'dark' : 'light';
});

onMounted(async () => {
  await app.start();
  if (app.boot.status === 'ready') {
    // Re-run the guard now that storage is ready (first-run redirect).
    await router.replace(router.currentRoute.value.fullPath).catch(() => {});
    const count = await app.r().profiles.count();
    if (count === 0 && route.name !== 'onboarding') await router.replace({ name: 'onboarding' });
  }
});
</script>

<template>
  <n-config-provider
    :theme="naiveTheme"
    :theme-overrides="overrides"
    :locale="naiveLocale"
    :date-locale="naiveDateLocale"
  >
    <n-message-provider>
      <n-dialog-provider>
        <div v-if="app.boot.status === 'booting'" class="boot">
          <BrandMark :size="72" />
          <n-spin size="small" />
          <p class="ms-muted">{{ t('boot.starting') }}</p>
        </div>

        <div v-else-if="app.boot.status === 'error'" class="boot">
          <BrandMark :size="64" />
          <h2>{{ app.boot.code === 'locked' ? t('boot.lockedTitle') : t('boot.failedTitle') }}</h2>
          <p class="ms-muted boot-hint">
            {{
              app.boot.code === 'locked'
                ? t('boot.lockedHint')
                : app.boot.code === 'db_too_new'
                  ? t('boot.dbTooNew')
                  : t('boot.failedHint')
            }}
          </p>
          <pre v-if="app.boot.code === 'unknown'" class="boot-error">{{ app.boot.message }}</pre>
          <n-button type="primary" @click="app.start()">{{ t('boot.retry') }}</n-button>
        </div>

        <template v-else>
          <!-- keyed: moving between two reports must load the new one -->
          <router-view v-if="route.meta.bare" :key="route.fullPath" />
          <AppShell v-else>
            <router-view />
          </AppShell>
          <SmokeRunner />
        </template>

        <SplashScreen v-if="splash" :ready="app.boot.status !== 'booting'" @done="splash = false" />
        <DialogRouteCloser />
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<style scoped>
.boot {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 24px;
  text-align: center;
}
.boot-hint {
  max-width: 520px;
}
.boot-error {
  max-width: 640px;
  white-space: pre-wrap;
  background: var(--ms-surface-2);
  border: 1px solid var(--ms-border);
  border-radius: var(--ms-radius-sm);
  padding: 12px;
  font-size: 0.8rem;
  text-align: left;
}
</style>
