<script setup lang="ts">
/**
 * One AI-generated text: always labelled, with the basis written by the app
 * and, when a safety item was part of the data, the crisis card — whatever
 * the AI itself wrote.
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { renderSafeMarkdown } from '../../ai/markdown';
import SafetyCard from '../wellbeing/SafetyCard.vue';

const props = defineProps<{
  task: string;
  content: string;
  basis: string[];
  model: string;
  createdAt?: string | null;
  safety: boolean;
  streaming?: boolean;
}>();
const { t } = useI18n();
const html = computed(() => renderSafeMarkdown(props.content));
</script>

<template>
  <article class="ai-note" data-testid="ai-note">
    <header>
      <span class="badge" data-testid="ai-badge">{{ t('ai.badge') }}</span>
      <span class="task">{{ t(`ai.task.${task}.name`) }}</span>
      <span class="ms-subtle meta">{{ model }}<template v-if="createdAt"> · {{ createdAt }}</template></span>
    </header>
    <div class="basis" data-testid="ai-basis">
      <b>{{ t('ai.basis') }}</b>
      <ul>
        <li v-for="b in basis" :key="b">{{ b }}</li>
      </ul>
    </div>
    <SafetyCard v-if="safety" class="safety" />
    <!-- eslint-disable-next-line vue/no-v-html -- renderSafeMarkdown escapes everything and emits only fixed tags -->
    <div class="md" :class="{ streaming }" data-testid="ai-content" v-html="html" />
    <footer class="ms-subtle">{{ t('ai.footer') }}</footer>
  </article>
</template>

<style scoped>
.ai-note {
  border: 1px solid color-mix(in srgb, var(--ms-accent) 30%, var(--ms-border));
  border-radius: var(--ms-radius);
  padding: 14px 16px;
  background: color-mix(in srgb, var(--ms-accent) 4%, var(--ms-surface));
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}
header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.badge {
  font-size: 0.75rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
  color: var(--ms-accent);
  background: color-mix(in srgb, var(--ms-accent) 14%, transparent);
}
.task {
  font-weight: 700;
}
.meta {
  margin-left: auto;
}
.basis {
  margin-top: 8px;
  font-size: 0.85rem;
  color: var(--ms-text-2);
}
.basis ul {
  margin: 2px 0 0;
  padding-left: 18px;
}
.safety {
  margin-top: 10px;
}
.md {
  margin-top: 8px;
  line-height: 1.75;
}
.md :deep(h3),
.md :deep(h4),
.md :deep(h5) {
  font-size: 1rem;
  margin: 14px 0 4px;
  color: var(--ms-brand);
}
.md :deep(p) {
  margin: 6px 0;
}
.md :deep(ul),
.md :deep(ol) {
  margin: 4px 0;
  padding-left: 22px;
}
.md.streaming::after {
  content: '▍';
  color: var(--ms-accent);
  animation: blink 1s steps(2) infinite;
}
@keyframes blink {
  50% {
    opacity: 0;
  }
}
footer {
  margin-top: 10px;
  font-size: 0.8rem;
}
</style>
