import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Profile, ProfileInput } from '@mindscope/core';
import type { LatestResult, TagWithUsage } from '@mindscope/storage';
import { useAppStore } from './app';

export const useProfilesStore = defineStore('profiles', () => {
  const app = useAppStore();
  const items = ref<Profile[]>([]);
  const tags = ref<TagWithUsage[]>([]);
  const latest = ref<Map<string, LatestResult & { count: number }>>(new Map());
  const loaded = ref(false);

  async function refresh() {
    const [list, tagList, latestMap] = await Promise.all([
      app.r().profiles.list(),
      app.r().tags.list(),
      app.r().results.latestByProfile(),
    ]);
    items.value = list;
    tags.value = tagList;
    latest.value = latestMap;
    loaded.value = true;
  }

  /** Creates any tag names that do not exist yet and returns all tag ids. */
  async function resolveTags(names: string[]): Promise<string[]> {
    const ids: string[] = [];
    for (const name of names) {
      const existing = tags.value.find((t) => t.name.toLowerCase() === name.trim().toLowerCase());
      ids.push(existing ? existing.id : (await app.r().tags.create(name, pickTagColor(tags.value.length + ids.length))).id);
    }
    return ids;
  }

  async function create(input: ProfileInput, tagNames: string[]) {
    const p = await app.r().profiles.create(input, await resolveTags(tagNames));
    app.p().log('info', 'profile created');
    await refresh();
    return p;
  }

  async function update(id: string, input: ProfileInput, tagNames: string[]) {
    const p = await app.r().profiles.update(id, input, await resolveTags(tagNames));
    await refresh();
    return p;
  }

  async function remove(id: string) {
    // Safety net: deleting a person card removes all of its results.
    if (app.p().kind === 'desktop') await app.p().storage.backup('before-delete-profile');
    await app.r().profiles.remove(id);
    app.p().log('info', 'profile deleted');
    await refresh();
  }

  async function renameTag(id: string, name: string, color: string) {
    await app.r().tags.update(id, name, color);
    await refresh();
  }

  async function removeTag(id: string) {
    await app.r().tags.remove(id);
    await refresh();
  }

  return { items, tags, latest, loaded, refresh, create, update, remove, renameTag, removeTag };
});

const TAG_COLORS = ['#1F7A6D', '#4F7BE0', '#B05BD6', '#E0708A', '#E09A3E', '#2BA88F', '#5B4FE0', '#6B7A8F'];
export function pickTagColor(i: number) {
  return TAG_COLORS[i % TAG_COLORS.length]!;
}
