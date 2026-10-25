/**
 * 0003 — descriptive metadata for wellbeing scales (short name, instructions,
 * licence note, citation, translation disclaimer). Stored with each immutable
 * version so old results always show the texts they were taken with.
 */
export const sql = `
ALTER TABLE instrument_versions ADD COLUMN meta_json TEXT NOT NULL DEFAULT '{}';
`;
