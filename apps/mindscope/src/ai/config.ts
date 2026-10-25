/** AI settings shared by the settings page, the AI panel and the test build's stand-in. */

export type AiProviderId = 'bailianCn' | 'bailianIntl' | 'custom';

export interface AiConfig {
  enabled: boolean;
  /** When the user accepted the explanation shown on first enabling. */
  consentAt: string | null;
  provider: AiProviderId;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  timeoutSecs: number;
}

export const AI_CONFIG_KEY = 'ai.config';

export const AI_PROVIDERS: { id: AiProviderId; baseUrl: string; models: string[] }[] = [
  { id: 'bailianCn', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', models: ['qwen-plus', 'qwen3.8-max'] },
  { id: 'bailianIntl', baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', models: ['qwen-plus', 'qwen3.8-max'] },
  { id: 'custom', baseUrl: '', models: [] },
];

export const DEFAULT_AI_CONFIG: AiConfig = {
  enabled: false,
  consentAt: null,
  provider: 'bailianCn',
  baseUrl: AI_PROVIDERS[0]!.baseUrl,
  model: 'qwen-plus',
  temperature: 0.7,
  maxTokens: 1500,
  timeoutSecs: 90,
};

export type BaseUrlProblem = 'invalid' | 'http' | 'scheme' | 'extras' | null;

/** Same rules as the desktop shell (src-tauri/src/ai.rs `chat_endpoint`). */
export function checkBaseUrl(value: string): BaseUrlProblem {
  let u: URL;
  try {
    u = new URL(value.trim());
  } catch {
    return 'invalid';
  }
  if (u.username || u.password || u.search || u.hash) return 'extras';
  if (u.protocol === 'https:') return u.hostname ? null : 'invalid';
  if (u.protocol === 'http:') return ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) ? null : 'http';
  return 'scheme';
}

export function hostOf(value: string): string {
  try {
    return new URL(value).host;
  } catch {
    return value;
  }
}
