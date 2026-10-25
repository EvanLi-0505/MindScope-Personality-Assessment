import type { BandLevel } from '@mindscope/core';

/**
 * Calm colours for bands: no alarm-red, so ordinary fluctuations are not
 * presented as something frightening (Phase 0 §7).
 */
export const LEVEL_COLORS: Record<BandLevel, string> = {
  good: '#2BA88F',
  minimal: '#1F7A6D',
  mild: '#C99A2E',
  moderate: '#E08A3E',
  high: '#D9692E',
  severe: '#B85424',
};
