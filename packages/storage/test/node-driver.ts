import { DatabaseSync } from 'node:sqlite';
import { CONNECTION_PRAGMAS, type SqlDriver, type SqlParams, type Statement } from '../src/driver';

/** Test-only driver on Node's built-in SQLite, same contract as the app drivers. */
export class NodeSqliteDriver implements SqlDriver {
  readonly raw: DatabaseSync;

  constructor(path = ':memory:') {
    this.raw = new DatabaseSync(path);
    this.raw.exec(CONNECTION_PRAGMAS);
  }

  private bind(params: SqlParams = []) {
    return params.map((p) => (typeof p === 'boolean' ? (p ? 1 : 0) : p));
  }

  async query<T>(sql: string, params?: SqlParams): Promise<T[]> {
    return this.raw.prepare(sql).all(...this.bind(params)) as T[];
  }

  async execute(sql: string, params?: SqlParams) {
    const r = this.raw.prepare(sql).run(...this.bind(params));
    return { changes: Number(r.changes) };
  }

  async batch(statements: readonly Statement[]) {
    this.raw.exec('BEGIN IMMEDIATE');
    try {
      for (const s of statements) {
        if (s.params === undefined) this.raw.exec(s.sql);
        else this.raw.prepare(s.sql).run(...this.bind(s.params));
      }
      this.raw.exec('COMMIT');
    } catch (err) {
      this.raw.exec('ROLLBACK');
      throw err;
    }
  }

  close() {
    this.raw.close();
  }
}
