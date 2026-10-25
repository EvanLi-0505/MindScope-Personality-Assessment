<script setup lang="ts">
/** Small inline stroke-icon set (bundled, no icon fonts or CDNs). */
import { computed } from 'vue';

type Shape = string | { c: [number, number, number] } | { e: [number, number, number, number] };

const ICONS: Record<string, Shape[]> = {
  home: ['M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'],
  users: [{ c: [9, 8, 4] }, 'M2 21c0-3.9 3.1-7 7-7s7 3.1 7 7', 'M16 4.1a4 4 0 0 1 0 7.8', 'M22 21c0-3-1.8-5.6-4.5-6.6'],
  assess: [
    'M9 3h6v3H9z',
    'M9 4.5H6a1 1 0 0 0-1 1V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5.5a1 1 0 0 0-1-1h-3',
    'm9 14 2 2 4-4',
  ],
  history: ['M3 3v18h18', 'm7 15 4-5 3 3 5-6'],
  bank: ['M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z', 'M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5'],
  data: [{ e: [12, 5, 8, 3] }, 'M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5', 'M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3'],
  settings: ['M4 6h9', 'M17 6h3', 'M4 12h3', 'M11 12h9', 'M4 18h11', 'M19 18h1', { c: [15, 6, 2] }, { c: [9, 12, 2] }, { c: [17, 18, 2] }],
  more: ['M4 4h6v6H4z', 'M14 4h6v6h-6z', 'M4 14h6v6H4z', 'M14 14h6v6h-6z'],
  plus: ['M12 5v14', 'M5 12h14'],
  search: [{ c: [11, 11, 7] }, 'm20 20-3.5-3.5'],
  edit: ['M4 20h4L19 9l-4-4L4 16z', 'm13.5 6.5 4 4'],
  trash: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'M6 7l1 13h10l1-13', 'M9 7V4h6v3'],
  folder: ['M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z'],
  download: ['M12 4v11', 'm7 10 5 5 5-5', 'M5 20h14'],
  upload: ['M12 20V9', 'm7 14 5-5 5 5', 'M5 4h14'],
  refresh: ['M20 11a8 8 0 1 0-2.3 5.7', 'M20 5v6h-6'],
  shield: ['M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z', 'm9 12 2 2 4-4'],
  tag: ['M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z', { c: [8, 8, 1.5] }],
  file: ['M6 3h8l4 4v14H6z', 'M14 3v4h4', 'M9 13h6', 'M9 17h6'],
  wifiOff: ['M2 2l20 20', 'M8.5 16.5a5 5 0 0 1 7 0', 'M5 12.9a10 10 0 0 1 5.2-2.7', 'M19 12.9a10 10 0 0 0-2.3-1.6', 'M12 20h.01'],
  log: ['M5 4h14v16H5z', 'M8 8h8', 'M8 12h8', 'M8 16h5'],
  chevronRight: ['m9 6 6 6-6 6'],
  chevronLeft: ['m15 6-6 6 6 6'],
  pentagon: ['M12 3 21 9.5 17.5 20h-11L3 9.5z', 'M12 8l4.3 3.1-1.6 5h-5.4l-1.6-5z'],
  sparkle: ['M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z', 'M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z'],
};

const props = withDefaults(defineProps<{ name: string; size?: number; strokeWidth?: number }>(), {
  size: 20,
  strokeWidth: 1.8,
});
const shapes = computed(() => ICONS[props.name] ?? []);
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <template v-for="(s, i) in shapes" :key="i">
      <path v-if="typeof s === 'string'" :d="s" />
      <circle v-else-if="'c' in s" :cx="s.c[0]" :cy="s.c[1]" :r="s.c[2]" />
      <ellipse v-else :cx="s.e[0]" :cy="s.e[1]" :rx="s.e[2]" :ry="s.e[3]" />
    </template>
  </svg>
</template>
