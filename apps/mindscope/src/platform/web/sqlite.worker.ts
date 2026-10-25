/// <reference lib="webworker" />
/**
 * Web database worker. SQLite runs here (WASM) and stores its file in the
 * browser's Origin Private File System through the "opfs-sahpool" VFS, which
 * works without special HTTP headers (so plain static hosting is enough).
 * If OPFS is unavailable the database lives in memory and the UI warns that
 * nothing will be kept.
 */
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { CONNECTION_PRAGMAS, type SqlParams, type Statement } from '@mindscope/storage';
import type { OpenResult, WorkerRequest, WorkerResponse } from './protocol';

const DB_NAME = '/mindscope.db';

type Sqlite3 = Awaited<ReturnType<typeof sqlite3InitModule>>;
type Db = InstanceType<Sqlite3['oo1']['DB']>;
type Pool = Awaited<ReturnType<Sqlite3['installOpfsSAHPoolVfs']>>;

let sqlite3: Sqlite3 | null = null;
let pool: Pool | null = null;
let db: Db | null = null;

function bind(params?: SqlParams) {
  return (params ?? []).map((p) => (typeof p === 'boolean' ? (p ? 1 : 0) : p));
}

function openDb(): Db {
  const d = pool ? new pool.OpfsSAHPoolDb(DB_NAME) : new sqlite3!.oo1.DB(':memory:', 'c');
  d.exec(CONNECTION_PRAGMAS);
  return d;
}

async function open(): Promise<OpenResult> {
  if (!sqlite3) {
    sqlite3 = await sqlite3InitModule();
    const opfsSupported = typeof navigator !== 'undefined' && !!navigator.storage?.getDirectory;
    try {
      pool = await sqlite3.installOpfsSAHPoolVfs({ name: 'mindscope-sahpool', initialCapacity: 6 });
    } catch (err) {
      sqlite3 = null;
      if (opfsSupported) {
        // OPFS exists but its files are locked: another tab already has MindScope open.
        // Falling back to memory here would silently hide the user's data.
        throw new Error('OPFS_LOCKED');
      }
      console.warn('[mindscope] OPFS unavailable, using an in-memory database', err);
      sqlite3 = await sqlite3InitModule();
      pool = null;
    }
  }
  if (!db) db = openDb();
  return { durable: pool !== null, sqliteVersion: sqlite3.version.libVersion };
}

function requireDb(): Db {
  if (!db) throw new Error('Database is not open');
  return db;
}

function query(sql: string, params?: SqlParams) {
  return requireDb().exec({ sql, bind: bind(params), rowMode: 'object', returnValue: 'resultRows' });
}

function execute(sql: string, params?: SqlParams) {
  const d = requireDb();
  d.exec({ sql, bind: bind(params) });
  return { changes: d.changes() };
}

function batch(statements: Statement[]) {
  const d = requireDb();
  d.exec('BEGIN IMMEDIATE');
  try {
    for (const s of statements) {
      if (s.params === undefined) d.exec(s.sql);
      else d.exec({ sql: s.sql, bind: bind(s.params) });
    }
    d.exec('COMMIT');
  } catch (err) {
    d.exec('ROLLBACK');
    throw err;
  }
}

function exportDb(): Uint8Array {
  const d = requireDb();
  return sqlite3!.capi.sqlite3_js_db_export(d);
}

async function importDb(bytes: ArrayBuffer): Promise<void> {
  if (!pool) throw new Error('Persistent browser storage is unavailable; cannot restore.');
  db?.close();
  db = null;
  await pool.importDb(DB_NAME, bytes);
  db = openDb();
}

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data;
  let res: WorkerResponse;
  try {
    let result: unknown;
    switch (req.op) {
      case 'open':
        result = await open();
        break;
      case 'query':
        result = query(req.sql, req.params);
        break;
      case 'execute':
        result = execute(req.sql, req.params);
        break;
      case 'batch':
        batch(req.statements);
        result = null;
        break;
      case 'export':
        result = exportDb();
        break;
      case 'import':
        await importDb(req.bytes);
        result = null;
        break;
    }
    res = { id: req.id, ok: true, result };
  } catch (err) {
    res = { id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(res);
};
