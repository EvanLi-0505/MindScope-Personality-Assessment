/**
 * The only thing a platform has to provide to use MindScope storage.
 * Desktop: Tauri commands backed by rusqlite. Web: sqlite-wasm in a worker.
 * Tests: node:sqlite.
 *
 * Values are JSON-friendly on purpose (they cross the Tauri IPC boundary).
 */
export type SqlValue = string | number | boolean | null;
export type SqlParams = readonly SqlValue[];

export interface Statement {
  sql: string;
  /** When omitted the SQL is run as a script and may contain several statements. */
  params?: SqlParams;
}

export interface SqlDriver {
  query<T = Record<string, unknown>>(sql: string, params?: SqlParams): Promise<T[]>;
  execute(sql: string, params?: SqlParams): Promise<{ changes: number }>;
  /** Runs all statements in ONE transaction: either all apply or none do. */
  batch(statements: readonly Statement[]): Promise<void>;
}

/** Pragmas every driver must apply right after opening the database. */
export const CONNECTION_PRAGMAS = `
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
`;
