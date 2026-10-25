/**
 * Test build only (`vite build --mode e2e`): a local stand-in for an AI
 * provider so the AI screens can be tested end to end without any network
 * access. It follows the desktop shell's rules (AI must be on, a key must be
 * set, the address must pass the same checks) and writes the same network
 * record. Model names starting with "mock-" select failure cases.
 *
 * Production web builds never include this file (see web/index.ts).
 */
import type { SqlDriver } from '@mindscope/storage';
import { createRepositories } from '@mindscope/storage';
import { AI_CONFIG_KEY, DEFAULT_AI_CONFIG, checkBaseUrl, type AiConfig } from '../../ai/config';
import { AiCallError, type AiBridge, type AiKeyStatus } from '../types';

export function createSimulatedAi(db: SqlDriver): AiBridge {
  const repos = createRepositories(db);
  let key: string | null = null;
  let persisted = false;
  const cancelled = new Set<string>();

  const status = (): AiKeyStatus => ({
    state: key ? (persisted ? 'saved' : 'session') : 'none',
    hint: key ? `••••${key.slice(-4)}` : null,
    secureStorage: true,
  });

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  return {
    simulated: true,
    async keyStatus() {
      return status();
    },
    async saveKey(k, persist) {
      if (!k.trim() || !/^[\x21-\x7e]+$/.test(k.trim())) throw new Error('invalid key');
      key = k.trim();
      persisted = persist;
      return status();
    },
    async clearKey() {
      key = null;
      return status();
    },
    async cancel(requestId) {
      cancelled.add(requestId);
    },
    async chat(req, onDelta) {
      const cfg = { ...DEFAULT_AI_CONFIG, ...(await repos.settings.get<Partial<AiConfig>>(AI_CONFIG_KEY, {})) };
      if (!cfg.enabled) throw new AiCallError('not_enabled', null, 'AI is turned off');
      if (checkBaseUrl(cfg.baseUrl)) throw new AiCallError('bad_url', null, 'bad address');
      if (!key) throw new AiCallError('no_key', null, 'no API key');
      const started = performance.now();
      const bytes = new TextEncoder().encode(JSON.stringify(req.messages)).length;
      const record = (outcome: string, tokens: number) =>
        repos.network.record({ endpoint: 'simulated://local/chat/completions', purpose: req.purpose, categories: req.categories, bytes, outcome, model: cfg.model, tokens });

      if (cfg.model === 'mock-401') {
        await record('invalid_key (401)', 0);
        throw new AiCallError('invalid_key', 401, `Incorrect API key provided: ${key}`.replace(key, '[key]'));
      }
      if (cfg.model === 'mock-429') {
        await record('rate_limit (429)', 0);
        throw new AiCallError('rate_limit', 429, 'Rate limit reached for requests');
      }

      const isTest = req.purpose === 'connectionTest';
      const chunks = isTest
        ? ['OK']
        : [
            '## 分析依据\n\n根据你提供的数据（模拟回答，不是真实 AI）。\n\n',
            '## 主要发现\n\n- **稳定的部分**：示例要点一\n- 示例要点二\n\n',
            '<img src=x onerror="window.__xss=1"> [链接](javascript:window.__xss=1)\n\n',
            '## 局限与提醒\n\n这是测试构建中的模拟内容。',
          ];
      const delay = cfg.model === 'mock-slow' ? 400 : 30;
      let content = '';
      for (const c of chunks) {
        await sleep(delay);
        if (cancelled.delete(req.requestId)) {
          await record('cancelled', 0);
          return { content, model: cfg.model, tokens: null, ms: Math.round(performance.now() - started), cancelled: true };
        }
        content += c;
        onDelta(c);
      }
      const tokens = Math.ceil(content.length / 2) + Math.ceil(bytes / 4);
      await record('ok', tokens);
      return { content, model: cfg.model, tokens, ms: Math.round(performance.now() - started), cancelled: false };
    },
  };
}
