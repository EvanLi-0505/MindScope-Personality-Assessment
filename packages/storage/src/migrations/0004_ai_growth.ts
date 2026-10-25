/**
 * 0004 — Phase 5: growth notes written by the user, AI-generated notes, and
 * model / token columns for the network record. AI notes keep which data
 * categories were sent and the basis computed by the app (not by the AI).
 */
export const sql = `
CREATE TABLE growth_notes (
  id          TEXT PRIMARY KEY,
  profile_id  TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date        TEXT NOT NULL,
  text        TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX idx_growth_notes_profile ON growth_notes(profile_id, date DESC);

CREATE TABLE ai_notes (
  id              TEXT PRIMARY KEY,
  profile_id      TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  task            TEXT NOT NULL,
  model           TEXT NOT NULL,
  prompt_version  TEXT NOT NULL,
  categories_json TEXT NOT NULL,
  basis_json      TEXT NOT NULL,
  safety          INTEGER NOT NULL DEFAULT 0,
  content         TEXT NOT NULL,
  created_at      TEXT NOT NULL
);
CREATE INDEX idx_ai_notes_profile ON ai_notes(profile_id, created_at DESC);

ALTER TABLE network_audit ADD COLUMN model TEXT NOT NULL DEFAULT '';
ALTER TABLE network_audit ADD COLUMN tokens INTEGER NOT NULL DEFAULT 0;
`;
