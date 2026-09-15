/**
 * Measures every colour pair the app actually renders, against WCAG 2.1.
 *
 * It exists because "it looks fine" is not a check. The accents are used three
 * different ways now, not one: as a button background under white text, as text
 * on the cream page and on a white card, and as a soft tint behind an icon. A
 * colour can be comfortable in one of those and fail in another, and the one
 * that fails is invisible to whoever picked it.
 *
 * Run from the repo root:  npm run check:contrast
 *
 * Thresholds, and why each one:
 *   4.5  normal text (WCAG 1.4.3 AA)
 *   3.0  large text, and non-text things you have to be able to make out, such
 *        as an icon or the progress bar (WCAG 1.4.11)
 *
 * The colours are read out of web/lib/theme.ts and web/app/globals.css rather
 * than copied here, so this cannot quietly pass against colours that are no
 * longer the ones shipping.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function readAccents() {
  const source = readFileSync(join(root, 'web/lib/theme.ts'), 'utf8');
  const named = [...source.matchAll(/^\s*(\w+):\s*'(#[0-9a-fA-F]{6})'/gm)].map((m) => [
    m[1],
    m[2],
  ]);
  const spare = [...source.matchAll(/^\s*'(#[0-9a-fA-F]{6})',\s*\/\/\s*(\w+)/gm)].map((m) => [
    m[2],
    m[1],
  ]);
  return [...named, ...spare];
}

function readPalette() {
  const css = readFileSync(join(root, 'web/app/globals.css'), 'utf8');
  const pick = (name) => {
    const found = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,6})`));
    if (!found) throw new Error(`--${name} is not in globals.css any more.`);
    return found[1];
  };
  return {
    page: pick('page'),
    ink: pick('ink'),
    inkSoft: pick('ink-soft'),
    line: pick('line'),
    card: pick('card'),
  };
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
  const source = readFileSync(join(root, 'web/lib/theme.ts'), 'utf8');
  const found = source.match(/export function tintOf\([^)]*strength\s*=\s*([\d.]+)/);
  if (!found) {
    throw new Error('tintOf in web/lib/theme.ts no longer has a default strength to read.');
  }
  return Number(found[1]);
}

/** The same mix as tintOf in web/lib/theme.ts, at the strength read from it. */
function tint(hex, strength) {
  const mixed = channels(hex).map((channel) =>
    Math.round(channel * strength + 255 * (1 - strength)),
  );
  return `#${mixed.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

const accents = readAccents();
const palette = readPalette();
const tintStrength = readTintStrength();

const checks = [];
const add = (what, fg, bg, need) =>
  checks.push({ what, fg, bg, need, got: ratio(fg, bg) });

// Fixed text colours, which carry every word in the app.
add('body text on the page', palette.ink, palette.page, 4.5);
add('body text on a card', palette.ink, palette.card, 4.5);
add('quieter text on the page', palette.inkSoft, palette.page, 4.5);
add('quieter text on a card', palette.inkSoft, palette.card, 4.5);
add('the error red on a card', '#B3261E', palette.card, 4.5);

for (const [name, accent] of accents) {
  const soft = tint(accent, tintStrength);
  add(`${name}: white on the accent button`, '#ffffff', accent, 4.5);
  add(`${name}: accent as a link on the page`, accent, palette.page, 4.5);
  add(`${name}: accent as a link on a card`, accent, palette.card, 4.5);
  add(`${name}: the icon inside its tinted circle`, accent, soft, 3);
  add(`${name}: body text on the finished banner`, palette.ink, soft, 4.5);
  add(`${name}: quieter text on the finished banner`, palette.inkSoft, soft, 4.5);
  add(`${name}: the progress bar against its track`, accent, palette.line, 3);
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
  console.error('\nA colour in this app does not meet the contrast it needs. Fix it, do not lower the threshold.');
  process.exit(1);
}
