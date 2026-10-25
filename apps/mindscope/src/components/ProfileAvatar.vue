<script setup lang="ts">
import { computed } from 'vue';
import type { Avatar } from '@mindscope/core';

const props = withDefaults(defineProps<{ avatar: Avatar; size?: number; name?: string }>(), { size: 44 });

/** White glyphs drawn on a 24×24 grid for the preset avatars. */
const GLYPHS: Record<string, string[]> = {
  leaf: ['M6 18c0-7 5-12 13-12 0 8-5 13-12 13', 'M6 18 13 11'],
  sun: ['M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M12 3v2', 'M12 19v2', 'M3 12h2', 'M19 12h2', 'm5.6 5.6 1.4 1.4', 'm17 17 1.4 1.4', 'm5.6 18.4 1.4-1.4', 'm17 7 1.4-1.4'],
  moon: ['M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z'],
  star: ['m12 4 2.4 5 5.4.6-4 3.7 1.1 5.3L12 16l-4.9 2.6 1.1-5.3-4-3.7 5.4-.6z'],
  wave: ['M3 10c3 0 3-3 6-3s3 3 6 3 3-3 6-3', 'M3 16c3 0 3-3 6-3s3 3 6 3 3-3 6-3'],
  mountain: ['m3 19 6-9 4 5 2-3 6 7z'],
  flower: ['M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z', 'M12 9V5', 'M12 19v-4', 'M9 12H5', 'M19 12h-4'],
  cloud: ['M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z'],
};

const glyph = computed(() => (props.avatar.kind === 'preset' ? (GLYPHS[props.avatar.icon] ?? GLYPHS.leaf!) : []));
const color = computed(() => (props.avatar.kind === 'preset' ? props.avatar.color : '#6B7A8F'));
</script>

<template>
  <span v-if="avatar.kind === 'image'" class="avatar" :style="{ width: `${size}px`, height: `${size}px` }" :title="name">
    <img :src="avatar.dataUrl" :alt="name ?? ''" class="pic" />
  </span>
  <span v-else class="avatar" :style="{ width: `${size}px`, height: `${size}px`, background: color }" :title="name">
    <svg :width="size * 0.56" :height="size * 0.56" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path v-for="(d, i) in glyph" :key="i" :d="d" />
    </svg>
  </span>
</template>

<style scoped>
.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.18);
  overflow: hidden;
}
.pic {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
</style>
