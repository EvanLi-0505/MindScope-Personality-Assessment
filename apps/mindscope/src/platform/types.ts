import type { SqlDriver } from '@mindscope/storage';

export type PlatformKind = 'web' | 'desktop';
export type StorageKind = 'data' | 'logs' | 'cache';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface StorageLocation {
  kind: StorageKind;
  /** Absolute folder on desktop; null on the web (browser-managed storage). */
  path: string | null;
  bytes: number;
  files: number;
}

export interface StorageInfo {
  /** Folder that holds data/, logs/, cache/ (desktop only). */
  root: string | null;
  /** True when the data root was moved with "relocate data" (a pointer file exists). */
  relocated: boolean;
  locations: StorageLocation[];
  databaseBytes: number;
  /** Web only: browser quota estimate. */
  quota?: { usage: number; quota: number };
  /** Web only: whether the browser promised not to evict our storage. */
  persisted?: boolean;
  /** Web only: false when OPFS is unavailable and data lives in memory. */
  durable: boolean;
  cacheClearPending: boolean;
}

export interface BackupInfo {
  name: string;
  bytes: number;
  createdAt: string;
}

export interface EnvInfo {
  platform: PlatformKind;
  appVersion: string;
  engine: string;
  os: string;
}

export interface PdfResult {
  /** Desktop: where the file was written. Web: the browser print dialog was opened. */
  path?: string;
  cancelled?: boolean;
  printedWithBrowser?: boolean;
}

export interface AiKeyStatus {
  /** saved = encrypted on disk; session = this run only; unreadable = saved on another computer/account. */
  state: 'saved' | 'session' | 'none' | 'unreadable';
  hint: string | null;
  /** Whether the key can be stored encrypted on this system. */
  secureStorage: boolean;
}

export interface AiChatMessage {
  role: 'system' | 'user';
  content: string;
}

export interface AiChatRequest {
  requestId: string;
  messages: AiChatMessage[];
  /** For the network record. */
  purpose: string;
  categories: string[];
}

export interface AiChatOutcome {
  content: string;
  model: string;
  tokens: number | null;
  ms: number;
  cancelled: boolean;
}

/** Thrown by AiBridge.chat; `code` is translated in the UI (ai.err.*). */
export class AiCallError extends Error {
  constructor(
    readonly code: string,
    readonly status: number | null,
    readonly detail: string,
  ) {
    super(`${code}${status ? ` (${status})` : ''}: ${detail}`);
    this.name = 'AiCallError';
  }
}

/**
 * Optional AI. Provider address and model come from the saved settings
 * ('ai.config'), never from the call, and the key never comes back to the UI.
 */
export interface AiBridge {
  /** True for the local stand-in used by the test build (no network). */
  simulated?: boolean;
  keyStatus(): Promise<AiKeyStatus>;
  saveKey(key: string, persist: boolean): Promise<AiKeyStatus>;
  clearKey(): Promise<AiKeyStatus>;
  chat(request: AiChatRequest, onDelta: (text: string) => void): Promise<AiChatOutcome>;
  cancel(requestId: string): Promise<void>;
}

export interface Platform {
  kind: PlatformKind;
  db: SqlDriver;
  env(): Promise<EnvInfo>;
  log(level: LogLevel, message: string): void;
  storage: {
    info(): Promise<StorageInfo>;
    /** Desktop only. */
    openFolder(kind: StorageKind | 'backups' | 'exports'): Promise<void>;
    clearLogs(): Promise<{ freedBytes: number }>;
    clearCache(): Promise<{ freedBytes: number; pendingRestart: boolean }>;
    /** Desktop: copy into data/backups. Web: download a .db file. */
    backup(reason?: string): Promise<BackupInfo>;
    listBackups(): Promise<BackupInfo[]>;
    /** Desktop: backup name. Web: a .db file chosen by the user. Current data is backed up first. */
    restore(source: string | File): Promise<void>;
    readRecentLogs(maxLines: number): Promise<string>;
    /** Desktop only: move the data root to another folder (needs restart). */
    relocate?(): Promise<{ newRoot: string } | null>;
  };
  /** Exports the current page as PDF (print stylesheet applies). */
  exportPdf(suggestedName: string): Promise<PdfResult>;
  /** Desktop only: open a PDF exported in this run, or show it in its folder. */
  openExported?(path: string, reveal: boolean): Promise<void>;
  /** Opens a URL in the system browser. Callers must ask the user first. */
  openExternal(url: string): Promise<void>;
  restart(): Promise<void>;
  /** Missing where AI cannot run safely (the web version). */
  ai?: AiBridge;
  /** Test hook: desktop smoke-test target path, if the app was started in smoke mode. */
  smokeTarget?(): Promise<string | null>;
  /** Test hook: local mock AI server for the desktop smoke test. */
  smokeAiBase?(): Promise<string | null>;
  printPdfTo?(path: string): Promise<void>;
  exit?(): Promise<void>;
}
