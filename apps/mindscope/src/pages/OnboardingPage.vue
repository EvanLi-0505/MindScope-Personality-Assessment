<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { NButton, useMessage } from 'naive-ui';
import type { ProfileInput } from '@mindscope/core';
import BrandMark from '../components/BrandMark.vue';
import AppIcon from '../components/AppIcon.vue';
import ProfileForm from '../components/ProfileForm.vue';
import { useAppStore } from '../stores/app';
import { useProfilesStore } from '../stores/profiles';

const { t } = useI18n();
const router = useRouter();
const message = useMessage();
const app = useAppStore();
const store = useProfilesStore();

const step = ref<'welcome' | 'create'>('welcome');
const busy = ref(false);

onMounted(() => store.refresh());

async function create(input: ProfileInput, tags: string[]) {
  if (busy.value) return;
  busy.value = true;
  try {
    await store.create(input, tags);
    await router.replace('/');
  } catch (err) {
    message.error(t('common.failed', { msg: String(err) }));
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="onboarding">
    <div class="panel ms-card">
      <template v-if="step === 'welcome'">
        <div class="hero">
          <BrandMark :size="88" />
          <h1>{{ t('onboarding.welcome') }}</h1>
          <p class="ms-muted">{{ t('onboarding.intro') }}</p>
        </div>
        <div class="privacy">
          <div class="privacy-title"><AppIcon name="shield" /> {{ t('onboarding.privacyTitle') }}</div>
          <ul>
            <li>{{ t('onboarding.privacy1') }}</li>
            <li>{{ t('onboarding.privacy2') }}</li>
            <li>{{ app.platform?.kind === 'desktop' ? t('onboarding.privacy3Desktop') : t('onboarding.privacy3Web') }}</li>
          </ul>
          <p class="ms-subtle">{{ t('onboarding.disclaimer') }}</p>
        </div>
        <n-button type="primary" size="large" block data-testid="onboarding-start" @click="step = 'create'">
          {{ t('onboarding.start') }}
        </n-button>
      </template>

      <template v-else>
        <h2>{{ t('onboarding.createTitle') }}</h2>
        <p class="ms-muted hint">{{ t('onboarding.createHint') }}</p>
        <ProfileForm :submit-label="t('onboarding.done')" :busy="busy" @submit="create" />
      </template>
    </div>
  </div>
</template>

<style scoped>
.onboarding {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  background:
    radial-gradient(circle at 15% 10%, color-mix(in srgb, var(--ms-brand-2) 18%, transparent), transparent 45%),
    radial-gradient(circle at 85% 90%, color-mix(in srgb, var(--ms-accent) 16%, transparent), transparent 45%),
    var(--ms-bg);
}
.panel {
  width: 100%;
  max-width: 560px;
  padding: 32px;
}
.hero {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin-bottom: 20px;
}
.hero h1 {
  font-size: 1.6rem;
}
.privacy {
  background: var(--ms-surface-2);
  border-radius: var(--ms-radius-sm);
  padding: 16px 18px;
  margin-bottom: 22px;
}
.privacy-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  color: var(--ms-brand);
}
.privacy ul {
  margin: 8px 0;
  padding-left: 20px;
}
.privacy li {
  margin: 4px 0;
}
.hint {
  margin: 6px 0 18px;
}
@media (max-width: 520px) {
  .panel {
    padding: 22px 18px;
  }
}
</style>
