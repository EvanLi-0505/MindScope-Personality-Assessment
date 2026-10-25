<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { NAlert, NButton, NEmpty, NSpin, useDialog, useMessage } from 'naive-ui';
import { B5_FORMS, MODE_IDS, localize, modeSummary, nextEntry, plannedCount, randomSeed, type B5FormId, type ModeId } from '@mindscope/core';
import type { StoredBank, StoredBigFive, StoredScale, UnfinishedSession } from '@mindscope/storage';
import { useAppStore } from '../stores/app';
import { useProfilesStore } from '../stores/profiles';
import { formatDate } from '../i18n';
import ProfileAvatar from '../components/ProfileAvatar.vue';
import AppIcon from '../components/AppIcon.vue';

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const dialog = useDialog();
const message = useMessage();
const app = useAppStore();
const store = useProfilesStore();

const DEFAULT_SECONDS_PER_ITEM = 9;

const bank = ref<StoredBank | null>(null);
/** Which kind of assessment is being started. */
const kind = ref<'mbti' | 'bigfive' | 'wellbeing'>('mbti');
const bigFive = ref<StoredBigFive | null>(null);
const b5Form = ref<B5FormId>('normal');
const scales = ref<StoredScale[]>([]);
const checkId = ref<string | null>(null);
const unfinished = ref<UnfinishedSession[]>([]);
const profileId = ref<string | null>(null);
const mode = ref<ModeId>('normal');
const secondsPerItem = ref(DEFAULT_SECONDS_PER_ITEM);
const starting = ref(false);

async function loadUnfinished() {
  unfinished.value = await app.r().sessions.listUnfinished();
}

onMounted(async () => {
  await store.refresh();
  await loadUnfinished();
  if (!app.bankError) {
    const id = await app.r().bank.latestVersionId('ms16');
    if (id) bank.value = await app.r().bank.load(id);
  }
  for (const v of await app.r().scales.latestVersions()) scales.value.push(await app.r().scales.load(v.versionId));
  const b5Id = await app.r().bigfive.latestVersionId();
  if (b5Id) bigFive.value = await app.r().bigfive.load(b5Id);
  const wantedCheck = route.query.check as string | undefined;
  if (wantedCheck && scales.value.some((s) => s.instrument === wantedCheck)) {
    kind.value = 'wellbeing';
    checkId.value = wantedCheck;
  } else if (route.query.kind === 'wellbeing') {
    kind.value = 'wellbeing';
  } else if (route.query.kind === 'bigfive') {
    kind.value = 'bigfive';
  }
  const wanted = route.query.profile as string | undefined;
  // Default to the requested card, else the oldest one (usually "me") —
  // but never override a card the user already picked while the page was loading.
  if (!profileId.value) {
    profileId.value = store.items.find((p) => p.id === wanted)?.id ?? store.items[store.items.length - 1]?.id ?? null;
  }
});

watch(profileId, async (id) => {
  if (!id) return;
  const avg = await app.r().sessions.averageAnswerMs(id);
  secondsPerItem.value = avg ? Math.min(30, Math.max(3, avg / 1000)) : DEFAULT_SECONDS_PER_ITEM;
});

const modes = computed(() => {
  const b = bank.value;
  if (!b) return [];
  return MODE_IDS.map((m) => {
    const s = modeSummary(b, m);
    return { id: m, ...s, minutes: Math.max(1, Math.round((s.total * secondsPerItem.value) / 60)) };
  });
});

const selectedScale = computed(() => scales.value.find((s) => s.instrument === checkId.value) ?? null);
const canStart = computed(
  () => !!profileId.value && (kind.value === 'mbti' ? !!bank.value : kind.value === 'bigfive' ? !!bigFive.value : !!selectedScale.value),
);
const b5Forms = computed(() =>
  bigFive.value
    ? B5_FORMS.map((f) => {
        const n = bigFive.value!.forms[f].entries.length;
        return { id: f, n, facets: bigFive.value!.forms[f].facets, minutes: Math.max(1, Math.round((n * Math.min(secondsPerItem.value, 10)) / 60)) };
      })
    : [],
);

