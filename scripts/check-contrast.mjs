/**
 * Measures every colour pair the app actually renders, against WCAG 2.1.
 *
 * It exists because "it looks fine" is not a check, and it was rewritten from
 * scratch for the dark palette. None of the previous measurements carried over:
 * they were all taken against a cream page, and an accent that was comfortable
 * as dark text on cream is unreadable as dark text on charcoal. Every pair
 * below was re-derived from what the components actually draw now.
 *
 * The one structural change. An accent used to be a dark colour under white
 * text. On a dark page an accent has to be bright to be visible at all, and
 * white on a bright accent fails. So a filled button is now the accent with the
 * page's own near-black on top, and that inversion is what gets measured.
 *
 * Run from the repo root:  npm run check:contrast
 *
 * Thresholds, and why each one:
 *   4.5  normal text (WCAG 1.4.3 AA)
 *   3.0  large text, and non-text things you have to be able to make out, such
 *        as an icon, a ring, or the progress bar (WCAG 1.4.11)
 *
 * The colours are read out of web/lib/theme.ts and web/app/globals.css rather
 * than copied here, so this cannot quietly pass against colours that are no
 * longer the ones shipping.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const themeSource = readFileSync(join(root, 'web/lib/theme.ts'), 'utf8');
const cssSource = readFileSync(join(root, 'web/app/globals.css'), 'utf8');

function readAccents() {
  const named = [...themeSource.matchAll(/^\s*(\w+):\s*'(#[0-9a-fA-F]{6})'/gm)].map((m) => [
    m[1],
    m[2],
  ]);

  // The spare palette is read out of its own array rather than by scanning the
  // whole file, and then counted. A spare accent whose line this could not read
  // used to be skipped in silence, so the colour shipped unmeasured under a
  // green summary, which is a check that reports success while the failure it
  // exists to catch is happening.
  const block = themeSource.match(/SPARE_ACCENTS:\s*string\[\]\s*=\s*\[([\s\S]*?)\]/);
  if (!block) throw new Error('SPARE_ACCENTS is no longer an array in web/lib/theme.ts.');
  const lines = block[1].split('\n').filter((line) => line.trim() !== '');
  const spare = [];
  for (const line of lines) {
    const found = line.match(/'(#[0-9a-fA-F]{6})'\s*,\s*\/\/\s*(\S+)/);
    if (!found) {
      throw new Error(
        `A spare accent could not be read, so it would have shipped unmeasured: ${line.trim()}\n` +
          "Each line must be  '#RRGGBB', // name",
      );
    }
    spare.push([found[2], found[1]]);
  }
  if (spare.length !== lines.length) {
    throw new Error(`SPARE_ACCENTS has ${lines.length} entries but ${spare.length} were read.`);
  }

  return [...named, ...spare];
}

function cssColour(name) {
  const found = cssSource.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,6})`));
  if (!found) throw new Error(`--${name} is not in globals.css any more.`);
  return found[1];
}

function readPalette() {
  return {
    page: cssColour('page'),
    surface: cssColour('surface'),
    surface2: cssColour('surface-2'),
    ink: cssColour('ink'),
    inkSoft: cssColour('ink-soft'),
    silver: cssColour('silver'),
    line: cssColour('line'),
    card: cssColour('card'),
    bad: cssColour('bad'),
    good: cssColour('good'),
    warn: cssColour('warn'),
  };
}

/**
 * The accent the shared pages fall back to, straight out of globals.css. The
 * landing page and the family board have no one person and so no colour of
 * their own, and this is what they draw their structure in.
 */
function readDefaultAccent() {
  return { accent: cssColour('accent'), tint: cssColour('accent-tint') };
}

/** The ink that sits on top of a filled accent, read out of theme.ts. */
function readOnAccent() {
  const found = themeSource.match(/export const ON_ACCENT = '(#[0-9a-fA-F]{6})'/);
  if (!found) throw new Error('ON_ACCENT is no longer declared in web/lib/theme.ts.');
  return found[1];
}

/**
 * The colour a tint is mixed into, read out of theme.ts, and checked against
 * the stylesheet. On the old cream page a tint went towards white and the base
 * was implicit; on a dark page it goes towards the raised card colour, so the
 * base is a real value that two files have to agree on. If they drift, the
 * tints this measures are not the ones on screen.
 */
function readTintBase() {
  const found = themeSource.match(/export const TINT_BASE = '(#[0-9a-fA-F]{6})'/);
  if (!found) throw new Error('TINT_BASE is no longer declared in web/lib/theme.ts.');
  const css = cssColour('surface-2');
  if (found[1].toLowerCase() !== css.toLowerCase()) {
    throw new Error(
      `TINT_BASE is ${found[1]} in web/lib/theme.ts but --surface-2 is ${css} in globals.css. ` +
        'Every tint measured here would be a colour the app does not draw.',
    );
  }
  return found[1];
}

function channels(hex) {
  let clean = hex.replace('#', '');
  if (clean.length === 3) clean = [...clean].map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16));
}

