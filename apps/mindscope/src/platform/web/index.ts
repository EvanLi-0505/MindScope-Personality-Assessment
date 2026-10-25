import type { SqlDriver, SqlParams, Statement } from '@mindscope/storage';
import { APP_VERSION, fileStamp } from '@mindscope/core';
import type { BackupInfo, LogLevel, Platform, StorageInfo } from '../types';
import type { OpenResult, WorkerRequest, WorkerResponse } from './protocol';

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

class WorkerDriver implements SqlDriver {
  private seq = 0;
  private pending = new Map<number, Pending>();

  constructor(private readonly worker: Worker) {
    worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const p = this.pending.get(ev.data.id);
      if (!p) return;
      this.pending.delete(ev.data.id);
      if (ev.data.ok) p.resolve(ev.data.result);
      else p.reject(new Error(ev.data.error));
    };
  }

  call<T>(req: DistributiveOmit<WorkerRequest, 'id'>, transfer: Transferable[] = []): Promise<T> {
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.worker.postMessage({ ...req, id }, transfer);
    });
  }

  query<T>(sql: string, params?: SqlParams) {
    return this.call<T[]>({ op: 'query', sql, params });
  }
  execute(sql: string, params?: SqlParams) {
    return this.call<{ changes: number }>({ op: 'execute', sql, params });
  }
  async batch(statements: readonly Statement[]) {
    await this.call<null>({ op: 'batch', statements: [...statements] });
  }
}

/** Logs stay in this tab's memory: the web build has no log files. */
const LOG_LIMIT = 500;
const logBuffer: string[] = [];

function download(bytes: Uint8Array, name: string) {
  const blob = new Blob([bytes as BlobPart], { type: 'application/vnd.sqlite3' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function createWebPlatform(): Promise<Platform> {
  const worker = new Worker(new URL('./sqlite.worker.ts', import.meta.url), { type: 'module' });
  const driver = new WorkerDriver(worker);
  const opened = await driver.call<OpenResult>({ op: 'open' });

  // Ask the browser not to evict our data under storage pressure (best effort).
  let persisted = false;
  try {
    persisted = (await navigator.storage?.persisted?.()) || (await navigator.storage?.persist?.()) || false;
  } catch {
    /* not supported */
  }

  const log = (level: LogLevel, message: string) => {
    const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${message}`;
    logBuffer.push(line);
    if (logBuffer.length > LOG_LIMIT) logBuffer.shift();
    (level === 'error' ? console.error : level === 'warn' ? console.warn : console.info)(`[mindscope] ${message}`);
  };

  const backup = async (reason = 'manual'): Promise<BackupInfo> => {
    const bytes = await driver.call<Uint8Array>({ op: 'export' });
    const name = `mindscope-backup-${fileStamp()}${reason === 'manual' ? '' : `-${reason}`}.db`;
    download(bytes, name);
    log('info', `backup downloaded (${reason}), ${bytes.byteLength} bytes`);
    return { name, bytes: bytes.byteLength, createdAt: new Date().toISOString() };
  };

  // AI: the browser's security policy blocks outside requests and offers no
  // safe place for a key, so the web version has none. The test build gets a
  // local stand-in; `import.meta.env.MODE` is fixed at build time, so the
  // stand-in is not even included in normal builds.
  const ai = import.meta.env.MODE === 'e2e' ? (await import('./simulatedAi')).createSimulatedAi(driver) : undefined;

  return {
    kind: 'web',
    db: driver,
    ai,
    async env() {
      return {
        platform: 'web',
        appVersion: APP_VERSION,
        engine: `SQLite ${opened.sqliteVersion} (WASM)`,
        os: navigator.userAgent,
      };
    },
    log,
    storage: {
      async info(): Promise<StorageInfo> {
        const est = await navigator.storage?.estimate?.();
        const [row] = await driver.query<{ bytes: number }>(
          'SELECT page_count * page_size AS bytes FROM pragma_page_count(), pragma_page_size()',
        );
        return {
          root: null,
          relocated: false,
          locations: [
            { kind: 'data', path: null, bytes: row?.bytes ?? 0, files: 1 },
            { kind: 'logs', path: null, bytes: logBuffer.join('\n').length, files: 0 },
            { kind: 'cache', path: null, bytes: 0, files: 0 },
          ],
          databaseBytes: row?.bytes ?? 0,
          quota: est ? { usage: est.usage ?? 0, quota: est.quota ?? 0 } : undefined,
          persisted,
          durable: opened.durable,
          cacheClearPending: false,
        };
      },
      async openFolder() {
        throw new Error('not supported on the web');
      },
      async clearLogs() {
        const freedBytes = logBuffer.join('\n').length;
        logBuffer.length = 0;
        return { freedBytes };
      },
      async clearCache() {
        return { freedBytes: 0, pendingRestart: false };
      },
      backup,
      async listBackups() {
        return [];
      },
      async restore(source) {
        if (!(source instanceof File)) throw new Error('Choose a .db backup file');
        const bytes = await source.arrayBuffer();
        const header = new TextDecoder().decode(new Uint8Array(bytes, 0, 15));
        if (header !== 'SQLite format 3') throw new Error('NOT_SQLITE');
        await backup('before-restore');
        await driver.call<null>({ op: 'import', bytes }, [bytes]);
        log('info', `restored from ${source.name}`);
      },
      async readRecentLogs(maxLines) {
        return logBuffer.slice(-maxLines).join('\n');
      },
    },
    async exportPdf() {
      window.print();
      return { printedWithBrowser: true };
    },
    async openExternal(url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    },
    async restart() {
      location.reload();
    },
  };
}
