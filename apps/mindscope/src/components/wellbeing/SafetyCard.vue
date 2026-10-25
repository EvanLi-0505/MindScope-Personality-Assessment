<script setup lang="ts">
/**
 * Crisis resources. Shown whenever a safety item (PHQ-9 item 9) is answered
 * above zero, independent of the total score. Text only: no links, no network.
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { CRISIS_RESOURCES } from '@mindscope/banks';

const { locale } = useI18n();
const text = computed(() => (locale.value === 'zh-CN' ? CRISIS_RESOURCES['zh-CN'] : CRISIS_RESOURCES.en));
</script>

<template>
  <section class="safety" role="note" data-testid="safety-card">
    <div class="title">{{ text.title }}</div>
    <ul>
      <li v-for="l in text.lines" :key="l">{{ l }}</li>
    </ul>
  </section>
</template>

<style scoped>
.safety {
  border-radius: var(--ms-radius);
  border: 1px solid color-mix(in srgb, var(--ms-accent) 35%, transparent);
  background: color-mix(in srgb, var(--ms-accent) 8%, var(--ms-surface));
  padding: 14px 18px;
  break-inside: avoid;
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}
.title {
  font-weight: 700;
  color: var(--ms-accent);
  margin-bottom: 6px;
}
ul {
  margin: 0;
  padding-left: 20px;
}
li {
  margin: 4px 0;
  line-height: 1.6;
}
</style>
