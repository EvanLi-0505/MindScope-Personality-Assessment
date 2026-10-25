<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { NButton, NEmpty, NInput, NModal, NTag, useDialog, useMessage } from 'naive-ui';
import type { Profile } from '@mindscope/core';
import { useAppStore } from '../stores/app';
import { useProfilesStore } from '../stores/profiles';
import { formatDate } from '../i18n';
import ProfileAvatar from '../components/ProfileAvatar.vue';
import AppIcon from '../components/AppIcon.vue';

const { t } = useI18n();
const app = useAppStore();
const store = useProfilesStore();
const dialog = useDialog();
const message = useMessage();

const search = ref('');
const activeTags = ref<string[]>([]);
const showTags = ref(false);
const editingTag = ref<{ id: string; name: string; color: string } | null>(null);

onMounted(() => store.refresh());

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  return store.items.filter((p) => {
    if (q && !p.name.toLowerCase().includes(q) && !(p.note ?? '').toLowerCase().includes(q)) return false;
    return activeTags.value.every((id) => p.tags.some((tg) => tg.id === id));
  });
});

function toggleTag(id: string) {
  activeTags.value = activeTags.value.includes(id) ? activeTags.value.filter((x) => x !== id) : [...activeTags.value, id];
}

function confirmDelete(p: Profile) {
  dialog.warning({
    title: t('profiles.deleteConfirmTitle', { name: p.name }),
    content: app.platform?.kind === 'desktop' ? t('profiles.deleteConfirmBody') : t('profiles.deleteConfirmBodyWeb'),
    positiveText: t('common.delete'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      try {
        await store.remove(p.id);
        message.success(t('common.deleted'));
      } catch (err) {
        message.error(t('common.failed', { msg: String(err) }));
      }
    },
  });
}

async function saveTag() {
  if (!editingTag.value) return;
  try {
    await store.renameTag(editingTag.value.id, editingTag.value.name, editingTag.value.color);
    editingTag.value = null;
  } catch (err) {
    message.error(t('common.failed', { msg: String(err) }));
  }
}

function deleteTag(id: string, name: string) {
  dialog.warning({
    title: t('profiles.tagDeleteConfirm', { name }),
    positiveText: t('common.delete'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      await store.removeTag(id);
      activeTags.value = activeTags.value.filter((x) => x !== id);
    },
  });
}
</script>