/** Big Five forms are fixed lists, like the wellbeing checks, but use the shared answering page. */
async function startBigFive() {
  const b = bigFive.value;
  if (!b || !profileId.value) return;
  const sequence = b.forms[b5Form.value].entries.map((e) => ({ itemId: e.item, target: e.domain, reason: 'full' as const }));
  const s = await app.r().sessions.create({
    profileId: profileId.value,
    versionId: b.versionId,
    mode: b5Form.value,
    seed: 0,
    plannedCount: sequence.length,
    first: sequence[0]!,
    sequence,
  });
  app.p().log('info', `big five started (${b5Form.value})`);
  await router.push(`/test/${s.id}`);
}

/** Wellbeing questionnaires are fixed: every item is in the session from the start. */
async function startCheck() {
  const sc = selectedScale.value;
  if (!sc || !profileId.value) return;
  const sequence = sc.items.map((i) => ({ itemId: i.id, target: 'total' as const, reason: 'full' as const }));
  const s = await app.r().sessions.create({
    profileId: profileId.value,
    versionId: sc.versionId,
    mode: 'full',
    seed: 0,
    plannedCount: sc.items.length,
    first: sequence[0]!,
    sequence,
  });
  app.p().log('info', `check-in started (${sc.instrument})`);
  await router.push(`/check/${s.id}`);
}

function sessionLink(s: UnfinishedSession) {
  return s.kind === 'wellbeing' ? `/check/${s.id}` : `/test/${s.id}`;
}
function sessionLabel(s: UnfinishedSession) {
  if (s.kind === 'bigfive') return `${t('b5.short')} · ${t(`modes.${s.mode}.name`)}`;
  if (s.kind !== 'wellbeing') return t(`modes.${s.mode}.name`);
  const sc = scales.value.find((x) => x.instrument === s.instrument);
  return sc ? localize(sc.shortName, locale.value) : s.instrument;
}

async function start() {
  if (kind.value === 'wellbeing' || kind.value === 'bigfive') {
    starting.value = true;
    try {
      await (kind.value === 'wellbeing' ? startCheck() : startBigFive());
    } catch (err) {
      message.error(t('common.failed', { msg: err instanceof Error ? err.message : String(err) }));
    } finally {
      starting.value = false;
    }
    return;
  }
  const b = bank.value;
  if (!b || !profileId.value) return;
  starting.value = true;
  try {
    const seed = randomSeed();
    const first = nextEntry(b, mode.value, seed, [], {});
    if (!first) throw new Error('empty bank');
    const s = await app.r().sessions.create({
      profileId: profileId.value,
      versionId: b.versionId,
      mode: mode.value,
      seed,
      plannedCount: plannedCount(b, mode.value),
      first,
    });
    app.p().log('info', `test started (${mode.value})`);
    await router.push(`/test/${s.id}`);
  } catch (err) {
    message.error(t('common.failed', { msg: err instanceof Error ? err.message : String(err) }));
  } finally {
    starting.value = false;
  }
}

function abandon(s: UnfinishedSession) {
  dialog.warning({
    title: t('assess.abandon'),
    content: t('assess.abandonConfirm'),
    positiveText: t('assess.abandon'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      await app.r().sessions.abandon(s.id);
      await loadUnfinished();
    },
  });
}
</script>

