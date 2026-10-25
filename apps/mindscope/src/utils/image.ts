import { AVATAR_MAX_CHARS } from '@mindscope/core';

const SIZE = 160;
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'];

export class AvatarImageError extends Error {
  constructor(readonly code: 'not_image' | 'too_big') {
    super(code);
  }
}

/**
 * Turns a picture chosen by the user into a small square JPEG data URL.
 * Everything happens locally in the page; the file is never uploaded anywhere.
 */
export async function toAvatarDataUrl(file: File): Promise<string> {
  if (!ACCEPTED.includes(file.type)) throw new AvatarImageError('not_image');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new AvatarImageError('not_image'));
      el.src = url;
    });
    // Centre crop to a square, then scale down.
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - side) / 2;
    const sy = (img.naturalHeight - side) / 2;
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff'; // transparent PNGs get a white background in JPEG
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);
    for (const quality of [0.86, 0.7, 0.5]) {
      const data = canvas.toDataURL('image/jpeg', quality);
      if (data.length <= AVATAR_MAX_CHARS) return data;
    }
    throw new AvatarImageError('too_big');
  } finally {
    URL.revokeObjectURL(url);
  }
}
