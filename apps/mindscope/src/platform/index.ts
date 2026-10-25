import type { Platform } from './types';

export * from './types';

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** Loads only the adapter for the current platform. */
export async function createPlatform(): Promise<Platform> {
  if (isTauri()) {
    const { createDesktopPlatform } = await import('./desktop');
    return createDesktopPlatform();
  }
  const { createWebPlatform } = await import('./web');
  return createWebPlatform();
}