<template>
  <div class="ms-page">
    <div class="ms-page-header">
      <h1 class="ms-page-title">{{ t('assess.title') }}</h1>
    </div>

    <n-alert v-if="app.bankError" type="error" class="block">{{ t('assess.bankError') }}</n-alert>

    <!-- unfinished -->
    <section v-if="unfinished.length" class="ms-card block">
      <h2 class="sec-title">{{ t('assess.unfinished') }}</h2>
      <p class="ms-subtle">{{ t('assess.unfinishedHint') }}</p>
      <div v-for="s in unfinished" :key="s.id" class="unfinished" data-testid="unfinished-row">
        <div class="u-text">
          <div class="u-name">{{ s.profileName }} · {{ sessionLabel(s) }}</div>
          <div class="ms-subtle">
            {{ t('assess.progress', { answered: s.answered, total: s.plannedCount }) }} · {{ t('assess.lastActive', { date: formatDate(s.updatedAt, true) }) }}
          </div>
          <div class="u-bar"><span :style="{ width: `${(s.answered / s.plannedCount) * 100}%` }" /></div>
        </div>
        <router-link :to="sessionLink(s)"><n-button type="primary" size="small">{{ t('assess.continue') }}</n-button></router-link>
        <n-button size="small" quaternary @click="abandon(s)">{{ t('assess.abandon') }}</n-button>
      </div>
    </section>

    <!-- step 1 -->
    <h2 class="step">1. {{ t('assess.step1') }}</h2>
    <div class="instruments">
      <button type="button" class="ms-card instrument" :class="{ active: kind === 'mbti' }" data-testid="kind-mbti" @click="kind = 'mbti'">
        <AppIcon name="assess" :size="26" />
        <div>
          <div class="i-name">{{ t('assess.mbtiName') }}</div>
          <div class="ms-subtle">{{ t('assess.mbtiDesc') }}</div>
        </div>
      </button>
      <button type="button" class="ms-card instrument" :class="{ active: kind === 'bigfive' }" data-testid="kind-bigfive" @click="kind = 'bigfive'">
        <AppIcon name="pentagon" :size="26" />
        <div>
          <div class="i-name">{{ t('b5.name') }}</div>
          <div class="ms-subtle">{{ t('b5.desc') }}</div>
        </div>
      </button>
      <button type="button" class="ms-card instrument" :class="{ active: kind === 'wellbeing' }" data-testid="kind-wellbeing" @click="kind = 'wellbeing'">
        <AppIcon name="shield" :size="26" />
        <div>
          <div class="i-name">{{ t('assess.wellbeingName') }}</div>
          <div class="ms-subtle">{{ t('assess.wellbeingDesc') }}</div>
        </div>
      </button>
    </div>

    <!-- step 2 -->
    <h2 class="step">2. {{ t('assess.step2') }}</h2>
    <n-empty v-if="store.loaded && !store.items.length" :description="t('assess.noProfile')" />
    <div class="people">
      <button
        v-for="p in [...store.items].reverse()"
        :key="p.id"
        type="button"
        class="person"
        :class="{ on: profileId === p.id }"
        data-testid="pick-profile"
        @click="profileId = p.id"
      >
        <ProfileAvatar :avatar="p.avatar" :size="34" />
        <span>{{ p.name }}</span>
      </button>
    </div>

    <!-- step 3 (wellbeing): pick a scale -->
    <template v-if="kind === 'wellbeing'">
      <h2 class="step">3. {{ t('check.pick') }}</h2>
      <div class="modes">
        <button
          v-for="sc in scales"
          :key="sc.instrument"
          type="button"
          class="ms-card mode"
          :class="{ on: checkId === sc.instrument }"
          :data-testid="`scale-${sc.instrument}`"
          @click="checkId = sc.instrument"
        >
          <div class="m-head">
            <span class="m-name">{{ localize(sc.shortName, locale) }}</span>
            <span class="m-rel" :class="{ quick: sc.status === 'experimental' }">{{ sc.status === 'published' ? t('check.validated') : t('check.experimental') }}</span>
          </div>
          <div class="m-desc ms-muted">{{ localize(sc.description, locale) }}</div>
          <div class="m-facts">
            <span>{{ t('check.items', { n: sc.items.length }) }}</span>
            <span>{{ t('check.minutes', { n: Math.max(1, Math.round((sc.items.length * 10) / 60)) }) }}</span>
          </div>
        </button>
      </div>
      <p class="ms-subtle bank-note">{{ t('check.notDiagnosis') }}</p>
    </template>

    <!-- step 3 (Big Five): pick a form -->
    <template v-if="kind === 'bigfive'">
      <h2 class="step">3. {{ t('assess.step3') }}</h2>
      <div class="modes">
        <button
          v-for="f in b5Forms"
          :key="f.id"
          type="button"
          class="ms-card mode"
          :class="{ on: b5Form === f.id }"
          :data-testid="`b5-form-${f.id}`"
          @click="b5Form = f.id"
        >
          <div class="m-head">
            <span class="m-name">{{ t(`modes.${f.id}.name`) }}</span>
            <span class="m-rel quick">{{ t('b5.preview') }}</span>
          </div>
          <div class="m-desc ms-muted">{{ t(`b5.form.${f.id}`) }}</div>
          <div class="m-facts">
            <span>{{ t('assess.items', { n: f.n }) }}</span>
            <span>{{ t('assess.minutes', { n: f.minutes }) }}</span>
            <span v-if="f.facets">{{ t('b5.facetsIncluded') }}</span>
          </div>
        </button>
      </div>
      <p class="ms-subtle bank-note">{{ t('b5.previewNote') }}</p>
    </template>

    <!-- step 3 (16-type): pick a mode -->
    <h2 v-if="kind === 'mbti'" class="step">3. {{ t('assess.step3') }}</h2>
    <n-spin v-if="kind === 'mbti' && !bank && !app.bankError" />
    <div v-if="kind === 'mbti'" class="modes">
      <button
        v-for="m in modes"
        :key="m.id"
        type="button"
        class="ms-card mode"
        :class="{ on: mode === m.id }"
        :data-testid="`mode-${m.id}`"
        @click="mode = m.id"
      >
        <div class="m-head">
          <span class="m-name">{{ t(`modes.${m.id}.name`) }}</span>
          <span class="m-rel" :class="m.id">{{ t(`modes.${m.id}.reliability`) }}</span>
        </div>
        <div class="m-desc ms-muted">{{ t(`modes.${m.id}.desc`) }}</div>
        <div class="m-facts">
          <span>{{ t('assess.items', { n: m.total }) }}</span>
          <span>{{ t('assess.minutes', { n: m.minutes }) }}</span>
          <span>{{ m.adaptive ? t('assess.adaptive') : t('assess.allItems') }}</span>
        </div>
      </button>
    </div>
    <p v-if="kind === 'mbti' && bank" class="ms-subtle bank-note">
      {{ t('assess.bankNote', { title: localize(bank.title, locale), version: bank.version }) }}
    </p>

    <div class="start">
      <n-button
        type="primary"
        size="large"
        :disabled="!canStart"
        :loading="starting"
        data-testid="start-test"
        @click="start"
      >
        {{ starting ? t('assess.starting') : t('assess.start') }}
      </n-button>
    </div>
  </div>
