<script setup lang="ts">
/** 7-point agree/disagree scale. Row of circles on wide screens, labelled list on phones. */
const props = defineProps<{ value: number | null; labels: string[]; disabled?: boolean }>();
const emit = defineEmits<{ select: [value: number] }>();

const SIZES = [46, 38, 31, 26, 31, 38, 46];
const mid = (props.labels.length + 1) / 2;
function side(v: number) {
  return v < mid ? 'disagree' : v > mid ? 'agree' : 'neutral';
}
</script>

<template>
  <div class="likert" role="radiogroup">
    <button
      v-for="(label, i) in labels"
      :key="i"
      type="button"
      role="radio"
      class="opt"
      :class="[side(i + 1), { on: value === i + 1, edge: i === 0 || i === labels.length - 1 || i + 1 === mid }]"
      :aria-checked="value === i + 1"
      :aria-label="`${i + 1} ${label}`"
      :disabled="disabled"
      :data-testid="`likert-${i + 1}`"
      @click="emit('select', i + 1)"
    >
      <span class="dot" :style="{ '--s': `${SIZES[i] ?? 32}px` }">
        <svg v-if="value === i + 1" viewBox="0 0 24 24" width="55%" height="55%" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10" /></svg>
      </span>
      <span class="label">{{ label }}</span>
      <span class="key">{{ i + 1 }}</span>
    </button>
  </div>
</template>

<style scoped>
.likert {
  --agree: var(--ms-brand);
  --disagree: var(--ms-accent);
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  align-items: start;
  gap: 4px;
  margin: 8px 0 4px;
}
.opt {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 6px 0;
  font: inherit;
  color: var(--ms-text-2);
}
.opt:disabled {
  cursor: default;
}
.dot {
  width: var(--s);
  height: var(--s);
  border-radius: 50%;
  border: 2.5px solid var(--c);
  display: grid;
  place-items: center;
  transition: transform 0.12s, background 0.12s;
  height: var(--s);
  margin-top: calc((46px - var(--s)) / 2);
}
.agree {
  --c: var(--agree);
}
.disagree {
  --c: var(--disagree);
}
.neutral {
  --c: var(--ms-text-3);
}
.opt:hover:not(:disabled) .dot {
  transform: scale(1.08);
  background: color-mix(in srgb, var(--c) 14%, transparent);
}
.opt.on .dot {
  background: var(--c);
}
.label {
  font-size: 0.78rem;
  text-align: center;
  line-height: 1.25;
  visibility: hidden;
}
.opt.edge .label,
.opt.on .label {
  visibility: visible;
}
.opt.on .label {
  color: var(--c);
  font-weight: 600;
}
.key {
  display: none;
}

@media (max-width: 640px) {
  .likert {
    grid-template-columns: 1fr;
    gap: 8px;
  }
  .opt {
    flex-direction: row;
    gap: 12px;
    padding: 10px 14px;
    border: 1px solid var(--ms-border);
    border-radius: var(--ms-radius-sm);
    background: var(--ms-surface);
  }
  .opt.on {
    border-color: var(--c);
    background: color-mix(in srgb, var(--c) 8%, var(--ms-surface));
  }
  .dot {
    --s: 24px !important;
    margin-top: 0;
    flex-shrink: 0;
  }
  .label {
    visibility: visible;
    font-size: 0.95rem;
    text-align: left;
  }
}
</style>
