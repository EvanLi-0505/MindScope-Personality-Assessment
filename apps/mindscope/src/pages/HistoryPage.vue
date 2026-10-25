<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { NButton, NDatePicker, NEmpty, NSelect, NSpin } from 'naive-ui';
import { MODE_IDS, summarizeHistory, type ModeId } from '@mindscope/core';
import type { ResultWithProfile, StoredBigFiveResult, StoredScaleResult } from '@mindscope/storage';
import { useAppStore } from '../stores/app';
import { useProfilesStore } from '../stores/profiles';
import { useResultActions } from '../composables/useResultActions';
import ResultTable from '../components/ResultTable.vue';
import WellbeingTable from '../components/wellbeing/WellbeingTable.vue';
import BigFiveTable from '../components/bigfive/BigFiveTable.vue';
import SimpleBar from '../components/charts/SimpleBar.vue';
import { SERIES_COLORS } from '../components/charts/palette';

const { t } = useI18n();
const app = useAppStore();
const store = useProfilesStore();
const { confirmDelete } = useResultActions();

const loaded = ref(false);
const anyResults = ref(false);
const results = ref<ResultWithProfile[]>([]);
const wbResults = ref<StoredScaleResult[]>([]);
const b5Results = ref<StoredBigFiveResult[]>([]);
const people = ref<string[]>([]);
const modes = ref<ModeId[]>([]);
const range = ref<[number, number] | null>(null);
const selected = ref<string[]>([]);

async function load() {
  const [from, to] = range.value ?? [null, null];
  results.value = await app.r().results.list({
    profileIds: people.value.length ? people.value : undefined,
    modes: modes.value.length ? modes.value : undefined,
    from: from != null ? new Date(from).toISOString() : undefined,
    // The picker gives the start of the last day; include that whole day.
    to: to != null ? new Date(to + 86_400_000).toISOString() : undefined,
  });
  // Wellbeing records follow the person and date filters (modes do not apply to them).
  wbResults.value = (await app.r().scales.list({ profileIds: people.value.length ? people.value : undefined })).filter(
    (r) => (from == null || r.createdAt >= new Date(from).toISOString()) && (to == null || r.createdAt < new Date(to + 86_400_000).toISOString()),
  );
  // Big Five follows the person, mode and date filters.
  b5Results.value = (await app.r().bigfive.list({ profileIds: people.value.length ? people.value : undefined })).filter(
    (r) =>
      (!modes.value.length || modes.value.includes(r.form)) &&
      (from == null || r.createdAt >= new Date(from).toISOString()) &&
      (to == null || r.createdAt < new Date(to + 86_400_000).toISOString()),
  );
  if (!people.value.length && !modes.value.length && !range.value) anyResults.value = results.value.length + wbResults.value.length + b5Results.value.length > 0;
  selected.value = selected.value.filter((id) => results.value.some((r) => r.id === id));
  loaded.value = true;
}

onMounted(async () => {
  await store.refresh();
  await load();
});
watch([people, modes, range], load, { deep: true });

function reset() {
  people.value = [];
  modes.value = [];
  range.value = null;
}

const peopleOptions = computed(() => [...store.items].reverse().map((p) => ({ value: p.id, label: p.name })));
const modeOptions = computed(() => MODE_IDS.map((m) => ({ value: m, label: t(`modes.${m}.name`) })));
const summary = computed(() => summarizeHistory(results.value));
</script>

<template>
  <div class="ms-page">
    <div class="ms-page-header">
      <h1 class="ms-page-title">{{ t('history.title') }}</h1>
    </div>

    <n-spin v-if="!loaded" />

    <section v-else-if="!anyResults" class="ms-card empty">
      <n-empty :description="t('history.emptyAll')">
        <template #extra>
          <router-link to="/assess"><n-button type="primary">{{ t('home.startAssess') }}</n-button></router-link>
        </template>
      </n-empty>
    </section>

    <template v-else>
      <section class="ms-card filters ms-no-print">
        <n-select v-model:value="people" multiple clearable :options="peopleOptions" :placeholder="t('history.allPeople')" class="f-people" data-testid="filter-people" />
        <n-select v-model:value="modes" multiple clearable :options="modeOptions" :placeholder="t('detail.allModes')" class="f-modes" data-testid="filter-modes" />
        <n-date-picker v-model:value="range" type="daterange" clearable class="f-range" />
        <n-button quaternary @click="reset">{{ t('history.reset') }}</n-button>
        <span class="total" data-testid="history-total">{{ t('history.total', { n: summary.total + wbResults.length + b5Results.length }) }}</span>
      </section>

      <p v-if="!results.length && !wbResults.length && !b5Results.length" class="ms-muted empty-filter">{{ t('history.empty') }}</p>

      <section v-if="b5Results.length" class="ms-card gap" data-testid="b5-history">
        <h2>{{ t('b5.list') }}</h2>
        <p class="ms-subtle">{{ t('b5.sectionHint') }}</p>
        <BigFiveTable :results="b5Results" @delete="(r) => confirmDelete(r, load)" />
      </section>

      <section v-if="wbResults.length" class="ms-card gap" data-testid="wb-history">
        <h2>{{ t('wb.list') }}</h2>
        <p class="ms-subtle">{{ t('wb.sectionHint') }}</p>
        <WellbeingTable :results="wbResults" @delete="(r) => confirmDelete(r, load)" />
      </section>

      <template v-if="results.length">
        <div class="charts">
          <section class="ms-card">
            <h2>{{ t('history.typeDist') }}</h2>
            <SimpleBar
              :categories="summary.types.map((x) => x.code)"
              :values="summary.types.map((x) => x.count)"
              :height="Math.max(160, 40 + summary.types.length * 26)"
              horizontal
            />
          </section>
          <section class="ms-card">
            <h2>{{ t('history.perMonth') }}</h2>
            <SimpleBar :categories="summary.months.map((x) => x.month)" :values="summary.months.map((x) => x.count)" :color="SERIES_COLORS[1]" :height="220" />
          </section>
          <section v-if="summary.perProfile.length > 1" class="ms-card">
            <h2>{{ t('history.perPerson') }}</h2>
            <SimpleBar
              :categories="summary.perProfile.map((x) => x.name)"
              :values="summary.perProfile.map((x) => x.count)"
              :color="SERIES_COLORS[2]"
              :height="Math.max(160, 40 + summary.perProfile.length * 28)"
              horizontal
            />
          </section>
        </div>

        <section class="ms-card gap">
          <h2>{{ t('history.list') }}</h2>
          <ResultTable v-model:selected="selected" :results="results" show-person @delete="(r) => confirmDelete(r, load)" />
        </section>
      </template>
    </template>
  </div>
</template>

<style scoped>
h2 {
  font-size: 1.05rem;
  margin-bottom: 6px;
}
.gap {
  margin-top: 16px;
}
.empty {
  padding: 48px 20px;
}
.empty a {
  text-decoration: none;
}
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  padding: 14px 16px;
}
.f-people {
  width: 240px;
}
.f-modes {
  width: 220px;
}
.f-range {
  width: 280px;
}
.total {
  margin-left: auto;
  font-weight: 600;
  color: var(--ms-brand);
}
.empty-filter {
  margin: 24px 4px;
}
.charts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
  margin-top: 16px;
}
@media (max-width: 640px) {
  .f-people,
  .f-modes,
  .f-range {
    width: 100%;
  }
  .total {
    margin-left: 0;
  }
}
</style>
