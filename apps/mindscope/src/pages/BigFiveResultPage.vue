<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { NAlert, NButton, NCollapse, NCollapseItem, NSpin } from 'naive-ui';
import { B5_DOMAINS, localize, type Profile } from '@mindscope/core';
import type { StoredBigFive, StoredBigFiveResult } from '@mindscope/storage';
import { useAppStore } from '../stores/app';
import { formatDate } from '../i18n';
import ProfileAvatar from '../components/ProfileAvatar.vue';
import AppIcon from '../components/AppIcon.vue';
import BigFiveRadar from '../components/bigfive/BigFiveRadar.vue';
import DomainRows from '../components/bigfive/DomainRows.vue';
import FacetTable from '../components/bigfive/FacetTable.vue';
import { useBigFiveText } from '../components/bigfive/useBigFiveText';

const props = defineProps<{ id: string }>();
const { t, tm, rt, locale } = useI18n();
const app = useAppStore();
const { domainText, names } = useBigFiveText();

const stored = ref<StoredBigFiveResult | null>(null);
const bank = ref<StoredBigFive | null>(null);
const profile = ref<Profile | null>(null);
const loaded = ref(false);

onMounted(async () => {
  stored.value = await app.r().bigfive.get(props.id);
  if (stored.value) {
    bank.value = await app.r().bigfive.load(stored.value.versionId);
    profile.value = await app.r().profiles.get(stored.value.profileId);
  }
  loaded.value = true;
});

const r = computed(() => stored.value?.result ?? null);
function duration(ms: number) {
  const m = Math.round(ms / 60000);
  return m < 1 ? `${Math.round(ms / 1000)}s` : `${m} min`;
}
const metaLine = computed(() => {
  const s = stored.value;
  if (!s) return '';
  return t('b5.meta', {
    form: t(`modes.${s.form}.name`),
    date: formatDate(s.createdAt, true),
    answered: s.result.answered,
    total: s.result.total,
    duration: duration(s.meta.elapsedMs),
  });
});
/** Only clearly high or low domains get a tip. */
const tips = computed(() =>
  r.value
    ? B5_DOMAINS.filter((d) => r.value!.domains[d].band && r.value!.domains[d].band !== 'mid').map((d) => ({
        d,
        band: r.value!.domains[d].band!,
        text: r.value!.domains[d].band === 'high' ? domainText(d).getAlongHigh : domainText(d).getAlongLow,
      }))
    : [],
);
const limitations = computed(() => (tm('b5.limitationList') as unknown[]).map((m) => rt(m as never)));
const fmt = (v: number | null, d = 2) => (v == null ? '—' : v.toFixed(d));
const adaptedList = computed(() =>
  (bank.value?.items ?? [])
    .filter((i) => i.adapted)
    .map((i) => `“${localize(i.text, locale.value)}”`)
    .join('、'),
);
</script>

