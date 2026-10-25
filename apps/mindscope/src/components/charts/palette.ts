/** Series colours shared by all charts (readable in light and dark themes). */
export const SERIES_COLORS = ['#1F7A6D', '#5B4FE0', '#E09A3E', '#E0708A', '#4F7BE0', '#2BA88F', '#B05BD6', '#6B7A8F'];

export const AXIS_TEXT = '#7b8896';
export const GRID_LINE = 'rgba(120,135,150,0.22)';

export function shortDate(iso: string, locale: string) {
  return new Date(iso).toLocaleDateString(locale, { month: 'numeric', day: 'numeric', year: '2-digit' });
}

/** Axis labels for points in time; adds the time of day when several fall on the same date. */
export function timeLabels(isos: string[], locale: string): string[] {
  const dup = (xs: string[], i: number) => xs.indexOf(xs[i]!) !== xs.lastIndexOf(xs[i]!);
  const time = (iso: string, seconds: boolean) =>
    new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}) });
  const dates = isos.map((iso) => shortDate(iso, locale));
  const withTime = isos.map((iso, i) => (dup(dates, i) ? `${dates[i]} ${time(iso, false)}` : dates[i]!));
  // Same minute too (quick retakes): add seconds so the points stay distinguishable.
  return isos.map((iso, i) => (dup(withTime, i) ? `${dates[i]} ${time(iso, true)}` : withTime[i]!));
}
