<script setup lang="ts">
/** Two-sided bar: the fill grows from the middle towards the preferred pole. */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { DimensionScore } from '@mindscope/core';
import type { DimensionText } from '@mindscope/banks';

const props = defineProps<{ score: DimensionScore; text: DimensionText }>();
const { t } = useI18n();

const s = computed(() => props.score.score);
const towardsFirst = computed(() => (s.value ?? 0) > 0);
const fillWidth = computed(() => `${Math.abs(s.value ?? 0) * 50}%`);
const percent = computed(() => (s.value == null ? null : Math.round(50 + 50 * Math.abs(s.value))));
const leaningLetter = computed(() => (s.value == null ? null : towardsFirst.value ? props.text.first.letter : props.text.second.letter));
</script>

<template>
  <div class="dim" :class="{ insufficient: score.band === 'insufficient' }" :data-testid="`dim-${score.dimension}`">
    <div class="top">
      <span class="dim-name">{{ text.name }}</span>
      <span class="result">
        <template v-if="percent !== null">
          <b>{{ leaningLetter }} {{ percent }}%</b>
        </template>
        <span class="band" :class="score.band">{{ t(`band.${score.band}`) }}</span>
        <span v-if="score.unstable && score.band !== 'insufficient' && score.band !== 'balanced'" class="unstable" :title="t('result.unstableHint')">
          {{ t('result.unstable') }}
        </span>
      </span>
    </div>
    <div class="row">
      <div class="pole left" :class="{ win: score.pole === text.first.letter }">
        <span class="letter">{{ text.first.letter }}</span>
        <span class="pname">{{ text.first.name }}</span>
      </div>
      <div class="track">
        <div class="mid" />
        <div v-if="s !== null" class="fill" :class="towardsFirst ? 'to-left' : 'to-right'" :style="{ width: fillWidth }" />
      </div>
      <div class="pole right" :class="{ win: score.pole === text.second.letter }">
        <span class="letter">{{ text.second.letter }}</span>
        <span class="pname">{{ text.second.name }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dim {
  padding: 12px 0;
  border-bottom: 1px solid var(--ms-border);
  break-inside: avoid;
}
.dim:last-child {
  border-bottom: none;
}
.top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.dim-name {
  color: var(--ms-text-2);
  font-size: 0.875rem;
}
.result {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.result b {
  color: var(--ms-brand);
}
.band {
  font-size: 0.72rem;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--ms-surface-2);
  color: var(--ms-text-2);
}
.band.clear {
  background: color-mix(in srgb, var(--ms-brand) 16%, transparent);
  color: var(--ms-brand);
}
.band.balanced {
  background: color-mix(in srgb, var(--ms-accent) 14%, transparent);
  color: var(--ms-accent);
}
.unstable {
  font-size: 0.72rem;
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, #e09a3e 18%, transparent);
  color: #9a5d12;
  cursor: help;
}
.row {
  display: grid;
  grid-template-columns: 92px 1fr 92px;
  align-items: center;
  gap: 12px;
}
.pole {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
  color: var(--ms-text-3);
}
.pole.right {
  text-align: right;
}
.pole.win {
  color: var(--ms-text);
}
.letter {
  font-size: 1.25rem;
  font-weight: 800;
}
.pole.win .letter {
  color: var(--ms-brand);
}
.pname {
  font-size: 0.75rem;
}
.track {
  position: relative;
  height: 14px;
  border-radius: 999px;
  background: var(--ms-surface-2);
  overflow: hidden;
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}
.mid {
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  width: 2px;
  margin-left: -1px;
  background: var(--ms-text-3);
  opacity: 0.5;
  z-index: 1;
}
.fill {
  position: absolute;
  top: 0;
  bottom: 0;
  background: var(--ms-gradient);
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}
.fill.to-left {
  right: 50%;
  border-radius: 999px 0 0 999px;
}
.fill.to-right {
  left: 50%;
  border-radius: 0 999px 999px 0;
}
.insufficient .track {
  opacity: 0.4;
}
@media (max-width: 520px) {
  .row {
    grid-template-columns: 56px 1fr 56px;
  }
  .pname {
    display: none;
  }
}
</style>
