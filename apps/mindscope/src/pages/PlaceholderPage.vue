<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import AppIcon from '../components/AppIcon.vue';

const props = defineProps<{ section: 'assess' | 'history' | 'bank' }>();
const { t } = useI18n();
const icon = computed(() => props.section);
</script>

<template>
  <div class="ms-page">
    <div class="ms-page-header">
      <h1 class="ms-page-title">{{ t(`nav.${section}`) }}</h1>
    </div>
    <div class="ms-card soon">
      <div class="icon"><AppIcon :name="icon" :size="36" /></div>
      <h2>{{ t('common.comingSoon') }}</h2>
      <p class="ms-muted">{{ t(`placeholder.${section}`) }}</p>
    </div>
  </div>
</template>

<style scoped>
.soon {
  text-align: center;
  padding: 56px 24px;
}
.icon {
  display: inline-flex;
  padding: 16px;
  border-radius: 50%;
  color: var(--ms-brand);
  background: color-mix(in srgb, var(--ms-brand) 12%, transparent);
  margin-bottom: 12px;
}
.soon p {
  max-width: 480px;
  margin: 8px auto 0;
}
</style>
