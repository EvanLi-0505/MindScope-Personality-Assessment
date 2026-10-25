import { sql as m0001 } from './0001_init';
import { sql as m0002 } from './0002_bank_maturity';
import { sql as m0003 } from './0003_instrument_meta';
import { sql as m0004 } from './0004_ai_growth';

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

/** Ordered list of all migrations. Append only. */
export const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: 'init', sql: m0001 },
  { version: 2, name: 'bank_maturity', sql: m0002 },
  { version: 3, name: 'instrument_meta', sql: m0003 },
  { version: 4, name: 'ai_growth', sql: m0004 },
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]!.version;
