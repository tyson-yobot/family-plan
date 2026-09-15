/**
 * The dark palette, and one accent colour per person.
 *
 * Dark is the app, not a setting. There is no light theme to fall back to and
 * no toggle: charcoal and graphite surfaces, silver for structure, and each
 * person's own colour used hard against the dark throughout their own space.
 *
 * Every colour here is measured rather than eyeballed. `npm run check:contrast`
 * from the repo root recomputes every pair the app actually renders against
 * WCAG 2.1 and fails the build if one slips. The previous pass measured these
 * against a cream page and none of that carries over, so the whole set was
 * re-measured from scratch against the dark surfaces below.
 *
 * The one thing that changed shape rather than value: an accent is no longer a
 * dark colour under white text. On a dark page an accent has to be bright to be
 * seen at all, and a bright accent under white text is unreadable. So a filled
 * button is the accent with the page's own near-black on top of it, which is
 * what ON_ACCENT is, and that is the pair the check measures.
 */

/** The ink that sits on top of a filled accent. Near-black, from the page itself. */
export const ON_ACCENT = '#0E1012';

export const ACCENTS: Record<string, string> = {
  tyson: '#17A79B', // teal
  danyell: '#F2637F', // coral
  aidan: '#F08A24', // amber
  mariah: '#EE64B0', // pink
  dylan: '#8C99FF', // indigo
};

/**
 * Anybody added later gets a real colour of their own rather than the same
 * grey. A sixth person joining should feel like the other five, and a shared
 * slate would have been the one screen in the app that says "you are the extra
 * one". Picked by a stable hash of the slug, so it never changes under them.
 */
export const SPARE_ACCENTS: string[] = [
  '#5FB0FF', // blue
  '#4FCB82', // green
  '#B78BFF', // violet
  '#D9B23C', // ochre
  '#9FB0C0', // steel
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

/** The raised card colour, which is what a tint is mixed into. Kept in step with
 * --surface-2 in globals.css, and the contrast check reads both. */
export const TINT_BASE = '#1E2226';

/**
 * The accent mixed into the raised card colour, for the soft square behind an
 * icon and for the banner that appears when a section is finished.
 *
 * On the old cream page this mixed towards white. On a dark page mixing towards
 * white produces a pale blob that is brighter than everything around it, so it
 * mixes towards the surface instead and the tint is a darker, warmer version of
 * the card rather than a lighter one.
 *
 * Computed here rather than written as `color-mix` in the stylesheet on
 * purpose: this way the exact colour that ships is a value the contrast check
 * can read and measure, instead of something only the browser ever works out.
 */
export function tintOf(hex: string, strength = 0.22): string {
  const [r, g, b] = channels(hex);
  const [br, bg, bb] = channels(TINT_BASE);
  const mix = (channel: number, base: number) => channel * strength + base * (1 - strength);
  return `#${toHex(mix(r, br))}${toHex(mix(g, bg))}${toHex(mix(b, bb))}`;
}

/** Every custom property a person's own colour sets, ready to spread onto a wrapper. */
export function accentStyle(accent: string): Record<string, string> {
  return {
    '--accent': accent,
    // The same colour reads as text on every surface in this app, because they
    // are all within a few points of each other, so there is no separate
    // brighter variant to keep in step.
    '--accent-ink': accent,
    '--accent-tint': tintOf(accent),
    '--on-accent': ON_ACCENT,
  };
}

export function initialsFor(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}