<template>
  <div class="ms-page">
    <div class="ms-page-header">
      <h1 class="ms-page-title">{{ t('profiles.title') }}</h1>
      <router-link to="/profiles/new">
        <n-button type="primary">
          <template #icon><AppIcon name="plus" /></template>
          {{ t('profiles.new') }}
        </n-button>
      </router-link>
    </div>

    <div class="toolbar">
      <n-input v-model:value="search" clearable :placeholder="t('profiles.searchPlaceholder')" class="search">
        <template #prefix><AppIcon name="search" :size="16" /></template>
      </n-input>
      <div class="chips">
        <n-tag :checked="activeTags.length === 0" checkable @update:checked="activeTags = []">{{ t('profiles.allTags') }}</n-tag>
        <n-tag
          v-for="tg in store.tags"
          :key="tg.id"
          checkable
          :checked="activeTags.includes(tg.id)"
          @update:checked="toggleTag(tg.id)"
        >
          <span class="dot" :style="{ background: tg.color }" />{{ tg.name }}
        </n-tag>
        <n-button text size="small" class="manage" @click="showTags = true">
          <template #icon><AppIcon name="tag" :size="15" /></template>
          {{ t('profiles.manageTags') }}
        </n-button>
      </div>
    </div>

    <n-empty v-if="store.loaded && !filtered.length" :description="store.items.length ? t('profiles.emptyFiltered') : t('profiles.empty')" class="empty" />

    <div class="grid">
      <div v-for="p in filtered" :key="p.id" class="ms-card card" data-testid="profile-card">
        <router-link :to="`/profiles/${p.id}`" class="card-head" data-testid="open-profile">
          <ProfileAvatar :avatar="p.avatar" :size="48" />
          <div class="card-title">
            <div class="name">{{ p.name }}</div>
            <div class="ms-subtle">{{ t('profiles.createdAt', { date: formatDate(p.createdAt) }) }}</div>
          </div>
        </router-link>
        <div v-if="p.tags.length" class="card-tags">
          <span v-for="tg in p.tags" :key="tg.id" class="tag" :style="{ '--c': tg.color }">{{ tg.name }}</span>
        </div>
        <p v-if="p.note" class="note ms-muted">{{ p.note }}</p>
        <div class="card-foot">
          <router-link
            v-if="store.latest.get(p.id)"
            :to="`/results/${store.latest.get(p.id)!.resultId}`"
            class="latest"
            data-testid="latest-type"
          >
            <b>{{ store.latest.get(p.id)!.typeCode }}</b>
            <span class="ms-subtle">{{ t('profilesExtra.testCount', { n: store.latest.get(p.id)!.count }) }}</span>
          </router-link>
          <span v-else class="ms-subtle">{{ t('profiles.noResults') }}</span>
          <div class="card-actions">
            <router-link :to="`/profiles/${p.id}/edit`">
              <n-button quaternary circle size="small" :aria-label="t('common.edit')"><AppIcon name="edit" :size="17" /></n-button>
            </router-link>
            <n-button quaternary circle size="small" :aria-label="t('common.delete')" @click="confirmDelete(p)">
              <AppIcon name="trash" :size="17" />
            </n-button>
          </div>
        </div>
      </div>
    </div>

    <n-modal v-model:show="showTags" preset="card" :title="t('profiles.manageTags')" style="max-width: 460px">
      <p v-if="!store.tags.length" class="ms-muted">{{ t('profiles.noTags') }}</p>
      <div v-for="tg in store.tags" :key="tg.id" class="tag-row">
        <template v-if="editingTag?.id === tg.id">
          <input v-model="editingTag.color" type="color" class="color" />
          <n-input v-model:value="editingTag.name" size="small" @keyup.enter="saveTag" />
          <n-button size="small" type="primary" @click="saveTag">{{ t('common.save') }}</n-button>
        </template>
        <template v-else>
          <span class="dot big" :style="{ background: tg.color }" />
          <span class="tag-name">{{ tg.name }}</span>
          <span class="ms-subtle">{{ t('profiles.tagUsage', { n: tg.profileCount }) }}</span>
          <n-button text size="small" @click="editingTag = { id: tg.id, name: tg.name, color: tg.color }">{{ t('profiles.tagRename') }}</n-button>
          <n-button text size="small" type="error" @click="deleteTag(tg.id, tg.name)">{{ t('common.delete') }}</n-button>
        </template>
      </div>
    </n-modal>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 18px;
}
.search {
  max-width: 360px;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 6px;
}
.dot.big {
  width: 12px;
  height: 12px;
  margin: 0;
}
.manage {
  margin-left: 4px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 14px;
}
.card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px;
}
.card-head {
  display: flex;
  gap: 12px;
  align-items: center;
  color: inherit;
  text-decoration: none;
}
.card-head:hover .name {
  color: var(--ms-brand);
}
.name {
  font-weight: 700;
  font-size: 1.05rem;
}
.card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.tag {
  font-size: 0.75rem;
  padding: 2px 8px;
  border-radius: 999px;
  color: var(--c);
  background: color-mix(in srgb, var(--c) 14%, transparent);
}
.note {
  margin: 0;
  font-size: 0.875rem;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.card-foot {
  margin-top: auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.card-actions {
  display: flex;
  gap: 2px;
}
.latest {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  text-decoration: none;
}
.latest b {
  font-size: 1.1rem;
  letter-spacing: 0.05em;
  color: var(--ms-brand);
}
.empty {
  margin: 48px 0;
}
.tag-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid var(--ms-border);
}
.tag-name {
  flex: 1;
  font-weight: 500;
}
.color {
  width: 28px;
  height: 28px;
  border: none;
  padding: 0;
  background: none;
}
</style>