</template>

<style scoped>
.block {
  margin-bottom: 18px;
}
.sec-title {
  font-size: 1.05rem;
}
.unfinished {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 0;
  border-top: 1px solid var(--ms-border);
}
.u-text {
  flex: 1;
  min-width: 0;
}
.u-name {
  font-weight: 600;
}
.u-bar {
  height: 4px;
  border-radius: 999px;
  background: var(--ms-surface-2);
  margin-top: 6px;
  overflow: hidden;
  max-width: 320px;
}
.u-bar span {
  display: block;
  height: 100%;
  background: var(--ms-gradient);
}
.step {
  font-size: 1.05rem;
  margin: 24px 0 12px;
}
.instruments {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}
.instrument {
  font: inherit;
  text-align: left;
  cursor: pointer;
  border: 2px solid var(--ms-border);
  display: flex;
  gap: 14px;
  align-items: flex-start;
  color: var(--ms-brand);
}
.instrument.active {
  border: 2px solid var(--ms-brand);
}
.instrument.disabled {
  opacity: 0.55;
  color: var(--ms-text-3);
}
.i-name {
  font-weight: 700;
  color: var(--ms-text);
}
.soon {
  font-size: 0.72rem;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--ms-surface-2);
  color: var(--ms-text-3);
  margin-left: 6px;
}
.people {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.person {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 6px 16px 6px 6px;
  border-radius: 999px;
  border: 1.5px solid var(--ms-border);
  background: var(--ms-surface);
  color: var(--ms-text);
  font: inherit;
  cursor: pointer;
}
.person.on {
  border-color: var(--ms-brand);
  background: color-mix(in srgb, var(--ms-brand) 10%, var(--ms-surface));
  font-weight: 600;
}
.modes {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}
.mode {
  text-align: left;
  font: inherit;
  color: inherit;
  cursor: pointer;
  border: 2px solid var(--ms-border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.mode.on {
  border-color: var(--ms-brand);
  background: color-mix(in srgb, var(--ms-brand) 6%, var(--ms-surface));
}
.m-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
}
.m-head {
  flex-wrap: wrap;
}
.m-name {
  font-weight: 700;
  font-size: 1.05rem;
  white-space: nowrap;
}
.m-rel {
  font-size: 0.72rem;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--ms-surface-2);
  color: var(--ms-text-2);
  white-space: nowrap;
}
.m-rel.quick {
  background: color-mix(in srgb, #e09a3e 18%, transparent);
  color: #9a5d12;
}
.m-desc {
  font-size: 0.875rem;
  min-height: 2.6em;
}
.m-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  font-size: 0.82rem;
  color: var(--ms-brand);
  font-weight: 600;
}
.bank-note {
  margin-top: 12px;
}
.start {
  margin-top: 22px;
  display: flex;
  justify-content: flex-end;
}
@media (max-width: 960px) {
  .modes {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 560px) {
  .modes,
  .instruments {
    grid-template-columns: 1fr;
  }
  .start :deep(.n-button) {
    width: 100%;
  }
}
</style>
