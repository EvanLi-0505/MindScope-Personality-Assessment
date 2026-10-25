import type { SqlParams, Statement } from '@mindscope/storage';

export type WorkerRequest =
  | { id: number; op: 'open' }
  | { id: number; op: 'query'; sql: string; params?: SqlParams }
  | { id: number; op: 'execute'; sql: string; params?: SqlParams }
  | { id: number; op: 'batch'; statements: Statement[] }
  | { id: number; op: 'export' }
  | { id: number; op: 'import'; bytes: ArrayBuffer };

export type WorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };

export interface OpenResult {
  durable: boolean;
  sqliteVersion: string;
}
