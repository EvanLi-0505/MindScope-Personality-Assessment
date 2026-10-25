<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import AppIcon from '../components/AppIcon.vue';

const { t } = useI18n();
const items = [
  { to: '/bank', icon: 'bank', label: 'nav.bank' },
  { to: '/data', icon: 'data', label: 'nav.data' },
  { to: '/ai', icon: 'sparkle', label: 'nav.ai' },
  { to: '/settings', icon: 'settings', label: 'nav.settings' },
];
</script>

<template>
  <div class="ms-page">
    <div class="ms-page-header">
      <h1 class="ms-page-title">{{ t('nav.me') }}</h1>
    </div>
    <div class="ms-card list">
      <router-link v-for="item in items" :key="item.to" :to="item.to" class="row">
        <AppIcon :name="item.icon" />
        <span>{{ t(item.label) }}</span>
        <AppIcon name="chevronRight" :size="16" class="chev" />
      </router-link>
    </div>
  </div>
</template>

<style scoped>
.list {
  padding: 4px 0;
}
.row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 18px;
  color: inherit;
  text-decoration: none;
  border-bottom: 1px solid var(--ms-border);
}
.row:last-child {
  border-bottom: none;
}
.chev {
  margin-left: auto;
  color: var(--ms-text-3);
}
</style>
