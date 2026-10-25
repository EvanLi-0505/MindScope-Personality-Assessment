<script setup lang="ts">
/** Closes open confirmation dialogs when the page changes (e.g. browser Back while a dialog is open). */
import { onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { useDialog } from 'naive-ui';

const dialog = useDialog();
const stop = useRouter().afterEach((to, from) => {
  if (to.path !== from.path) dialog.destroyAll();
});
onBeforeUnmount(stop);
</script>

<template>
  <span hidden />
</template>
