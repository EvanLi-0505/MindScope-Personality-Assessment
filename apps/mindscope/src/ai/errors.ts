import type { AiCallError } from '../platform';

const KNOWN = new Set([
  'not_enabled',
  'no_key',
  'bad_url',
  'bad_config',
  'invalid_key',
  'not_found',
  'quota',
  'rate_limit',
  'bad_request',
  'server',
  'timeout',
  'network',
  'empty',
  'provider_error',
]);

/** A short explanation in the user's language, plus the provider's own message when useful. */
export function aiErrorText(t: (key: string, values?: Record<string, unknown>) => string, err: AiCallError): string {
  const base = t(`ai.err.${KNOWN.has(err.code) ? err.code : 'other'}`);
  const status = err.status ? ` (HTTP ${err.status})` : '';
  const detail = err.detail && !['not_enabled', 'no_key', 'timeout'].includes(err.code) ? `\n${t('ai.err.detail', { msg: err.detail })}` : '';
  return `${base}${status}${detail}`;
}
