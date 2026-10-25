/** A person card. Only `name` is required (data minimisation). */
export interface Profile {
  id: string;
  name: string;
  avatar: Avatar;
  birthYear: number | null;
  gender: string | null;
  occupation: string | null;
  note: string | null;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
  tags: Tag[];
}

export type Avatar =
  | { kind: 'preset'; icon: string; color: string }
  /** Small square picture stored inline (≈ 10–30 KB), so it travels with backups. */
  | { kind: 'image'; dataUrl: string };

export interface Tag {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
}

export interface ProfileInput {
  name: string;
  avatar?: Avatar;
  birthYear?: number | null;
  gender?: string | null;
  occupation?: string | null;
  note?: string | null;
  isDemo?: boolean;
}

export const AVATAR_ICONS = ['leaf', 'sun', 'moon', 'star', 'wave', 'mountain', 'flower', 'cloud'] as const;
export const AVATAR_COLORS = ['#1F7A6D', '#2BA88F', '#4F7BE0', '#5B4FE0', '#B05BD6', '#E0708A', '#E09A3E', '#6B7A8F'] as const;

export const DEFAULT_AVATAR: Avatar = { kind: 'preset', icon: 'leaf', color: '#1F7A6D' };

export const NAME_MAX = 40;
export const NOTE_MAX = 2000;

export type FieldError = { field: keyof ProfileInput; code: 'required' | 'too_long' | 'out_of_range' | 'invalid' };

/** Largest inline avatar accepted (the app resizes pictures to 160×160 first). */
export const AVATAR_MAX_CHARS = 300_000;
const AVATAR_DATA_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

export function isValidAvatar(avatar: Avatar): boolean {
  if (avatar.kind === 'preset') return typeof avatar.icon === 'string' && /^#[0-9a-fA-F]{6}$/.test(avatar.color);
  return avatar.dataUrl.length <= AVATAR_MAX_CHARS && AVATAR_DATA_URL.test(avatar.dataUrl);
}

/** Shared validation so web, desktop and storage tests agree on the rules. */
export function validateProfileInput(input: ProfileInput, currentYear = new Date().getFullYear()): FieldError[] {
  const errors: FieldError[] = [];
  const name = input.name?.trim() ?? '';
  if (!name) errors.push({ field: 'name', code: 'required' });
  else if ([...name].length > NAME_MAX) errors.push({ field: 'name', code: 'too_long' });
  if (input.birthYear != null && (input.birthYear < 1900 || input.birthYear > currentYear)) {
    errors.push({ field: 'birthYear', code: 'out_of_range' });
  }
  if (input.note != null && [...input.note].length > NOTE_MAX) errors.push({ field: 'note', code: 'too_long' });
  if (input.avatar && !isValidAvatar(input.avatar)) errors.push({ field: 'avatar', code: 'invalid' });
  return errors;
}
