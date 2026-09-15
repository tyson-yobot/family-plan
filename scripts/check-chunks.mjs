/**
 * Proves that breaking a section into several screens does not lose a question.
 *
 * This is the check that matters most about the pacing change. Cutting section
 * one of the adult worksheet from a single eleven-question page into five small
 * ones is only safe if every question still appears, exactly once, in the order
 * it was written. A dropped question would not error anywhere: the worksheet
 * would simply never ask it, the server would reject the submission for a field
 * nobody was ever shown, and the person filling it in would have no idea why.
 *
 * So this walks the real chunking the app uses, against the real worksheets, and
 * fails if a question is missing, duplicated, reordered, or if a screen has gone
 * back to being a wall.
 *
 * Run from the repo root:  npm run check:chunks
 */

import { partsOf } from '../web/lib/chunks.ts';
import { WORKSHEETS } from '../web/lib/worksheets.ts';

/** More than this many questions on one screen is the thing being fixed. */
const MOST_PER_SCREEN = 4;
/** Long written answers are heavier than a score, so fewer of them fit. */
const MOST_LONG_PER_SCREEN = 2;

/** The questions a section asks, in order, as the chunking should see them. */
function expected(section) {
  const list = [];
  for (const field of section.fields) {
    if (field.kind === 'goals3') {
      list.push('goal:0', 'goal:1', 'goal:2');
    } else if (field.kind === 'my_area') {
      list.push('my_area');
    } else {
      list.push(`${field.kind}:${field.id}`);
    }
  }
  return list;
}

function nameOf(unit) {
  if (unit.kind === 'goal') return `goal:${unit.row}`;
  if (unit.field.kind === 'my_area') return 'my_area';
  return `${unit.field.kind}:${unit.field.id}`;
}

const problems = [];

for (const [template, worksheet] of Object.entries(WORKSHEETS)) {
  console.log(`\n${template}`);
  worksheet.sections.forEach((section, sectionIndex) => {
    const parts = partsOf(section);
    const shape = parts.map((part) => part.length).join(' + ');
    console.log(
      `  ${sectionIndex + 1}. ${section.title}` +
        `\n       ${parts.length} screen${parts.length === 1 ? '' : 's'}, ${shape} question(s)`,
    );

    const where = `${template}, section ${sectionIndex + 1} (${section.title})`;
    const flat = parts.flat().map(nameOf);
    const want = expected(section);

    if (flat.join('|') !== want.join('|')) {
      problems.push(
        `${where}: the questions asked are not the questions written down.` +
          `\n    written:  ${want.join(', ')}` +
          `\n    asked:    ${flat.join(', ')}`,
      );
    }

    parts.forEach((part, partIndex) => {
      const at = `${where}, screen ${partIndex + 1}`;
      if (part.length === 0) {
        problems.push(`${at}: is empty, so somebody would tap continue past nothing.`);
      }
      if (part.length > MOST_PER_SCREEN) {
        problems.push(
          `${at}: holds ${part.length} questions, more than the ${MOST_PER_SCREEN} this change exists to stop.`,
        );
      }
      const longOnes = part.filter(
        (unit) => unit.kind === 'field' && unit.field.kind === 'text' && unit.field.long,
      ).length;
      if (longOnes > MOST_LONG_PER_SCREEN) {
        problems.push(`${at}: holds ${longOnes} long written answers on one screen.`);
      }
    });
  });
}

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):\n`);
  for (const problem of problems) console.error(`  ${problem}\n`);
  process.exit(1);
}

console.log('\nEvery question is still asked, once, in the order it was written.');
