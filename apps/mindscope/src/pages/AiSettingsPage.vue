<script setup lang="ts">
/**
 * AI settings. Nothing here reaches the network except "Test connection",
 * which asks first. The key goes to the platform and never comes back.
 */
import { computed, h, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { NAlert, NAutoComplete, NButton, NInput, NInputNumber, NRadio, NRadioGroup, NSelect, NSlider, NSpin, NSwitch, useDialog, useMessage } from 'naive-ui';
import type { NetworkUsage } from '@mindscope/storage';
import { useAppStore } from '../stores/app';
import { formatDate } from '../i18n';
import { AI_PROVIDERS, checkBaseUrl, hostOf, type AiConfig, type AiProviderId } from '../ai/config';
import { newRequestId, useAiConfig } from '../ai/useAiConfig';
import { aiErrorText } from '../ai/errors';
import { AiCallError, type AiKeyStatus } from '../platform';
import AppIcon from '../components/AppIcon.vue';

const { t } = useI18n();
const app = useAppStore();
const dialog = useDialog();
const message = useMessage();
const bridge = app.p().ai;
const { config, load, save } = useAiConfig();

const draft = ref<AiConfig>({ ...config.value });
const keyStatus = ref<AiKeyStatus | null>(null);
const keyInput = ref('');
const persistKey = ref(true);
const usage = ref<NetworkUsage | null>(null);
const loaded = ref(false);
const testing = ref(false);
const testResult = ref<{ ok: boolean; text: string } | null>(null);

onMounted(async () => {
  await load();
  draft.value = { ...config.value };
  if (bridge) {
    keyStatus.value = await bridge.keyStatus();
    persistKey.value = keyStatus.value.secureStorage;
  }
  usage.value = await app.r().network.usage();
  loaded.value = true;
});

const dirty = computed(() => JSON.stringify(draft.value) !== JSON.stringify(config.value));
const urlProblem = computed(() => checkBaseUrl(draft.value.baseUrl));
const providerOptions = computed(() => AI_PROVIDERS.map((p) => ({ value: p.id, label: t(`ai.provider.${p.id}`) })));
const modelOptions = computed(() => (AI_PROVIDERS.find((p) => p.id === draft.value.provider)?.models ?? []).map((m) => ({ label: m, value: m })));
const hasKey = computed(() => keyStatus.value?.state === 'saved' || keyStatus.value?.state === 'session');
const ready = computed(() => config.value.enabled && !urlProblem.value && hasKey.value && !!config.value.model.trim());

function pickProvider(id: AiProviderId) {
  const p = AI_PROVIDERS.find((x) => x.id === id)!;
  draft.value.provider = id;
  if (p.baseUrl) draft.value.baseUrl = p.baseUrl;
  if (p.models[0] && id !== 'custom') draft.value.model = p.models[0];
}

/** Turning AI on the first time shows what it means and needs a clear yes. */
function toggleEnabled(on: boolean) {
  if (!on) {
    void persist({ ...config.value, enabled: false }, t('ai.turnedOff'));
    draft.value.enabled = false;
    return;
  }
  dialog.warning({
    title: t('ai.consentTitle'),
    content: () => h('div', { style: 'white-space: pre-line; line-height: 1.7' }, t('ai.consentBody')),
    positiveText: t('ai.consentAccept'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      draft.value.enabled = true;
      await persist({ ...config.value, enabled: true, consentAt: new Date().toISOString() }, t('ai.turnedOn'));
    },
  });
}

async function persist(next: AiConfig, note?: string) {
  await save(next);
  draft.value = { ...draft.value, enabled: next.enabled, consentAt: next.consentAt };
  app.p().log('info', `ai settings saved (enabled=${next.enabled})`);
  if (note) message.success(note);
}

async function saveSettings() {
  if (urlProblem.value) return message.warning(t(`ai.url.${urlProblem.value}`));
  if (!draft.value.model.trim()) return message.warning(t('ai.modelRequired'));
  await persist({ ...draft.value, enabled: config.value.enabled, consentAt: config.value.consentAt, model: draft.value.model.trim() }, t('common.saved'));
}

async function saveKey() {
  if (!bridge || !keyInput.value.trim()) return;
  try {
    keyStatus.value = await bridge.saveKey(keyInput.value, persistKey.value);
    keyInput.value = '';
    message.success(persistKey.value ? t('ai.key.savedEncrypted') : t('ai.key.savedSession'));
  } catch (err) {
    message.error(t('ai.key.invalid', { msg: String(err) }));
  }
}

function clearKey() {
  dialog.warning({
    title: t('ai.key.clear'),
    content: t('ai.key.clearConfirm'),
    positiveText: t('common.delete'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      keyStatus.value = await bridge!.clearKey();
      message.success(t('common.deleted'));
    },
  });
}

/** Sends one tiny message with no personal data, after asking. */
function testConnection() {
  if (!bridge) return;
  if (dirty.value) return message.warning(t('ai.saveFirst'));
  dialog.info({
    title: t('ai.test'),
    content: t('ai.testConfirm', { host: hostOf(config.value.baseUrl), model: config.value.model }),
    positiveText: t('ai.testSend'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      testing.value = true;
      testResult.value = null;
      try {
        const out = await bridge.chat(
          {
            requestId: newRequestId(),
            messages: [
              { role: 'system', content: 'Reply with the single word OK.' },
              { role: 'user', content: 'OK?' },
            ],
            purpose: 'connectionTest',
            categories: [],
          },
          () => {},
        );
        testResult.value = { ok: true, text: t('ai.testOk', { model: out.model, ms: out.ms }) };
      } catch (err) {
        testResult.value = { ok: false, text: err instanceof AiCallError ? aiErrorText(t, err) : String(err) };
      } finally {
        testing.value = false;
        usage.value = await app.r().network.usage();
      }
    },
  });
}
</script>

<template>
  <div class="ms-page narrow">
    <div class="ms-page-header">
      <h1 class="ms-page-title">{{ t('ai.title') }}</h1>
    </div>
    <p class="ms-muted intro">{{ t('ai.intro') }}</p>

    <n-spin v-if="!loaded" />

    <n-alert v-else-if="!bridge" type="info" :title="t('ai.webTitle')" data-testid="ai-web-unavailable">{{ t('ai.webBody') }}</n-alert>

    <template v-else>
      <n-alert v-if="bridge.simulated" type="warning" class="gap">{{ t('ai.simulated') }}</n-alert>

      <!-- on / off -->
      <section class="ms-card block">
        <div class="row">
          <div>
            <h2>{{ t('ai.enable') }}</h2>
            <p class="ms-subtle">{{ config.enabled ? t('ai.enabledHint') : t('ai.disabledHint') }}</p>
          </div>
          <n-switch :value="config.enabled" data-testid="ai-enable" @update:value="toggleEnabled" />
        </div>
        <div class="status" :class="{ ok: ready }" data-testid="ai-status">
          <AppIcon :name="ready ? 'shield' : 'wifiOff'" :size="16" />
          {{ ready ? t('ai.statusReady', { host: hostOf(config.baseUrl), model: config.model }) : !config.enabled ? t('ai.statusOff') : !hasKey ? t('ai.statusNoKey') : t('ai.statusIncomplete') }}
        </div>
      </section>

      <!-- provider -->
      <section class="ms-card block">
        <h2>{{ t('ai.service') }}</h2>
        <label class="field">
          <span>{{ t('ai.providerLabel') }}</span>
          <n-select :value="draft.provider" :options="providerOptions" data-testid="ai-provider" @update:value="pickProvider" />
        </label>
        <label class="field">
          <span>Base URL</span>
          <n-input v-model:value="draft.baseUrl" :status="urlProblem ? 'error' : undefined" placeholder="https://…/v1" data-testid="ai-base-url" />
          <small v-if="urlProblem" class="err">{{ t(`ai.url.${urlProblem}`) }}</small>
          <small v-else class="ms-subtle">{{ t(`ai.providerHint.${draft.provider}`) }}</small>
        </label>
        <label class="field">
          <span>{{ t('ai.model') }}</span>
          <n-auto-complete v-model:value="draft.model" :options="modelOptions" :get-show="() => true" placeholder="qwen-plus" data-testid="ai-model" />
          <small class="ms-subtle">{{ t('ai.modelHint') }}</small>
        </label>
        <details class="advanced">
          <summary>{{ t('ai.advanced') }}</summary>
          <label class="field">
            <span>{{ t('ai.temperature') }}：{{ draft.temperature.toFixed(1) }}</span>
            <n-slider v-model:value="draft.temperature" :min="0" :max="1.5" :step="0.1" />
            <small class="ms-subtle">{{ t('ai.temperatureHint') }}</small>
          </label>
          <div class="two">
            <label class="field">
              <span>{{ t('ai.maxTokens') }}</span>
              <n-input-number v-model:value="draft.maxTokens" :min="256" :max="8192" :step="256" />
            </label>
            <label class="field">
              <span>{{ t('ai.timeout') }}</span>
              <n-input-number v-model:value="draft.timeoutSecs" :min="10" :max="600" :step="10" />
            </label>
          </div>
        </details>
        <div class="actions">
          <n-button type="primary" :disabled="!dirty" data-testid="ai-save" @click="saveSettings">{{ t('common.save') }}</n-button>
        </div>
      </section>

      <!-- key -->
      <section class="ms-card block">
        <h2>API Key</h2>
        <p class="ms-subtle" data-testid="ai-key-status">
          {{ t(`ai.key.state.${keyStatus?.state ?? 'none'}`, { hint: keyStatus?.hint ?? '' }) }}
        </p>
        <n-alert v-if="keyStatus?.state === 'unreadable'" type="warning" class="gap-sm">{{ t('ai.key.unreadableHint') }}</n-alert>
        <div class="key-row">
          <n-input
            v-model:value="keyInput"
            type="password"
            show-password-on="click"
            :input-props="{ autocomplete: 'off', spellcheck: false }"
            :placeholder="t('ai.key.placeholder')"
            data-testid="ai-key-input"
          />
          <n-button :disabled="!keyInput.trim()" data-testid="ai-key-save" @click="saveKey">{{ t('common.save') }}</n-button>
        </div>
        <n-radio-group v-model:value="persistKey" class="persist">
          <n-radio :value="true" :disabled="!keyStatus?.secureStorage">{{ t('ai.key.persist') }}</n-radio>
          <n-radio :value="false" data-testid="ai-key-session">{{ t('ai.key.session') }}</n-radio>
        </n-radio-group>
        <p class="ms-subtle">{{ keyStatus?.secureStorage ? t('ai.key.howStored') : t('ai.key.noSecureStorage') }}</p>
        <n-button v-if="keyStatus && keyStatus.state !== 'none'" quaternary type="error" size="small" data-testid="ai-key-clear" @click="clearKey">
          <template #icon><AppIcon name="trash" :size="16" /></template>{{ t('ai.key.clear') }}
        </n-button>
      </section>

      <!-- connection test + usage -->
      <section class="ms-card block">
        <h2>{{ t('ai.test') }}</h2>
        <p class="ms-subtle">{{ t('ai.testHint') }}</p>
        <n-button :disabled="!ready" :loading="testing" data-testid="ai-test" @click="testConnection">{{ t('ai.test') }}</n-button>
        <n-alert v-if="testResult" :type="testResult.ok ? 'success' : 'error'" class="gap-sm" data-testid="ai-test-result">{{ testResult.text }}</n-alert>

        <h2 class="usage-title">{{ t('ai.usage') }}</h2>
        <p v-if="usage && usage.requests" data-testid="ai-usage">
          {{ t('ai.usageLine', { n: usage.requests, ok: usage.ok, tokens: usage.tokens }) }}
          <br />
          <span class="ms-subtle">{{ t('ai.usageLast', { at: formatDate(usage.lastAt!, true), outcome: usage.lastOutcome }) }}</span>
        </p>
        <p v-else class="ms-subtle" data-testid="ai-usage">{{ t('ai.usageNone') }}</p>
        <router-link to="/data#network">{{ t('ai.viewNetwork') }}</router-link>
      </section>
    </template>
  </div>
</template>

<style scoped>
.narrow {
  max-width: 760px;
}
.intro {
  margin: -6px 0 14px;
}
.block {
  margin-top: 16px;
}
.block h2 {
  font-size: 1.05rem;
  margin-bottom: 8px;
}
.gap {
  margin-bottom: 4px;
}
.gap-sm {
  margin-top: 10px;
}
.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}
.status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--ms-surface-2);
  color: var(--ms-text-2);
  font-size: 0.9rem;
}
.status.ok {
  color: var(--ms-brand);
  background: color-mix(in srgb, var(--ms-brand) 10%, transparent);
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 12px;
}
.field > span {
  font-size: 0.9rem;
  font-weight: 500;
}
.err {
  color: #c2410c;
}
.advanced {
  margin-top: 14px;
}
.advanced summary {
  cursor: pointer;
  color: var(--ms-text-2);
}
.two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.actions {
  margin-top: 16px;
}
.key-row {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.persist {
  margin: 10px 0 4px;
}
.usage-title {
  margin-top: 20px;
}
a {
  color: var(--ms-brand);
}
</style>
