import { Channel, invoke } from '@tauri-apps/api/core';
import type { SqlDriver, SqlParams, Statement } from '@mindscope/storage';
import { AiCallError, type AiBridge, type AiChatOutcome, type AiKeyStatus, type BackupInfo, type EnvInfo, type Platform, type StorageInfo } from '../types';

/** Every call goes to a Rust command in src-tauri/src/commands.rs. */
const driver: SqlDriver = {
  query: <T>(sql: string, params?: SqlParams) => invoke<T[]>('db_query', { sql, params: params ?? [] }),
  execute: (sql: string, params?: SqlParams) => invoke<{ changes: number }>('db_execute', { sql, params: params ?? [] }),
  batch: async (statements: readonly Statement[]) => {
    await invoke('db_batch', { statements });
  },
};

/** Rust returns errors as JSON {code, status, message}. */
function toAiError(err: unknown): AiCallError {
  try {
    const e = JSON.parse(String(err)) as { code?: string; status?: number | null; message?: string };
    if (e.code) return new AiCallError(e.code, e.status ?? null, e.message ?? '');
  } catch {
    // not JSON: fall through
  }
  return new AiCallError('internal', null, String(err));
}

const ai: AiBridge = {
  keyStatus: () => invoke<AiKeyStatus>('ai_key_status'),
  saveKey: (key, persist) => invoke<AiKeyStatus>('ai_key_save', { key, persist }),
  clearKey: () => invoke<AiKeyStatus>('ai_key_clear'),
  async chat(request, onDelta) {
    const onEvent = new Channel<{ kind: 'delta'; text: string }>();
    onEvent.onmessage = (ev) => {
      if (ev.kind === 'delta') onDelta(ev.text);
    };
    try {
      return await invoke<AiChatOutcome>('ai_chat', { request, onEvent });
    } catch (err) {
      throw toAiError(err);
    }
  },
  cancel: (requestId) => invoke('ai_cancel', { requestId }),
};

export async function createDesktopPlatform(): Promise<Platform> {
  return {
    kind: 'desktop',
    db: driver,
    env: () => invoke<EnvInfo>('app_env'),
    log(level, message) {
      void invoke('log_message', { level, message }).catch(() => {});
    },
    storage: {
      info: () => invoke<StorageInfo>('storage_info'),
      openFolder: (kind) => invoke('open_folder', { kind }),
      clearLogs: () => invoke<{ freedBytes: number }>('clear_logs'),
      clearCache: () => invoke<{ freedBytes: number; pendingRestart: boolean }>('clear_cache'),
      backup: (reason = 'manual') => invoke<BackupInfo>('backup_now', { reason }),
      listBackups: () => invoke<BackupInfo[]>('list_backups'),
      async restore(source) {
        if (typeof source !== 'string') throw new Error('Choose a backup from the list');
        await invoke('restore_backup', { name: source });
      },
      readRecentLogs: (maxLines) => invoke<string>('read_recent_logs', { maxLines }),
      relocate: () => invoke<{ newRoot: string } | null>('relocate_data_root'),
    },
    async exportPdf(suggestedName) {
      const path = await invoke<string | null>('export_pdf', { suggestedName });
      return path ? { path } : { cancelled: true };
    },
    openExported: (path, reveal) => invoke('open_exported', { path, reveal }),
    openExternal: (url) => invoke('open_external', { url }),
    restart: () => invoke('restart_app'),
    ai,
    smokeTarget: () => invoke<string | null>('smoke_target'),
    smokeAiBase: () => invoke<string | null>('smoke_ai_base'),
    printPdfTo: (path) => invoke('print_pdf_to', { path }),
    exit: () => invoke('exit_app'),
  };
}
