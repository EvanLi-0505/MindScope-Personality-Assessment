<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { NSpin, useMessage } from 'naive-ui';
import type { Profile, ProfileInput } from '@mindscope/core';
import ProfileForm from '../components/ProfileForm.vue';
import { useAppStore } from '../stores/app';
import { useProfilesStore } from '../stores/profiles';

const props = defineProps<{ id?: string }>();
const { t } = useI18n();
const router = useRouter();
const message = useMessage();
const app = useAppStore();
const store = useProfilesStore();

const loading = ref(!!props.id);
const initial = ref<Profile | null>(null);
const busy = ref(false);

onMounted(async () => {
  await store.refresh();
  if (props.id) {
    initial.value = await app.r().profiles.get(props.id);
    if (!initial.value) return router.replace('/profiles');
    loading.value = false;
  }
});

async function submit(input: ProfileInput, tags: string[]) {
  if (busy.value) return;
  busy.value = true;
  try {
    if (props.id) await store.update(props.id, input, tags);
    else await store.create(input, tags);
    message.success(t('common.saved'));
    await router.push('/profiles');
  } catch (err) {
    message.error(t('common.failed', { msg: String(err) }));
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="ms-page narrow">
    <div class="ms-page-header">
      <h1 class="ms-page-title">{{ id ? t('profiles.edit') : t('profiles.new') }}</h1>
    </div>
    <div class="ms-card">
      <n-spin v-if="loading" />
      <ProfileForm
        v-else
        :initial="initial"
        :submit-label="t('common.save')"
        :busy="busy"
        cancellable
        @submit="submit"
        @cancel="router.back()"
      />
    </div>
  </div>
</template>

<style scoped>
.narrow {
  max-width: 680px;
}
</style>
