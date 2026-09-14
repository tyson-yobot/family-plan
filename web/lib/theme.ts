/**
 * One accent colour per person, so opening your own link feels like your own
 * space rather than a shared dashboard. Every one of these clears WCAG 2.1 AA
 * (4.5:1) both against white text and against the page background, checked
 * rather than assumed. Easy to swap: change the hex and nothing else moves.
 */
export const ACCENTS: Record<string, string> = {
  tyson: '#0F766E', // teal
  danyell: '#C0453A', // coral
  aidan: '#B45309', // amber
  mariah: '#BE185D', // pink
  dylan: '#4338CA', // indigo
};

/** Anyone added later without an accent gets the same readable slate. */
export const FALLBACK_ACCENT = '#334155';

export function accentFor(slug: string): string {
  return ACCENTS[slug] ?? FALLBACK_ACCENT;
}

export function initialsFor(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}
