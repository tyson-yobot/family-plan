/**
 * One accent colour per person, so opening your own link feels like your own
 * space rather than a shared dashboard. Every one of these clears WCAG 2.1 AA
 * (4.5:1) both against white text and against the page background, checked
 * rather than assumed: `npm run check:contrast` from the repo root recomputes
 * every pair in this file and fails if one slips.
 *
 * The colour is no longer only the little circle with an initial in it. It runs
 * through the whole of that person's check-in: the progress bar, the score
 * buttons they tap, the tinted circle behind every icon, and the moment at the
 * end when they finish.
 */
export const ACCENTS: Record<string, string> = {
  tyson: '#0F766E', // teal
  danyell: '#C0453A', // coral
  aidan: '#B45309', // amber
  mariah: '#BE185D', // pink
  dylan: '#4338CA', // indigo
};

/**
 * Anyone added later gets a real colour of their own rather than the same grey.
 * A sixth person joining should feel like the other five, and a shared slate
 * would have been the one screen in the app that says "you are the extra one".
 * Picked by a stable hash of the slug, so it never changes under them.
 */
export const SPARE_ACCENTS: string[] = [
  '#1D4ED8', // blue
  '#15803D', // green
  '#7E22CE', // violet
  '#A16207', // ochre
  '#334155', // slate
];

function hashOf(slug: string): number {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = (hash * 31 + slug.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function accentFor(slug: string): string {
  const known = ACCENTS[slug];
  if (known) return known;
  if (!slug) return SPARE_ACCENTS[SPARE_ACCENTS.length - 1];
  return SPARE_ACCENTS[hashOf(slug) % SPARE_ACCENTS.length];
}

function channels(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function toHex(value: number): string {
  return Math.round(Math.min(255, Math.max(0, value)))
    .toString(16)
    .padStart(2, '0');
}

/**
 * The accent mixed into white, for the soft circle behind an icon and for the
 * banner that appears when a section is finished.
 *
 * Computed here rather than written as `color-mix` in the stylesheet on
 * purpose: this way the exact colour that ships is a value the contrast check
 * can read and measure, instead of something only the browser ever works out.
 */
export function tintOf(hex: string, strength = 0.12): string {
  const [r, g, b] = channels(hex);
  const mix = (channel: number) => channel * strength + 255 * (1 - strength);
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}

/** Every custom property a person's own colour sets, ready to spread onto a wrapper. */
export function accentStyle(accent: string): Record<string, string> {
  return {
    '--accent': accent,
    // The same colour reads as text on the cream page and on a white card, so
    // there is no separate darker variant to keep in step.
    '--accent-ink': accent,
    '--accent-tint': tintOf(accent),
    '--accent-wash': tintOf(accent, 0.06),
  };
}

export function initialsFor(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}
