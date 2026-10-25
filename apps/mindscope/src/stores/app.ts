import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';
import { createRepositories, migrate, MigrationError, type Repositories } from '@mindscope/storage';
import { BUILTIN_BANKS, WELLBEING_SCALES, bigFiveBank } from '@mindscope/banks';
import { createPlatform, type Platform } from '../platform';
import { detectLocale, setLocale, type Locale } from '../i18n';

export type ThemePref = 'system' | 'light' | 'dark';
export type BootState =
  | { status: 'booting' }
  | { status: 'ready' }
  | { status: 'error'; code: 'locked' | 'db_too_new' | 'unknown'; message: string };

const media = window.matchMedia('(prefers-color-scheme: dark)');

export const useAppStore = defineStore('app', () => {
  const boot = ref<BootState>({ status: 'booting' });
  const platform = shallowRef<Platform | null>(null);
  const repos = shallowRef<Repositories | null>(null);
  const durable = ref(true);
  const bankError = ref<string | null>(null);

  const theme = ref<ThemePref>('system');
  const systemDark = ref(media.matches);
  media.addEventListener('change', (e) => (systemDark.value = e.matches));
  const isDark = computed(() => (theme.value === 'system' ? systemDark.value : theme.value === 'dark'));
  const locale = ref<Locale>(detectLocale());

  /** Platform and repositories are guaranteed after a successful boot. */
  const p = () => platform.value!;
  const r = () => repos.value!;

  async function start() {
    boot.value = { status: 'booting' };
    try {
      const plat = platform.value ?? (await createPlatform());
      platform.value = plat;
      plat.log('info', `starting (${plat.kind})`);

      const result = await migrate(plat.db, {
        // Existing data is copied before the schema changes.
        beforeApply: async (_pending, from) => {
          await plat.storage.backup(`pre-migration-v${from}`);
        },
      });
      if (result.applied.length) plat.log('info', `schema migrated v${result.fromVersion} -> v${result.toVersion}`);

      repos.value = createRepositories(plat.db);
      durable.value = (await plat.storage.info()).durable;

      // Built-in item banks are copied into the database once (immutable versions).
      bankError.value = null;
      for (const bank of BUILTIN_BANKS) {
        try {
          const r = await repos.value.bank.installBuiltin(bank);
          if (r.installed) plat.log('info', `item bank installed: ${r.versionId}`);
        } catch (err) {
          bankError.value = err instanceof Error ? err.message : String(err);
          plat.log('error', `item bank check failed: ${bankError.value}`);
        }
      }
      for (const scale of WELLBEING_SCALES) {
        try {
          const r = await repos.value.scales.installBuiltin(scale);
          if (r.installed) plat.log('info', `wellbeing scale installed: ${r.versionId}`);
        } catch (err) {
          plat.log('error', `wellbeing scale check failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      try {
        const r = await repos.value.bigfive.installBuiltin(bigFiveBank);
        if (r.installed) plat.log('info', `big five bank installed: ${r.versionId}`);
      } catch (err) {
        plat.log('error', `big five bank check failed: ${err instanceof Error ? err.message : String(err)}`);
      }

      theme.value = await repos.value.settings.get<ThemePref>('ui.theme', 'system');
      locale.value = await repos.value.settings.get<Locale>('ui.locale', detectLocale());
      setLocale(locale.value);
      boot.value = { status: 'ready' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code =
        message.includes('OPFS_LOCKED') ? 'locked' : err instanceof MigrationError && err.code === 'db_too_new' ? 'db_too_new' : 'unknown';
      platform.value?.log('error', `boot failed: ${message}`);
      boot.value = { status: 'error', code, message };
    }
  }

  async function setTheme(value: ThemePref) {
    theme.value = value;
    await r().settings.set('ui.theme', value);
  }

  async function changeLocale(value: Locale) {
    locale.value = value;
    setLocale(value);
    await r().settings.set('ui.locale', value);
  }

  return { boot, platform, repos, durable, bankError, theme, isDark, locale, p, r, start, setTheme, changeLocale };
});
