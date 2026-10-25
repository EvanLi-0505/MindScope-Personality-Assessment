<script setup lang="ts">
/**
 * Launch animation: the logo fades in, two slogans fade in and out, then the
 * whole screen fades away to reveal the app. Runs while storage is starting,
 * so it costs no extra time unless the animation is longer than the boot.
 * Click or press any key to skip. Honours prefers-reduced-motion.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import BrandMark from './BrandMark.vue';

const props = defineProps<{ ready: boolean }>();
const emit = defineEmits<{ done: [] }>();
const { t } = useI18n();

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
/** 0 logo · 1 first slogan · 2 second slogan · 3 timeline finished. */
const stage = ref(0);
const leaving = ref(false);
const timers: ReturnType<typeof setTimeout>[] = [];
const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));

function finish() {
  if (leaving.value) return;
  leaving.value = true;
  at(reduced ? 150 : 550, () => emit('done'));
}

function skip() {
  stage.value = 3;
  if (props.ready) finish();
}

onMounted(() => {
  if (reduced) {
    stage.value = 2;
    at(1200, () => (stage.value = 3));
  } else {
    at(700, () => (stage.value = 1));
    at(2000, () => (stage.value = 2));
    at(3300, () => (stage.value = 3));
  }
  window.addEventListener('keydown', skip);
});

// Leave once both the timeline and the app are ready.
watch(
  () => [stage.value, props.ready] as const,
  ([s, ready]) => {
    if (s === 3 && ready) finish();
  },
);

onBeforeUnmount(() => {
  timers.forEach(clearTimeout);
  window.removeEventListener('keydown', skip);
});
</script>

<template>
  <div class="splash ms-no-print" :class="{ leaving, reduced }" role="presentation" data-testid="splash" @click="skip">
    <div class="center">
      <div class="mark"><BrandMark :size="112" /></div>
      <div class="name">MindScope</div>
      <div class="slogans">
        <p class="slogan" :class="{ on: stage === 1 || (reduced && stage >= 1) }">{{ t('splash.slogan1') }}</p>
        <p class="slogan second" :class="{ on: stage >= 2 }">{{ t('splash.slogan2') }}</p>
      </div>
    </div>
    <div class="foot">
      <span v-if="stage === 3 && !ready" class="dots"><i /><i /><i /></span>
      <span v-else class="hint">{{ t('splash.skip') }}</span>
    </div>
  </div>
</template>

<style scoped>
.splash {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  user-select: none;
  background:
    radial-gradient(circle at 20% 15%, color-mix(in srgb, var(--ms-brand-2) 16%, transparent), transparent 50%),
    radial-gradient(circle at 80% 85%, color-mix(in srgb, var(--ms-accent) 14%, transparent), transparent 50%),
    var(--ms-bg);
  transition: opacity 0.55s ease;
}
.splash.leaving {
  opacity: 0;
  pointer-events: none;
}
.center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 24px;
  text-align: center;
}
.mark {
  animation: mark-in 0.9s cubic-bezier(0.2, 0.7, 0.2, 1) both;
}
.name {
  font-size: 1.9rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  background: var(--ms-gradient);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: fade-up 0.8s 0.25s ease both;
}
/* Both slogans share one slot, so they cross-fade in place. */
.slogans {
  display: grid;
  min-height: 3.4em;
  margin-top: 6px;
}
.slogan {
  grid-area: 1 / 1;
  margin: 0;
  font-size: 1.08rem;
  line-height: 1.7;
  color: var(--ms-text-2);
  max-width: 30em;
  opacity: 0;
  transform: translateY(6px);
  transition:
    opacity 0.6s ease,
    transform 0.6s ease;
}
.slogan.on {
  opacity: 1;
  transform: none;
}
.foot {
  position: absolute;
  bottom: calc(28px + env(safe-area-inset-bottom));
  height: 20px;
}
.hint {
  font-size: 0.78rem;
  color: var(--ms-text-3);
  animation: fade-up 0.6s 1.2s ease both;
}
.dots {
  display: inline-flex;
  gap: 6px;
}
.dots i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ms-brand);
  animation: pulse 1s infinite ease-in-out;
}
.dots i:nth-child(2) {
  animation-delay: 0.15s;
}
.dots i:nth-child(3) {
  animation-delay: 0.3s;
}
.reduced .mark,
.reduced .name,
.reduced .hint {
  animation: none;
}
.reduced .slogan {
  transition: none;
  transform: none;
}
.reduced .slogans {
  display: flex;
  flex-direction: column;
}
@keyframes mark-in {
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@keyframes fade-up {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@keyframes pulse {
  0%,
  100% {
    opacity: 0.25;
  }
  50% {
    opacity: 1;
  }
}
</style>
