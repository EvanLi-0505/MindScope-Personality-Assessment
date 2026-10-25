import { createI18n } from 'vue-i18n';
import zhCN from './zh-CN';
import en from './en';

export type Locale = 'zh-CN' | 'en';
export const LOCALES: { value: Locale; label: string }[] = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en', label: 'English' },
];

export function detectLocale(): Locale {
  return navigator.language?.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
}

export const i18n = createI18n({
  legacy: false,
  locale: detectLocale(),
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN, en },
});

export function setLocale(locale: Locale) {
  i18n.global.locale.value = locale;
  document.documentElement.lang = locale;
}

/** Human-readable byte size using the current locale's units. */
export function formatBytes(bytes: number): string {
  const t = i18n.global.t;
  if (bytes < 1024) return t('size.b', { n: bytes });
  if (bytes < 1024 ** 2) return t('size.kb', { n: (bytes / 1024).toFixed(1) });
  if (bytes < 1024 ** 3) return t('size.mb', { n: (bytes / 1024 ** 2).toFixed(1) });
  return t('size.gb', { n: (bytes / 1024 ** 3).toFixed(2) });
}

export function formatDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return '';
  const d = new Date(iso);
  return withTime
    ? d.toLocaleString(i18n.global.locale.value, { dateStyle: 'medium', timeStyle: 'short' })
    : d.toLocaleDateString(i18n.global.locale.value, { dateStyle: 'medium' });
}
