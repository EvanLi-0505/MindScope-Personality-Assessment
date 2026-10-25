/**
 * 0002 — remember whether a bank version is experimental (self-written, not yet
 * validated) so every result page can say so, even years later.
 */
export const sql = `
ALTER TABLE instrument_versions ADD COLUMN maturity TEXT NOT NULL DEFAULT 'experimental'
  CHECK (maturity IN ('experimental', 'published'));
CREATE INDEX idx_sessions_status ON test_sessions(status, updated_at DESC);
`;
