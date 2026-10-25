<script setup lang="ts">
/**
 * Progress sidebar, after the capstone ProgressPanel: percentage, bar and a
 * numbered matrix. Drawn questions can be revisited; future ones are locked
 * because the adaptive planner has not chosen them yet.
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { SequenceEntry } from '@mindscope/core';

const props = defineProps<{
  total: number;
  sequence: SequenceEntry[];
  answers: Record<string, number | null>;
  flags: Set<string>;
  index: number;
}>();
const emit = defineEmits<{ jump: [index: number]; review: [] }>();
const { t } = useI18n();

const answered = computed(() => props.sequence.filter((e) => props.answers[e.itemId] != null).length);
const percent = computed(() => (props.total ? Math.round((answered.value / props.total) * 100) : 0));
const cells = computed(() =>
  Array.from({ length: props.total }, (_, i) => {
    const e = props.sequence[i];
    return {
      i,
      locked: !e,
      answered: !!e && props.answers[e.itemId] != null,
      flagged: !!e && props.flags.has(e.itemId),
      current: i === props.index,
    };
  }),
);
const canReview = computed(() => props.sequence.length >= props.total);
</script>

<template>
  <div class="panel ms-card">
    <div class="head">
      <span class="title">{{ t('test.progress') }}</span>
      <span class="pct">{{ percent }}%</span>
    </div>
    <div class="track"><div class="fill" :style="{ width: `${percent}%` }" /></div>
    <div class="count ms-subtle">{{ t('test.answeredOf', { answered, total }) }}</div>

    <div class="matrix" :class="{ dense: total > 90 }">
      <button
        v-for="c in cells"
        :key="c.i"
        type="button"
        class="cell"
        :class="{ answered: c.answered, current: c.current, locked: c.locked }"
        :disabled="c.locked"
        :aria-label="`${c.i + 1}`"
        @click="emit('jump', c.i)"
      >
        {{ c.i + 1 }}
        <span v-if="c.flagged" class="flag" aria-hidden="true" />
      </button>
    </div>

    <div class="legend ms-subtle">
      <span><i class="sw answered" />{{ t('test.legendAnswered') }}</span>
      <span><i class="sw current" />{{ t('test.legendCurrent') }}</span>
      <span><i class="sw flagged" />{{ t('test.legendFlagged') }}</span>
      <span><i class="sw locked" />{{ t('test.legendLocked') }}</span>
    </div>

    <button type="button" class="review" :disabled="!canReview" @click="emit('review')">{{ t('test.review') }}</button>
  </div>
</template>

<style scoped>
.panel {
  padding: 18px;
}
.head {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}
.title {
  font-weight: 600;
}
.pct {
  font-weight: 700;
  color: var(--ms-brand);
}
.track {
  height: 6px;
  border-radius: 999px;
  background: var(--ms-surface-2);
  overflow: hidden;
}
.fill {
  height: 100%;
  background: var(--ms-gradient);
  transition: width 0.3s ease;
}
.count {
  text-align: right;
  margin: 6px 0 14px;
}
.matrix {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(36px, 1fr));
  gap: 6px;
  max-height: 46vh;
  overflow-y: auto;
  padding: 2px;
}
.matrix.dense {
  grid-template-columns: repeat(auto-fill, minmax(30px, 1fr));
}
.cell {
  position: relative;
  height: 34px;
  border-radius: 8px;
  border: 1px solid var(--ms-border);
  background: var(--ms-surface);
  color: var(--ms-text-2);
  font: inherit;
  font-size: 0.78rem;
  cursor: pointer;
  font-variant-numeric: tabular-nums;
}
.dense .cell {
  height: 28px;
  font-size: 0.7rem;
}
.cell:hover:not(:disabled) {
  border-color: var(--ms-text-3);
}
.cell.answered {
  background: color-mix(in srgb, var(--ms-brand) 12%, var(--ms-surface));
  border-color: color-mix(in srgb, var(--ms-brand) 45%, transparent);
  color: var(--ms-brand);
}
.cell.current {
  border: 2px solid var(--ms-brand);
  color: var(--ms-brand);
  font-weight: 700;
}
.cell.locked {
  opacity: 0.4;
  cursor: not-allowed;
  background: var(--ms-surface-2);
}
.flag,
.sw.flagged {
  position: absolute;
  top: -3px;
  right: -3px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #e09a3e;
  box-shadow: 0 0 0 2px var(--ms-surface);
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 14px;
  margin: 14px 0;
  font-size: 0.75rem;
}
.legend span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.sw {
  position: relative;
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 3px;
  border: 1px solid var(--ms-border);
}
.sw.answered {
  background: color-mix(in srgb, var(--ms-brand) 25%, transparent);
}
.sw.current {
  border: 2px solid var(--ms-brand);
}
.sw.flagged {
  position: static;
  box-shadow: none;
  border: none;
}
.sw.locked {
  background: var(--ms-surface-2);
  opacity: 0.6;
}
.review {
  width: 100%;
  padding: 10px;
  border-radius: var(--ms-radius-sm);
  border: 1px dashed var(--ms-brand);
  background: none;
  color: var(--ms-brand);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.review:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
