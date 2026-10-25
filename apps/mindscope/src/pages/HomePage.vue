<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { NButton } from 'naive-ui';
import type { Overview, UnfinishedSession } from '@mindscope/storage';
import { useAppStore } from '../stores/app';
import { useProfilesStore } from '../stores/profiles';
import { formatDate } from '../i18n';
import ProfileAvatar from '../components/ProfileAvatar.vue';
import AppIcon from '../components/AppIcon.vue';

const { t } = useI18n();
const app = useAppStore();
const store = useProfilesStore();
const overview = ref<Overview | null>(null);
const unfinished = ref<UnfinishedSession[]>([]);

onMounted(async () => {
  await store.refresh();
  overview.value = await app.r().stats.overview();
  unfinished.value = (await app.r().sessions.listUnfinished()).slice(0, 3);
});

// The oldest card is usually "me" (created during onboarding).
const firstName = computed(() => store.items[store.items.length - 1]?.name);
const recent = computed(() => store.items.slice(0, 4));

const cards = computed(() => {
  const o = overview.value;
  const last = o?.lastResult;
  return [
    { id: 'profiles', value: o?.profiles ?? '–', label: t('home.profiles'), to: '/profiles' },
    { id: 'completed', value: o?.completedTests ?? '–', label: t('home.completed'), to: o?.completedTests ? '/history' : null },
    { id: 'in-progress', value: o?.inProgressTests ?? '–', label: t('home.inProgress'), to: o?.inProgressTests ? '/assess' : null },
    {
      id: 'last',
      value: o?.lastTestAt ? formatDate(o.lastTestAt) : t('home.never'),
      label: t('home.lastTest'),
      to: last ? (last.kind === 'wellbeing' ? `/wellbeing/${last.id}` : last.kind === 'bigfive' ? `/b5/${last.id}` : `/results/${last.id}`) : null,
      small: true,
    },
  ];
});
</script>

<template>
  <div class="ms-page">
    <section class="hero ms-card">
      <div>
        <h1>{{ firstName ? t('home.greeting', { name: firstName }) : t('home.greetingAnon') }}</h1>
        <p class="ms-muted">{{ t('home.heroHint') }}</p>
      </div>
      <div class="hero-actions">
        <router-link to="/assess">
          <n-button type="primary" size="large" data-testid="home-start">
            <template #icon><AppIcon name="assess" /></template>
            {{ t('home.startAssess') }}
          </n-button>
        </router-link>
        <router-link to="/profiles">
          <n-button size="large">{{ t('home.manageProfiles') }}</n-button>
        </router-link>
      </div>
    </section>

    <section v-if="unfinished.length" class="ms-card resume">
      <div class="resume-title"><AppIcon name="history" /> {{ t('homeExtra.continueTest') }}</div>
      <router-link v-for="s in unfinished" :key="s.id" :to="s.kind === 'wellbeing' ? `/check/${s.id}` : `/test/${s.id}`" class="resume-row" data-testid="resume-row">
        <span>{{ s.profileName }} · {{ s.kind === 'wellbeing' ? t('assess.wellbeingName') : s.kind === 'bigfive' ? `${t('b5.short')} · ${t(`modes.${s.mode}.name`)}` : t(`modes.${s.mode}.name`) }}</span>
        <span class="ms-subtle">{{ t('assess.progress', { answered: s.answered, total: s.plannedCount }) }}</span>
        <AppIcon name="chevronRight" :size="16" />
      </router-link>
    </section>

    <h2 class="section-title">{{ t('home.overview') }}</h2>
    <div class="stats">
      <!-- Each card opens the matching page; a card with nothing behind it is not a link. -->
      <component
        :is="c.to ? RouterLink : 'div'"
        v-for="c in cards"
        :key="c.id"
        :to="c.to ?? undefined"
        class="ms-card stat"
        :class="{ link: !!c.to }"
        :data-testid="`stat-${c.id}`"
      >
        <div class="stat-value" :class="{ small: c.small }">{{ c.value }}</div>
        <div class="ms-subtle stat-label">
          {{ c.label }}
          <AppIcon v-if="c.to" name="chevronRight" :size="14" class="chev" />
        </div>
      </component>
    </div>

    <h2 class="section-title">{{ t('home.recent') }}</h2>
    <div class="recent">
      <router-link v-for="p in recent" :key="p.id" :to="`/profiles/${p.id}`" class="ms-card person">
        <ProfileAvatar :avatar="p.avatar" :size="40" />
        <div class="person-text">
          <div class="person-name">{{ p.name }}</div>
          <div class="ms-subtle">{{ p.tags.map((tg) => tg.name).join(' · ') || formatDate(p.createdAt) }}</div>
        </div>
      </router-link>
    </div>
  </div>
</template>

<style scoped>
.hero {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
  padding: 28px;
  background:
    linear-gradient(120deg, color-mix(in srgb, var(--ms-brand-2) 14%, transparent), color-mix(in srgb, var(--ms-accent) 12%, transparent)),
    var(--ms-surface);
}
.hero h1 {
  font-size: 1.6rem;
  margin-bottom: 6px;
}
.hero-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.resume {
  margin-top: 16px;
  padding: 14px 20px;
  border-left: 4px solid #e09a3e;
}
.resume-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  margin-bottom: 6px;
}
.resume-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  color: inherit;
  text-decoration: none;
  border-top: 1px solid var(--ms-border);
}
.resume-row span:first-child {
  flex: 1;
  font-weight: 500;
}
.section-title {
  font-size: 1.05rem;
  margin: 28px 0 12px;
}
.stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}
.stat-value {
  font-size: 1.8rem;
  font-weight: 800;
  color: var(--ms-brand);
}
.stat-value.small {
  font-size: 1.1rem;
  padding: 8px 0;
}
.stat {
  display: block;
  color: inherit;
  text-decoration: none;
}
.stat.link {
  cursor: pointer;
  transition:
    border-color 0.15s,
    transform 0.15s;
}
.stat.link:hover {
  border-color: var(--ms-brand);
  transform: translateY(-1px);
}
.stat.link:focus-visible {
  outline: 2px solid var(--ms-brand);
  outline-offset: 2px;
}
.stat-label {
  display: flex;
  align-items: center;
  gap: 4px;
}
.chev {
  opacity: 0.6;
}
@media (prefers-reduced-motion: reduce) {
  .stat.link:hover {
    transform: none;
  }
}
.recent {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}
.person {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  text-decoration: none;
  color: inherit;
}
.person-name {
  font-weight: 600;
}
.person-text {
  min-width: 0;
}
.person-text .ms-subtle {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
@media (max-width: 768px) {
  .stats {
    grid-template-columns: repeat(2, 1fr);
  }
  .hero {
    padding: 20px;
  }
}
</style>
