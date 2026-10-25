<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { NButton, NCollapseTransition, NForm, NFormItem, NInput, NInputNumber, NSelect, useMessage } from 'naive-ui';
import { AvatarImageError, toAvatarDataUrl } from '../utils/image';
import {
  AVATAR_COLORS,
  AVATAR_ICONS,
  DEFAULT_AVATAR,
  validateProfileInput,
  type Avatar,
  type Profile,
  type ProfileInput,
} from '@mindscope/core';
import ProfileAvatar from './ProfileAvatar.vue';
import AppIcon from './AppIcon.vue';
import { useProfilesStore } from '../stores/profiles';

const props = defineProps<{ initial?: Profile | null; submitLabel: string; busy?: boolean; cancellable?: boolean }>();
const emit = defineEmits<{ submit: [input: ProfileInput, tagNames: string[]]; cancel: [] }>();

const { t } = useI18n();
const store = useProfilesStore();
const message = useMessage();

const form = reactive({
  name: props.initial?.name ?? '',
  avatar: (props.initial?.avatar ?? DEFAULT_AVATAR) as Avatar,
  birthYear: props.initial?.birthYear ?? null,
  gender: props.initial?.gender ?? null,
  occupation: props.initial?.occupation ?? '',
  note: props.initial?.note ?? '',
  tags: props.initial?.tags.map((tg) => tg.name) ?? ([] as string[]),
});
const showMore = ref(
  !!(props.initial && (props.initial.birthYear || props.initial.gender || props.initial.occupation || props.initial.note || props.initial.tags.length)),
);
const submitted = ref(false);

const genderOptions = computed(() =>
  (['female', 'male', 'other', 'undisclosed'] as const).map((g) => ({ value: g, label: t(`profiles.gender.${g}`) })),
);
const tagOptions = computed(() => store.tags.map((tg) => ({ value: tg.name, label: tg.name })));

const input = computed<ProfileInput>(() => ({
  name: form.name,
  avatar: form.avatar,
  birthYear: form.birthYear,
  gender: form.gender,
  occupation: form.occupation,
  note: form.note,
}));
const errors = computed(() => validateProfileInput(input.value));
function errorFor(field: string) {
  if (!submitted.value) return undefined;
  const e = errors.value.find((x) => x.field === field);
  return e ? t(`profiles.error.${e.field}_${e.code}`) : undefined;
}

const DEFAULT_COLOR = DEFAULT_AVATAR.kind === 'preset' ? DEFAULT_AVATAR.color : '#1F7A6D';
function pickIcon(icon: string) {
  form.avatar = { kind: 'preset', icon, color: form.avatar.kind === 'preset' ? form.avatar.color : DEFAULT_COLOR };
}
function pickColor(color: string) {
  form.avatar = { kind: 'preset', icon: form.avatar.kind === 'preset' ? form.avatar.icon : 'leaf', color };
}

const fileInput = ref<HTMLInputElement | null>(null);
async function onFile(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    form.avatar = { kind: 'image', dataUrl: await toAvatarDataUrl(file) };
  } catch (err) {
    message.error(t(err instanceof AvatarImageError && err.code === 'too_big' ? 'avatar.tooBig' : 'avatar.notImage'));
  }
}

// Guards against double submission (Enter key + button, double clicks).
let lastSubmit = 0;
function onSubmit() {
  submitted.value = true;
  if (errors.value.length) {
    if (errors.value.some((e) => e.field !== 'name')) showMore.value = true;
    return;
  }
  const now = Date.now();
  if (props.busy || now - lastSubmit < 1500) return;
  lastSubmit = now;
  emit('submit', input.value, form.tags.map((s) => s.trim()).filter(Boolean));
}
</script>

