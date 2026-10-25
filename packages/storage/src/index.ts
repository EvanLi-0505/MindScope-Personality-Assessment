export * from './driver';
export * from './migrate';
export { MIGRATIONS, LATEST_SCHEMA_VERSION, type Migration } from './migrations';
export * from './repositories/settings';
export * from './repositories/profiles';
export * from './repositories/stats';
export * from './repositories/bank';
export * from './repositories/sessions';
export * from './repositories/results';
export * from './repositories/scales';
export * from './repositories/notes';
export * from './repositories/bigfive';

import type { SqlDriver } from './driver';
import { BankRepository } from './repositories/bank';
import { ProfilesRepository, TagsRepository } from './repositories/profiles';
import { ResultsRepository } from './repositories/results';
import { ScalesRepository } from './repositories/scales';
import { BigFiveRepository } from './repositories/bigfive';
import { AiNotesRepository, GrowthNotesRepository, NetworkAuditRepository } from './repositories/notes';
import { SessionsRepository } from './repositories/sessions';
import { SettingsRepository } from './repositories/settings';
import { StatsRepository } from './repositories/stats';

/** All repositories bound to one driver. */
export function createRepositories(db: SqlDriver) {
  return {
    settings: new SettingsRepository(db),
    profiles: new ProfilesRepository(db),
    tags: new TagsRepository(db),
    stats: new StatsRepository(db),
    bank: new BankRepository(db),
    sessions: new SessionsRepository(db),
    results: new ResultsRepository(db),
    scales: new ScalesRepository(db),
    bigfive: new BigFiveRepository(db),
    growth: new GrowthNotesRepository(db),
    aiNotes: new AiNotesRepository(db),
    network: new NetworkAuditRepository(db),
  };
}

export type Repositories = ReturnType<typeof createRepositories>;