function luminance(hex) {
  const [r, g, b] = channels(hex).map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a, b) {
  const first = luminance(a);
  const second = luminance(b);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * How strong the tint behind an icon is. Read out of tintOf in
 * web/lib/theme.ts rather than written down twice, so that changing the tint
 * there changes what is measured here, instead of leaving this passing against
 * a colour the app no longer uses.
 */
function readTintStrength() {
  const found = themeSource.match(/export function tintOf\([^)]*strength\s*=\s*([\d.]+)/);
  if (!found) {
    throw new Error('tintOf in web/lib/theme.ts no longer has a default strength to read.');
  }
  return Number(found[1]);
}

/** The same mix as tintOf in web/lib/theme.ts, at the strength and base read from it. */
function tint(hex, strength, base) {
  const baseChannels = channels(base);
  const mixed = channels(hex).map((channel, i) =>
    Math.round(channel * strength + baseChannels[i] * (1 - strength)),
  );
  return `#${mixed.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

const accents = readAccents();
const palette = readPalette();
const tintStrength = readTintStrength();
const tintBase = readTintBase();
const onAccent = readOnAccent();

const checks = [];
const add = (what, fg, bg, need) => checks.push({ what, fg, bg, need, got: ratio(fg, bg) });

// The three surfaces every word in the app sits on: the page itself, a card,
// and a raised card. They are close together but not identical, and the quiet
// grey is the one that would fail first.
for (const [where, background] of [
  ['the page', palette.page],
  ['a card', palette.card],
  ['a raised card', palette.surface2],
]) {
  add(`body text on ${where}`, palette.ink, background, 4.5);
  add(`quieter text on ${where}`, palette.inkSoft, background, 4.5);
  add(`silver structure text on ${where}`, palette.silver, background, 4.5);
  add(`the trouble red on ${where}`, palette.bad, background, 4.5);
  add(`the done green on ${where}`, palette.good, background, 4.5);
  add(`the amber warning on ${where}`, palette.warn, background, 4.5);
}

/*
 * The bars on the money screens, added in Mission 2.
 *
 * These are drawn on a --surface track inside a raised card, which is a
 * different pairing from the accent progress bar above: that one sits on
 * --line. A filled bar is the only thing on those screens carrying "over" or
 * "under", so it is a non-text element with meaning and WCAG 1.4.11 applies at
 * 3:1.
 *
 * Measured rather than assumed because green and red on a near-black track are
 * exactly the pairing that looks obviously fine and is not.
 */
for (const [name, colour] of [
  ['the quarterly bar when they are ahead', palette.good],
  ['the quarterly bar when they are behind', palette.bad],
  ['a category bar that is over its cap', palette.bad],
]) {
  add(`${name}, against its track`, colour, palette.surface, 3);
}

/*
 * Non-text things that carry meaning, at the 3:1 that WCAG 1.4.11 asks for.
 *
 * Two checks used to live here at 1.2 and 1.05. Those are not WCAG thresholds;
 * they were numbers picked below what the palette already did, so they could
 * not fail and therefore proved nothing, under a file whose own instruction two
 * paragraphs up is "fix it, do not lower the threshold".
 *
 * They were also hiding something real. The "not started" ring on the family
 * board was drawn in --line, which is 1.45 against the page: the status that
 * matters most on that screen was very nearly invisible, and the check was
 * reporting green. The ring is now drawn in --ink-soft and measured here.
 *
 * --line itself is not checked, because it is a hairline between two surfaces
 * rather than a thing carrying meaning, and saying that plainly is better than
 * a threshold set low enough to let it through.
 */
add('the not-started ring on the board', palette.inkSoft, palette.page, 3);
add('a card outline that has to be found', palette.silver, palette.card, 3);

// The shared pages, the landing page and the family board, run on the defaults
// in globals.css rather than on anybody's accent.
const defaults = readDefaultAccent();
add('the shared-page accent on the page', defaults.accent, palette.page, 4.5);
add('the shared-page accent on a card', defaults.accent, palette.card, 4.5);
add('the shared-page icon inside its tint', defaults.accent, defaults.tint, 3);
add('body text on the shared-page tint', palette.ink, defaults.tint, 4.5);
add('the ink that sits on a filled shared button', onAccent, defaults.accent, 4.5);

for (const [name, accent] of accents) {
  const soft = tint(accent, tintStrength, tintBase);
  add(`${name}: the ink on a filled accent button`, onAccent, accent, 4.5);
  add(`${name}: accent as text on the page`, accent, palette.page, 4.5);
  add(`${name}: accent as text on a card`, accent, palette.card, 4.5);
  add(`${name}: accent as text on a raised card`, accent, palette.surface2, 4.5);
  add(`${name}: the icon inside its tinted square`, accent, soft, 3);
  add(`${name}: body text on the finished banner`, palette.ink, soft, 4.5);
  add(`${name}: quieter text on the finished banner`, palette.inkSoft, soft, 4.5);
  add(`${name}: the progress bar against its track`, accent, palette.line, 3);
  add(`${name}: the completion ring against a raised card`, accent, palette.surface2, 3);
}

let failed = 0;
for (const check of checks) {
  const ok = check.got >= check.need;
  if (!ok) failed++;
  const mark = ok ? 'ok  ' : 'FAIL';
  console.log(
    `${mark} ${check.got.toFixed(2).padStart(6)} (needs ${check.need})  ${check.what}` +
      `  ${check.fg} on ${check.bg}`,
  );
}

console.log(`\n${checks.length} pairs checked, ${failed} failing.`);
if (failed > 0) {
  console.error(
    '\nA colour in this app does not meet the contrast it needs. Fix it, do not lower the threshold.',
  );
  process.exit(1);
}
