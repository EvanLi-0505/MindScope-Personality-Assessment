import {
  DEFAULT_AVATAR,
  nowIso,
  uuidv7,
  validateProfileInput,
  type Avatar,
  type FieldError,
  type Profile,
  type ProfileInput,
  type Tag,
} from '@mindscope/core';
import type { SqlDriver, SqlValue, Statement } from '../driver';

export class ValidationError extends Error {
  constructor(readonly errors: FieldError[]) {
    super(`Invalid input: ${errors.map((e) => `${e.field}:${e.code}`).join(', ')}`);
    this.name = 'ValidationError';
  }
}

interface ProfileRow {
  id: string;
  name: string;
  avatar_json: string;
  birth_year: number | null;
  gender: string | null;
  occupation: string | null;
  note: string | null;
  is_demo: number;
  created_at: string;
  updated_at: string;
}

interface TagRow {
  id: string;
  name: string;
  color: string;
  sort_order: number;
}

export interface ProfileQuery {
  search?: string;
  /** Profiles must carry ALL of these tags. */
  tagIds?: string[];
}

function parseAvatar(json: string): Avatar {
  try {
    return JSON.parse(json) as Avatar;
  } catch {
    return DEFAULT_AVATAR;
  }
}

function toTag(r: TagRow): Tag {
  return { id: r.id, name: r.name, color: r.color, sortOrder: r.sort_order };
}

function emptyToNull(v: string | null | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

export class ProfilesRepository {
  constructor(private readonly db: SqlDriver) {}

  async list(query: ProfileQuery = {}): Promise<Profile[]> {
    const where: string[] = [];
    const params: SqlValue[] = [];
    if (query.search?.trim()) {
      where.push("(p.name LIKE ? ESCAPE '\\' OR p.note LIKE ? ESCAPE '\\')");
      const like = `%${query.search.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      params.push(like, like);
    }
    for (const tagId of query.tagIds ?? []) {
      where.push('EXISTS (SELECT 1 FROM profile_tags pt WHERE pt.profile_id = p.id AND pt.tag_id = ?)');
      params.push(tagId);
    }
    const rows = await this.db.query<ProfileRow>(
      `SELECT p.* FROM profiles p ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY p.created_at DESC`,
      params,
    );
    return this.attachTags(rows);
  }

  async get(id: string): Promise<Profile | null> {
    const rows = await this.db.query<ProfileRow>('SELECT * FROM profiles WHERE id = ?', [id]);
    const [profile] = await this.attachTags(rows);
    return profile ?? null;
  }

  async count(): Promise<number> {
    const [row] = await this.db.query<{ n: number }>('SELECT COUNT(*) AS n FROM profiles');
    return row?.n ?? 0;
  }

  async create(input: ProfileInput, tagIds: string[] = []): Promise<Profile> {
    const errors = validateProfileInput(input);
    if (errors.length) throw new ValidationError(errors);
    const id = uuidv7();
    const at = nowIso();
    const statements: Statement[] = [
      {
        sql: `INSERT INTO profiles (id, name, avatar_json, birth_year, gender, occupation, note, is_demo, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          id,
          input.name.trim(),
          JSON.stringify(input.avatar ?? DEFAULT_AVATAR),
          input.birthYear ?? null,
          emptyToNull(input.gender),
          emptyToNull(input.occupation),
          emptyToNull(input.note),
          input.isDemo ? 1 : 0,
          at,
          at,
        ],
      },
      ...tagIds.map((tagId) => ({ sql: 'INSERT INTO profile_tags (profile_id, tag_id) VALUES (?, ?)', params: [id, tagId] })),
    ];
    await this.db.batch(statements);
    return (await this.get(id))!;
  }

  async update(id: string, input: ProfileInput, tagIds?: string[]): Promise<Profile> {
    const errors = validateProfileInput(input);
    if (errors.length) throw new ValidationError(errors);
    const statements: Statement[] = [
      {
        sql: `UPDATE profiles SET name = ?, avatar_json = ?, birth_year = ?, gender = ?, occupation = ?, note = ?, updated_at = ?
              WHERE id = ?`,
        params: [
          input.name.trim(),
          JSON.stringify(input.avatar ?? DEFAULT_AVATAR),
          input.birthYear ?? null,
          emptyToNull(input.gender),
          emptyToNull(input.occupation),
          emptyToNull(input.note),
          nowIso(),
          id,
        ],
      },
    ];
    if (tagIds) {
      statements.push({ sql: 'DELETE FROM profile_tags WHERE profile_id = ?', params: [id] });
      for (const tagId of tagIds) {
        statements.push({ sql: 'INSERT INTO profile_tags (profile_id, tag_id) VALUES (?, ?)', params: [id, tagId] });
      }
    }
    await this.db.batch(statements);
    const updated = await this.get(id);
    if (!updated) throw new Error(`Profile ${id} not found`);
    return updated;
  }

  /** Deletes the profile and, through ON DELETE CASCADE, all of its sessions and results. */
  async remove(id: string): Promise<void> {
    await this.db.execute('DELETE FROM profiles WHERE id = ?', [id]);
  }

  private async attachTags(rows: ProfileRow[]): Promise<Profile[]> {
    if (!rows.length) return [];
    const placeholders = rows.map(() => '?').join(',');
    const tagRows = await this.db.query<TagRow & { profile_id: string }>(
      `SELECT pt.profile_id, t.id, t.name, t.color, t.sort_order
       FROM profile_tags pt JOIN tags t ON t.id = pt.tag_id
       WHERE pt.profile_id IN (${placeholders})
       ORDER BY t.sort_order, t.name`,
      rows.map((r) => r.id),
    );
    const byProfile = new Map<string, Tag[]>();
    for (const t of tagRows) {
      const list = byProfile.get(t.profile_id) ?? [];
      list.push(toTag(t));
      byProfile.set(t.profile_id, list);
    }
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      avatar: parseAvatar(r.avatar_json),
      birthYear: r.birth_year,
      gender: r.gender,
      occupation: r.occupation,
      note: r.note,
      isDemo: r.is_demo === 1,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      tags: byProfile.get(r.id) ?? [],
    }));
  }
}

