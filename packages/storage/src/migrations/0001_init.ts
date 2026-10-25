/**
 * 0001 — initial schema (see docs/phase0/PHASE0_方案.md §5).
 *
 * Rules for future migrations:
 *  - never edit a migration that has shipped (its checksum is verified at startup);
 *  - add a new file 000N_*.ts and register it in ./index.ts;
 *  - the app backs the database up before applying pending migrations.
 */
export const sql = `
CREATE TABLE app_settings (
  key         TEXT PRIMARY KEY,
  value_json  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- ── Person cards ─────────────────────────────────────────────────────────
CREATE TABLE profiles (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL CHECK (length(trim(name)) > 0),
  avatar_json TEXT NOT NULL,
  birth_year  INTEGER CHECK (birth_year IS NULL OR birth_year BETWEEN 1900 AND 2100),
  gender      TEXT,
  occupation  TEXT,
  note        TEXT,
  is_demo     INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0, 1)),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX idx_profiles_name ON profiles(name);

CREATE TABLE tags (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (length(trim(name)) > 0),
  color       TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);

CREATE TABLE profile_tags (
  profile_id  TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tag_id      TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (profile_id, tag_id)
) WITHOUT ROWID;
CREATE INDEX idx_profile_tags_tag ON profile_tags(tag_id);

-- ── Instruments and immutable item-bank versions ─────────────────────────
CREATE TABLE instruments (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('personality', 'wellbeing')),
  name_i18n   TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE instrument_versions (
  id            TEXT PRIMARY KEY,
  instrument_id TEXT NOT NULL REFERENCES instruments(id) ON DELETE RESTRICT,
  version       TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('draft', 'published', 'retired')),
  is_builtin    INTEGER NOT NULL DEFAULT 0 CHECK (is_builtin IN (0, 1)),
  content_hash  TEXT NOT NULL,
  title_i18n    TEXT NOT NULL,
  scales_json   TEXT NOT NULL,
  scoring_json  TEXT NOT NULL,
  modes_json    TEXT NOT NULL,
  license       TEXT,
  source        TEXT,
  created_at    TEXT NOT NULL,
  UNIQUE (instrument_id, version)
);

CREATE TABLE bank_items (
  version_id  TEXT NOT NULL REFERENCES instrument_versions(id) ON DELETE CASCADE,
  item_id     TEXT NOT NULL,
  ordinal     INTEGER NOT NULL,
  target      TEXT NOT NULL,
  key         INTEGER NOT NULL CHECK (key IN (-1, 1)),
  weight      REAL NOT NULL DEFAULT 1.0 CHECK (weight > 0),
  scale_id    TEXT NOT NULL,
  text_i18n   TEXT NOT NULL,
  tags_json   TEXT NOT NULL DEFAULT '[]',
  modes_json  TEXT,
  enabled     INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  PRIMARY KEY (version_id, item_id)
) WITHOUT ROWID;
CREATE INDEX idx_bank_items_target ON bank_items(version_id, target);

-- ── Test sessions, answers, results ──────────────────────────────────────
CREATE TABLE test_sessions (
  id            TEXT PRIMARY KEY,
  profile_id    TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  version_id    TEXT NOT NULL REFERENCES instrument_versions(id) ON DELETE RESTRICT,
  mode          TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  seed          INTEGER NOT NULL,
  planned_count INTEGER NOT NULL CHECK (planned_count > 0),
  sequence_json TEXT NOT NULL DEFAULT '[]',
  cursor        INTEGER NOT NULL DEFAULT 0,
  flags_json    TEXT NOT NULL DEFAULT '[]',
  elapsed_ms    INTEGER NOT NULL DEFAULT 0,
  started_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  completed_at  TEXT
);
CREATE INDEX idx_sessions_profile_status ON test_sessions(profile_id, status);

CREATE TABLE answers (
  session_id  TEXT NOT NULL REFERENCES test_sessions(id) ON DELETE CASCADE,
  item_id     TEXT NOT NULL,
  value       INTEGER,
  time_ms     INTEGER NOT NULL DEFAULT 0,
  revisions   INTEGER NOT NULL DEFAULT 0,
  answered_at TEXT NOT NULL,
  PRIMARY KEY (session_id, item_id)
) WITHOUT ROWID;

CREATE TABLE results (
  id             TEXT PRIMARY KEY,
  session_id     TEXT NOT NULL UNIQUE REFERENCES test_sessions(id) ON DELETE CASCADE,
  profile_id     TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  version_id     TEXT NOT NULL REFERENCES instrument_versions(id) ON DELETE RESTRICT,
  mode           TEXT NOT NULL,
  type_code      TEXT,
  engine_version TEXT NOT NULL,
  summary_json   TEXT NOT NULL,
  created_at     TEXT NOT NULL
);
CREATE INDEX idx_results_profile_time ON results(profile_id, created_at DESC);
CREATE INDEX idx_results_version ON results(version_id);

CREATE TABLE dimension_scores (
  result_id  TEXT NOT NULL REFERENCES results(id) ON DELETE CASCADE,
  dimension  TEXT NOT NULL,
  score      REAL,
  se         REAL,
  n          INTEGER NOT NULL,
  pole       TEXT,
  band       TEXT,
  PRIMARY KEY (result_id, dimension)
) WITHOUT ROWID;

CREATE TABLE function_scores (
  result_id  TEXT NOT NULL REFERENCES results(id) ON DELETE CASCADE,
  func       TEXT NOT NULL,
  score      REAL,
  se         REAL,
  n          INTEGER NOT NULL,
  rank       INTEGER,
  PRIMARY KEY (result_id, func)
) WITHOUT ROWID;

CREATE TABLE reports (
  id          TEXT PRIMARY KEY,
  result_id   TEXT NOT NULL REFERENCES results(id) ON DELETE CASCADE,
  file_name   TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

-- ── Every outbound network request (AI, v2) is recorded here ─────────────
CREATE TABLE network_audit (
  id              TEXT PRIMARY KEY,
  at              TEXT NOT NULL,
  endpoint        TEXT NOT NULL,
  purpose         TEXT NOT NULL,
  categories_json TEXT NOT NULL,
  bytes           INTEGER NOT NULL DEFAULT 0,
  outcome         TEXT NOT NULL
);
`;