<template>
  <div class="ms-page b5-page">
    <n-spin v-if="!loaded" />
    <div v-else-if="!stored || !r" class="ms-card">{{ t('b5.notFound') }}</div>

    <template v-else>
      <section class="ms-card hero">
        <div class="who">
          <ProfileAvatar v-if="profile" :avatar="profile.avatar" :size="40" />
          <div>
            <div class="who-name">{{ stored.profileName }}</div>
            <div class="ms-subtle">{{ metaLine }}</div>
          </div>
        </div>
        <h1 class="ms-page-title title" data-testid="b5-title">{{ t('b5.title') }}</h1>
        <div class="chips">
          <span class="chip warn">{{ t('b5.preview') }}</span>
          <span class="chip">{{ stored.versionId }} · {{ r.engine }}</span>
        </div>
        <div class="actions ms-no-print">
          <router-link :to="`/report/bigfive/${stored.id}`">
            <n-button type="primary" data-testid="b5-open-report"><template #icon><AppIcon name="file" /></template>{{ t('b5.export') }}</n-button>
          </router-link>
          <router-link :to="`/assess?profile=${stored.profileId}&kind=bigfive`"><n-button>{{ t('b5.retake') }}</n-button></router-link>
          <router-link :to="`/profiles/${stored.profileId}`"><n-button quaternary>{{ t('b5.backToProfile') }}</n-button></router-link>
        </div>
      </section>

      <n-alert type="info" class="gap" data-testid="b5-preview-note">{{ t('b5.previewNote') }}</n-alert>

      <div class="two">
        <section class="ms-card">
          <h2>{{ t('b5.radar') }}</h2>
          <BigFiveRadar :sets="[{ name: stored.profileName, domains: r.domains }]" :names="names" :height="330" />
          <p class="ms-subtle">{{ t('b5.bandHint') }}</p>
        </section>
        <section class="ms-card">
          <h2>{{ t('b5.domains') }}</h2>
          <DomainRows :domains="r.domains" />
        </section>
      </div>

      <section v-if="r.facets" class="ms-card gap">
        <h2>{{ t('b5.facets') }}</h2>
        <p class="ms-subtle">{{ t('b5.facetsHint') }}</p>
        <FacetTable :facets="r.facets" />
      </section>

      <section class="ms-card gap" data-testid="b5-get-along">
        <h2>{{ t('b5.getAlong') }}</h2>
        <p class="ms-subtle">{{ t('b5.getAlongHint') }}</p>
        <ul v-if="tips.length">
          <li v-for="tip in tips" :key="tip.d">
            <b>{{ domainText(tip.d).name }}{{ t(`b5.band.${tip.band}`) }}：</b>{{ tip.text }}
          </li>
        </ul>
        <p v-else class="ms-muted">{{ t('b5.getAlongNone') }}</p>
      </section>

      <section class="ms-card gap">
        <h2>{{ t('b5.limitations') }}</h2>
        <ul class="muted-list">
          <li v-for="l in limitations" :key="l">{{ l }}</li>
        </ul>
      </section>

      <section class="ms-card gap">
        <n-collapse>
          <n-collapse-item :title="t('b5.method')" name="method">
            <p>{{ t('b5.methodText') }}</p>
            <ul>
              <li v-for="d in B5_DOMAINS" :key="d">
                {{ t('b5.methodLine', { dim: domainText(d).name, mean: fmt(r.domains[d].mean), se: fmt(r.domains[d].se), n: r.domains[d].answered, total: r.domains[d].total }) }}
              </li>
            </ul>
          </n-collapse-item>
          <n-collapse-item v-if="bank" :title="t('b5.about')" name="about">
            <p>{{ localize(bank.description, locale) }}</p>
            <p><b>{{ t('wb.source') }}：</b>{{ localize(bank.source, locale) }}</p>
            <p><b>{{ t('wb.license') }}：</b>{{ localize(bank.licenseNote, locale) }}</p>
            <p><b>{{ t('wb.translation') }}：</b>{{ localize(bank.translationNote, locale) }}</p>
            <p v-if="r.facets && adaptedList">{{ t('b5.adaptedNote', { list: adaptedList }) }}</p>
            <p><b>{{ t('wb.citation') }}：</b></p>
            <ul class="cites">
              <li v-for="c in bank.citations" :key="c">{{ c }}</li>
            </ul>
          </n-collapse-item>
        </n-collapse>
      </section>
    </template>
  </div>
</template>

<style scoped>
.b5-page h2 {
  font-size: 1.1rem;
  margin-bottom: 6px;
}
.gap {
  margin-top: 16px;
}
.hero {
  background:
    linear-gradient(120deg, color-mix(in srgb, var(--ms-brand-2) 12%, transparent), color-mix(in srgb, var(--ms-accent) 10%, transparent)),
    var(--ms-surface);
}
.who {
  display: flex;
  align-items: center;
  gap: 12px;
}
.who-name {
  font-weight: 700;
}
.title {
  margin: 14px 0 8px;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.chip {
  font-size: 0.75rem;
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--ms-surface-2);
  color: var(--ms-text-2);
}
.chip.warn {
  background: color-mix(in srgb, #e09a3e 18%, transparent);
  color: #9a5d12;
}
.actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 16px;
}
.actions a {
  text-decoration: none;
}
.two {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-top: 16px;
}
ul {
  padding-left: 20px;
}
li {
  margin: 4px 0;
  line-height: 1.65;
}
.muted-list {
  color: var(--ms-text-2);
}
.cites {
  font-size: 0.85rem;
}
@media (max-width: 900px) {
  .two {
    grid-template-columns: 1fr;
  }
}
</style>
