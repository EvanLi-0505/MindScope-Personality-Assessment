<script setup lang="ts">
/** MindScope mark: a head in profile holding an 8-axis radar (see assets/brand). */
withDefaults(defineProps<{ size?: number }>(), { size: 32 });
const uid = `ms-g-${Math.random().toString(36).slice(2, 8)}`;
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 256 256" role="img" aria-label="MindScope">
    <defs>
      <linearGradient :id="uid" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#2BA88F" />
        <stop offset="1" stop-color="#5B4FE0" />
      </linearGradient>
    </defs>
    <path
      :fill="`url(#${uid})`"
      d="M84 236C86 214 80 200 66 184C44 160 36 128 44 98C56 54 98 26 144 28C190 30 222 64 222 108C222 118 224 126 230 136L242 157C246 164 243 168 237 168L231 168C232 176 234 182 230 188C228 193 230 199 227 204C222 211 210 211 196 209L186 208C176 207 170 214 170 224L170 236Z"
    />
    <g transform="translate(136 114)" stroke-linejoin="round">
      <polygon
        fill="none"
        stroke="#fff"
        stroke-opacity="0.5"
        stroke-width="3"
        points="0,-58 41,-41 58,0 41,41 0,58 -41,41 -58,0 -41,-41"
      />
      <polygon
        fill="#fff"
        fill-opacity="0.9"
        stroke="#fff"
        stroke-width="3"
        points="0,-53.4 28.7,-28.7 31.9,0 32.8,32.8 0,26.1 -30.8,30.8 -37.7,0 -24.6,-24.6"
      />
    </g>
  </svg>
</template>
