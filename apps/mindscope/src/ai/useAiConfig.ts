import { ref } from 'vue';
import { useAppStore } from '../stores/app';
import { AI_CONFIG_KEY, DEFAULT_AI_CONFIG, type AiConfig } from './config';

/** Loads and saves the AI settings (no secrets: the key is held by the platform). */
export function useAiConfig() {
  const app = useAppStore();
  const config = ref<AiConfig>({ ...DEFAULT_AI_CONFIG });
  const loaded = ref(false);

  async function load() {
    config.value = { ...DEFAULT_AI_CONFIG, ...(await app.r().settings.get<Partial<AiConfig>>(AI_CONFIG_KEY, {})) };
    loaded.value = true;
    return config.value;
  }

  async function save(next: AiConfig) {
    await app.r().settings.set(AI_CONFIG_KEY, next);
    config.value = { ...next };
  }

  return { config, loaded, load, save };
}

let seq = 0;
export function newRequestId() {
  seq += 1;
  return `ai-${Date.now().toString(36)}-${seq}`;
}
