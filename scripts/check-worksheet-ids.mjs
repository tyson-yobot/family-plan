// Compares the field ids the API validates against with the field ids the
// worksheet actually renders. They live in two files because the api and web
// build contexts do not contain each other, and a silent drift between them
// would produce a worksheet that can be filled in and then refuses to submit.
//
// Run from the repo root: node scripts/check-worksheet-ids.mjs
// Exits 1 and names every mismatch when they disagree.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const apiSource = readFileSync(join(root, 'api', 'src', 'lib', 'templates.ts'), 'utf8');
const webSource = readFileSync(join(root, 'web', 'lib', 'worksheets.ts'), 'utf8');

/** Pulls the ids out of one named array or object block in a source file. */
function idsBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  if (start === -1) throw new Error(`Could not find "${startMarker}". This check needs updating.`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end === -1) throw new Error(`Could not find "${endMarker}". This check needs updating.`);
  const block = source.slice(start, end);
  return [...block.matchAll(/id:\s*'([a-z0-9_]+)'/g)].map((match) => match[1]);
}

const apiSets = {
  adult: idsBetween(apiSource, 'export const ADULT_AREAS', 'export const TEEN_AREAS'),
  teen: idsBetween(apiSource, 'export const TEEN_AREAS', 'export const YOUNG_ADULT_AREAS'),
  young_adult: idsBetween(apiSource, 'export const YOUNG_ADULT_AREAS', 'export const TEMPLATES'),
};

const webSets = {
  adult: idsBetween(webSource, 'const ADULT: Worksheet', "kind: 'text',").filter(Boolean),
  teen: idsBetween(webSource, 'const TEEN: Worksheet', "kind: 'text',").filter(Boolean),
  young_adult: idsBetween(webSource, 'const YOUNG_ADULT: Worksheet', "kind: 'text',").filter(
    Boolean,
  ),
};

/*
 * The goal-area lists are a second pair that can drift, and they are NOT the
 * same thing as the scored areas above. A goal can be filed under an area that
 * no check-in scores, so these lists are a superset. Checked here because the
 * failure is the same shape: a goal area offered on screen that the server
 * refuses, or the other way round.
 */
const extraBlock = apiSource.slice(apiSource.indexOf('EXTRA_GOAL_AREAS'));
const apiExtra = {
  adult: idsBetween(extraBlock, '  adult: [', '  teen: ['),
  teen: idsBetween(extraBlock, '  teen: [', '  young_adult: ['),
  young_adult: idsBetween(extraBlock, '  young_adult: [', '};'),
};
const webExtraSource = readFileSync(join(root, 'web', 'lib', 'areas.ts'), 'utf8');
const webExtra = {
  adult: idsBetween(webExtraSource, '  adult: [', '  teen: ['),
  teen: idsBetween(webExtraSource, '  teen: [', '  young_adult: ['),
  young_adult: idsBetween(webExtraSource, '  young_adult: [', '};'),
};

let failed = false;
for (const template of ['adult', 'teen', 'young_adult']) {
  const api = apiExtra[template];
  const web = webExtra[template];
  const same = api.length === web.length && api.every((id, i) => id === web[i]);
  if (same) {
    console.log(`${template}: ${api.length} extra goal areas, ids match.`);
  } else {
    failed = true;
    console.log(`${template}: GOAL AREA MISMATCH`);
    console.log(`  api/src/lib/templates.ts : ${api.join(', ')}`);
    console.log(`  web/lib/areas.ts         : ${web.join(', ')}`);
  }
}

for (const template of ['adult', 'teen', 'young_adult']) {
  const api = apiSets[template];
  const web = webSets[template];
  const sameLength = api.length === web.length;
  const sameOrder = sameLength && api.every((id, i) => id === web[i]);
  if (sameOrder) {
    console.log(`${template}: ${api.length} scored areas, ids match.`);
  } else {
    failed = true;
    console.log(`${template}: MISMATCH`);
    console.log(`  api/src/lib/templates.ts : ${api.join(', ')}`);
    console.log(`  web/lib/worksheets.ts    : ${web.join(', ')}`);
  }
}

if (failed) {
  console.log('\nThe two lists have drifted. Fix them before deploying either side.');
  process.exit(1);
}
console.log('\nThe scored area ids match on both sides.');
