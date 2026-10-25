<script setup lang="ts">
/** Big Five on the person card: latest result and, with two or more, the trend. */
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { NButton } from 'naive-ui';
import type { StoredBigFiveResult } from '@mindscope/storage';
import { useAppStore } from '../../stores/app';
import { formatDate } from '../../i18n';
import BigFiveRadar from './BigFiveRadar.vue';
import DomainRows from './DomainRows.vue';
import BigFiveTrendChart from '../charts/BigFiveTrendChart.vue';
import { useBigFiveText } from './useBigFiveText';

const props = defineProps<{ profileId: string }>();
const { t } = useI18n();
const app = useAppStore();
const { names } = useBigFiveText();
const results = ref<StoredBigFiveResult[]>([]);
const loaded = ref(false);

onMounted(async () => {
  results.value = await app.r().bigfive.list({ profileIds: [props.profileId] });
  loaded.value = true;
});
</script>

<template>
  <section class="ms-card b5-section" data-testid="b5-section">
    <div class="head">
      <h2>{{ t('b5.section') }} <span class="preview">{{ t('b5.preview') }}</span></h2>
      <router-link :to="`/assess?profile=${profileId}&kind=bigfive`" class="ms-no-print">
        <n-button size="small">{{ t('b5.start') }}</n-button>
      </router-link>
    </div>
    <p class="ms-subtle">{{ t('b5.sectionHint') }}</p>
    <p v-if="loaded && !results.length" class="ms-muted">{{ t('b5.none') }}</p>
    <template v-if="results[0]">
      <router-link :to="`/b5/${results[0].id}`" class="latest" data-testid="b5-latest">
        {{ t('b5.latest', { date: formatDate(results[0].createdAt, true), form: t(`modes.${results[0].form}.name`) }) }}
      </router-link>
      <div class="two">
        <BigFiveRadar :sets="[{ name: '', domains: results[0].result.domains }]" :names="names" :height="260" />
        <DomainRows :domains="results[0].result.domains" compact />
      </div>
      <template v-if="results.length >= 2">
        <h3>{{ t('b5.trend') }}</h3>
        <p class="ms-subtle">{{ t('b5.trendHint') }}</p>
        <BigFiveTrendChart :results="results" />
      </template>
    </template>
  </section>
</template>

<style scoped>
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}
.head h2 {
  font-size: 1.1rem;
}
.head a {
  text-decoration: none;
}
.preview {
  font-size: 0.72rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  margin-left: 6px;
  vertical-align: middle;
  background: color-mix(in srgb, #e09a3e 18%, transparent);
  color: #9a5d12;
}
.latest {
  display: inline-block;
  margin: 4px 0;
  color: var(--ms-brand);
  text-decoration: none;
  font-weight: 600;
}
.two {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
  gap: 16px;
  align-items: center;
  break-inside: avoid;
}
h3 {
  font-size: 1rem;
  margin: 14px 0 2px;
}
@media (max-width: 760px) {
  .two {
    grid-template-columns: 1fr;
  }
}
</style>