export interface TagWithUsage extends Tag {
  profileCount: number;
}

export class TagsRepository {
  constructor(private readonly db: SqlDriver) {}

  async list(): Promise<TagWithUsage[]> {
    const rows = await this.db.query<TagRow & { profile_count: number }>(
      `SELECT t.id, t.name, t.color, t.sort_order, COUNT(pt.profile_id) AS profile_count
       FROM tags t LEFT JOIN profile_tags pt ON pt.tag_id = t.id
       GROUP BY t.id ORDER BY t.sort_order, t.name`,
    );
    return rows.map((r) => ({ ...toTag(r), profileCount: r.profile_count }));
  }

  /** Returns the existing tag when the name is already taken (case-insensitive). */
  async create(name: string, color: string): Promise<Tag> {
    const trimmed = name.trim();
    if (!trimmed) throw new ValidationError([{ field: 'name', code: 'required' }]);
    const existing = await this.db.query<TagRow>('SELECT * FROM tags WHERE name = ? COLLATE NOCASE', [trimmed]);
    if (existing.length) return toTag(existing[0]!);
    const [max] = await this.db.query<{ m: number | null }>('SELECT MAX(sort_order) AS m FROM tags');
    const tag: Tag = { id: uuidv7(), name: trimmed, color, sortOrder: (max?.m ?? -1) + 1 };
    await this.db.execute('INSERT INTO tags (id, name, color, sort_order, created_at) VALUES (?, ?, ?, ?, ?)', [
      tag.id,
      tag.name,
      tag.color,
      tag.sortOrder,
      nowIso(),
    ]);
    return tag;
  }

  async update(id: string, name: string, color: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) throw new ValidationError([{ field: 'name', code: 'required' }]);
    await this.db.execute('UPDATE tags SET name = ?, color = ? WHERE id = ?', [trimmed, color, id]);
  }

  /** Removes the tag from every profile; the profiles themselves are kept. */
  async remove(id: string): Promise<void> {
    await this.db.execute('DELETE FROM tags WHERE id = ?', [id]);
  }
}
