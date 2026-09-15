/**
 * Splitting a section into several small screens.
 *
 * The problem this solves: section one of the adult worksheet is eleven nearly
 * identical score-and-reason cards plus two long written answers, all on one
 * endlessly scrolling screen, and the progress bar does not move until every
 * one of them is answered. It reads as a wall rather than as a conversation.
 *
 * So a section is cut into parts of three or so questions. Each part is its own
 * step, with its own place in the progress indicator and its own save, which
 * means quitting part way through section one now costs a couple of answers
 * rather than eleven.
 *
 * Nothing here changes a question, its wording, its order, or whether it is
 * required. The same fields are asked in the same sequence; they are simply
 * handed over a few at a time.
 */

import type { Field, Section } from './worksheets';

/**
 * One question as the pacing sees it. A section's field list is not quite the
 * right unit, because the adult "three goals" field is really three separate
 * four-part questions and belongs on three screens rather than one.
 */
export type Unit =
  | { kind: 'field'; field: Field }
  /** One of the three ninety-day goals, by row. */
  | { kind: 'goal'; row: number };

export type Part = Unit[];

/**
 * How much room a question takes on a phone, in units of "one scored area".
 *
 * These are weights rather than counts because the questions are not the same
 * size. Three scored areas fit a screen comfortably; three long written answers
 * do not, and one goal is four boxes on its own.
 */
function weigh(unit: Unit): number {
  if (unit.kind === 'goal') return 3;
  const field = unit.field;
  switch (field.kind) {
    case 'my_area':
      // A name, a score and a reason, and the first time it is asked it is the
      // decision the whole worksheet hangs off. It gets a screen to itself.
      return 3;
    case 'area':
      return 1;
    case 'choice':
      // A choice grows a follow-up box the moment it is answered.
      return 2;
    case 'goals3':
      // Expanded into three goal units before weighing, so this cannot happen.
      return 3;
    case 'text':
      return field.long ? 1.5 : 1;
  }
}

/** Groups that can share a screen. A run only ever mixes questions of one shape. */
function runKey(unit: Unit): string {
  if (unit.kind === 'goal') return 'goal';
  return unit.field.kind;
}

/** Comfortable on a phone. Three scored areas, or two long written answers. */
const TARGET_WEIGHT = 3;

/**
 * A lone leftover question is worse than a slightly fuller screen, so a final
 * part this light is folded back into the one before it, up to this ceiling.
 */
const ORPHAN_WEIGHT = 1.4;
const MERGE_CEILING = 4;

function expand(fields: Field[]): Unit[] {
  const units: Unit[] = [];
  for (const field of fields) {
    if (field.kind === 'goals3') {
      units.push({ kind: 'goal', row: 0 }, { kind: 'goal', row: 1 }, { kind: 'goal', row: 2 });
    } else {
      units.push({ kind: 'field', field });
    }
  }
  return units;
}

function total(part: Part): number {
  return part.reduce((sum, unit) => sum + weigh(unit), 0);
}

/**
 * Cuts one section into the screens it should be asked over.
 *
 * Deterministic: the same section always produces the same parts, which matters
 * because a half-finished worksheet remembers which step it was on. If this
 * ever became dependent on the answers, resuming would land somebody in the
 * wrong place.
 */
export function partsOf(section: Section): Part[] {
  const units = expand(section.fields);
  if (units.length === 0) return [[]];

  const parts: Part[] = [];
  let current: Part = [];

  for (const unit of units) {
    const sameShape = current.length > 0 && runKey(current[0]) === runKey(unit);
    const fits = total(current) + weigh(unit) <= TARGET_WEIGHT;
    if (current.length > 0 && !(sameShape && fits)) {
      parts.push(current);
      current = [];
    }
    current.push(unit);
  }
  if (current.length > 0) parts.push(current);

  return fold(parts);
}

/**
 * Folds a screen holding one thin question back into its neighbour, so nobody
 * taps continue for a single short box. Swept across the whole list rather than
 * only the last screen: where a thin one lands depends on the section, and a
 * question added later would otherwise quietly strand one.
 */
function fold(parts: Part[]): Part[] {
  const result = [...parts];
  for (let i = result.length - 1; i >= 0; i--) {
    const part = result[i];
    if (total(part) > ORPHAN_WEIGHT) continue;
    const canMerge = (other: Part | undefined) =>
      Boolean(
        other &&
          runKey(other[0]) === runKey(part[0]) &&
          total(other) + total(part) <= MERGE_CEILING,
      );
    if (canMerge(result[i - 1])) {
      result.splice(i - 1, 2, [...result[i - 1], ...part]);
    } else if (canMerge(result[i + 1])) {
      result.splice(i, 2, [...part, ...result[i + 1]]);
    }
  }
  return result;
}

/** Every section's parts, in order. Cheap enough to hold in a memo. */
export function partsForSections(sections: Section[]): Part[][] {
  return sections.map(partsOf);
}
