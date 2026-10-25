<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { NAlert } from 'naive-ui';
import AppIcon from '../components/AppIcon.vue';
import BrandMark from '../components/BrandMark.vue';
import { useAppStore } from '../stores/app';

const { t } = useI18n();
const route = useRoute();
const app = useAppStore();

const sideItems = [
  { to: '/', icon: 'home', label: 'nav.home' },
  { to: '/profiles', icon: 'users', label: 'nav.profiles' },
  { to: '/assess', icon: 'assess', label: 'nav.assess' },
  { to: '/history', icon: 'history', label: 'nav.history' },
  { to: '/bank', icon: 'bank', label: 'nav.bank' },
  { to: '/data', icon: 'data', label: 'nav.data' },
  { to: '/ai', icon: 'sparkle', label: 'nav.ai' },
  { to: '/settings', icon: 'settings', label: 'nav.settings' },
];

const tabItems = [
  { to: '/', icon: 'home', label: 'nav.home' },
  { to: '/profiles', icon: 'users', label: 'nav.profiles' },
  { to: '/assess', icon: 'assess', label: 'nav.assess' },
  { to: '/history', icon: 'history', label: 'nav.history' },
  { to: '/more', icon: 'more', label: 'nav.me', also: ['/bank', '/data', '/ai', '/settings', '/diagnostics'] },
];

function isActive(to: string, also: string[] = []) {
  const path = route.path;
  if (to === '/') return path === '/';
  if (to === '/assess' && ['/test/', '/results/', '/b5/', '/check/', '/wellbeing/'].some((p) => path.startsWith(p))) return true;
  if (to === '/history' && path.startsWith('/compare')) return true;
  return path === to || path.startsWith(`${to}/`) || also.some((a) => path.startsWith(a));
}

const offlineLabel = computed(() => (app.platform?.kind === 'desktop' ? 'Offline · Desktop' : 'Offline · Web'));
</script>

<template>
  <div class="shell">
    <aside class="sidebar ms-no-print">
      <router-link to="/" class="brand">
        <BrandMark :size="34" />
        <div>
          <div class="brand-name">MindScope</div>
          <div class="brand-tag">{{ t('app.tagline') }}</div>
        </div>
      </router-link>
      <nav class="side-nav">
        <router-link
          v-for="item in sideItems"
          :key="item.to"
          :to="item.to"
          class="side-link"
          :class="{ active: isActive(item.to) }"
        >
          <AppIcon :name="item.icon" />
          <span>{{ t(item.label) }}</span>
        </router-link>
      </nav>
      <div class="side-foot">
        <AppIcon name="wifiOff" :size="15" />
        <span>{{ offlineLabel }}</span>
      </div>
    </aside>

    <main class="content">
      <n-alert v-if="!app.durable" type="warning" class="ms-no-print memory-alert" :show-icon="true">
        {{ t('boot.memoryOnly') }}
      </n-alert>
      <slot />
    </main>

    <nav v-if="!route.meta.focus" class="tabbar ms-no-print">
      <router-link
        v-for="item in tabItems"
        :key="item.to"
        :to="item.to"
        class="tab"
        :class="{ active: isActive(item.to, item.also) }"
      >
        <AppIcon :name="item.icon" :size="22" />
        <span>{{ t(item.label) }}</span>
      </router-link>
    </nav>
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  min-height: 100vh;
}
.sidebar {
  position: sticky;
  top: 0;
  height: 100vh;
  width: var(--ms-sidebar-w);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  padding: 20px 14px;
  background: var(--ms-surface);
  border-right: 1px solid var(--ms-border);
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 8px 22px;
  text-decoration: none;
  color: inherit;
}
.brand-name {
  font-weight: 800;
  font-size: 1.1rem;
  letter-spacing: 0.01em;
}
.brand-tag {
  font-size: 0.75rem;
  color: var(--ms-text-3);
}
.side-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.side-link {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--ms-radius-sm);
  color: var(--ms-text-2);
  text-decoration: none;
  font-weight: 500;
  transition: background 0.15s, color 0.15s;
}
.side-link:hover {
  background: var(--ms-surface-2);
  color: var(--ms-text);
}
.side-link.active {
  background: color-mix(in srgb, var(--ms-brand) 12%, transparent);
  color: var(--ms-brand);
  font-weight: 600;
}
.side-foot {
  margin-top: auto;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  font-size: 0.75rem;
  color: var(--ms-text-3);
}
.content {
  flex: 1;
  min-width: 0;
}
.memory-alert {
  margin: 16px 28px 0;
}
.tabbar {
  display: none;
}

@media (max-width: 768px) {
  .sidebar {
    display: none;
  }
  .memory-alert {
    margin: 12px 16px 0;
  }
  .tabbar {
    display: flex;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: calc(var(--ms-tabbar-h) + env(safe-area-inset-bottom));
    padding-bottom: env(safe-area-inset-bottom);
    background: var(--ms-surface);
    border-top: 1px solid var(--ms-border);
    z-index: 20;
  }
  .tab {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    font-size: 0.7rem;
    color: var(--ms-text-3);
    text-decoration: none;
  }
  .tab.active {
    color: var(--ms-brand);
    font-weight: 600;
  }
}
</style>