<template>
  <n-form class="profile-form" @submit.prevent="onSubmit">
    <n-form-item
      :label="t('profiles.field.name')"
      :validation-status="errorFor('name') ? 'error' : undefined"
      :feedback="errorFor('name')"
      required
    >
      <n-input
        v-model:value="form.name"
        :placeholder="t('profiles.field.namePlaceholder')"
        :maxlength="40"
        show-count
        data-testid="profile-name"
      />
    </n-form-item>

    <n-form-item :label="t('profiles.field.avatar')">
      <div class="avatar-picker">
        <ProfileAvatar :avatar="form.avatar" :size="56" />
        <div class="avatar-options">
          <div class="row">
            <button
              v-for="icon in AVATAR_ICONS"
              :key="icon"
              type="button"
              class="pick"
              :class="{ on: form.avatar.kind === 'preset' && form.avatar.icon === icon }"
              :aria-label="icon"
              @click="pickIcon(icon)"
            >
              <ProfileAvatar :avatar="{ kind: 'preset', icon, color: '#8794A1' }" :size="28" />
            </button>
          </div>
          <div class="row">
            <button
              v-for="color in AVATAR_COLORS"
              :key="color"
              type="button"
              class="swatch"
              :class="{ on: form.avatar.kind === 'preset' && form.avatar.color === color }"
              :style="{ background: color }"
              :aria-label="color"
              @click="pickColor(color)"
            />
          </div>
          <div class="row">
            <n-button size="tiny" secondary @click="fileInput?.click()">
              <template #icon><AppIcon name="upload" :size="14" /></template>
              {{ t('avatar.upload') }}
            </n-button>
            <n-button v-if="form.avatar.kind === 'image'" size="tiny" quaternary @click="pickIcon('leaf')">{{ t('avatar.remove') }}</n-button>
            <input ref="fileInput" type="file" accept="image/png,image/jpeg,image/webp" hidden data-testid="avatar-file" @change="onFile" />
          </div>
        </div>
      </div>
    </n-form-item>

    <button type="button" class="more-toggle" @click="showMore = !showMore">
      <AppIcon name="chevronRight" :size="16" :class="{ rot: showMore }" />
      {{ t('profiles.moreFields') }}
    </button>

    <n-collapse-transition :show="showMore">
      <div class="more">
        <n-form-item :label="t('profiles.field.tags')">
          <n-select
            v-model:value="form.tags"
            multiple
            filterable
            tag
            :options="tagOptions"
            :placeholder="t('profiles.field.tagsPlaceholder')"
          />
        </n-form-item>
        <div class="two">
          <n-form-item
            :label="t('profiles.field.birthYear')"
            :validation-status="errorFor('birthYear') ? 'error' : undefined"
            :feedback="errorFor('birthYear')"
          >
            <n-input-number v-model:value="form.birthYear" :show-button="false" clearable placeholder="1998" style="width: 100%" />
          </n-form-item>
          <n-form-item :label="t('profiles.field.gender')">
            <n-select v-model:value="form.gender" :options="genderOptions" clearable />
          </n-form-item>
        </div>
        <n-form-item :label="t('profiles.field.occupation')">
          <n-input v-model:value="form.occupation" :maxlength="60" />
        </n-form-item>
        <n-form-item
          :label="t('profiles.field.note')"
          :validation-status="errorFor('note') ? 'error' : undefined"
          :feedback="errorFor('note')"
        >
          <n-input v-model:value="form.note" type="textarea" :autosize="{ minRows: 2, maxRows: 6 }" :maxlength="2000" />
        </n-form-item>
      </div>
    </n-collapse-transition>

    <div class="actions">
      <n-button v-if="cancellable" @click="emit('cancel')">{{ t('common.cancel') }}</n-button>
      <n-button type="primary" attr-type="submit" :loading="busy" data-testid="profile-submit">{{ submitLabel }}</n-button>
    </div>
  </n-form>
</template>

<style scoped>
.avatar-picker {
  display: flex;
  gap: 16px;
  align-items: center;
  flex-wrap: wrap;
}
.avatar-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.pick,
.swatch {
  border: 2px solid transparent;
  border-radius: 50%;
  padding: 1px;
  background: none;
  cursor: pointer;
  line-height: 0;
}
.swatch {
  width: 26px;
  height: 26px;
}
.pick.on,
.swatch.on {
  border-color: var(--ms-brand);
}
.more-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  color: var(--ms-text-2);
  cursor: pointer;
  padding: 0 0 12px;
  font: inherit;
}
.more-toggle .rot {
  transform: rotate(90deg);
}
.more-toggle svg {
  transition: transform 0.15s;
}
.two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 8px;
}
@media (max-width: 520px) {
  .two {
    grid-template-columns: 1fr;
  }
}
</style>
