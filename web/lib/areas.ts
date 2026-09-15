import type { TemplateName } from './worksheets';
import { WORKSHEETS } from './worksheets';

/**
 * The parts of life a GOAL can be filed under, on this side of the wire.
 *
 * Mirrors `goalAreasFor` in api/src/lib/templates.ts. The two lists have to
 * stay in step, for the same reason the scored-area lists do, and
 * `scripts/check-worksheet-ids.mjs` now checks this pair as well as that one.
 *
 * Read the comment on EXTRA_GOAL_AREAS in the api copy before changing
 * anything here. The short version: this is NOT the list the check-in scores.
 * Adding an entry to the scored-area list adds a question to somebody's
 * check-in, which Mission 2 forbids; adding one here only adds a place to file
 * a goal, which is what was actually wanted.
 */
export interface GoalArea {
  id: string;
  label: string;
}

/** Only the areas that are not already scored on that tier. Order matters. */
export const EXTRA_GOAL_AREAS: Record<TemplateName, GoalArea[]> = {
  adult: [{ id: 'athletics', label: 'Athletics and sport' }],
  teen: [
    { id: 'exercise', label: 'Exercise and being active' },
    { id: 'athletics', label: 'Athletics and sport' },
  ],
  young_adult: [
    { id: 'exercise', label: 'Exercise and being active' },
    { id: 'athletics', label: 'Athletics and sport' },
  ],
};

/**
 * The scored areas for a tier, read off the worksheet itself rather than
 * written out a second time. One less list to drift.
 */
function scoredAreas(template: TemplateName): GoalArea[] {
  const out: GoalArea[] = [];
  for (const section of WORKSHEETS[template].sections) {
    for (const field of section.fields) {
      if (field.kind === 'area') out.push({ id: field.id, label: field.label });
    }
  }
  return out;
}

export function goalAreasFor(template: TemplateName): GoalArea[] {
  return [...scoredAreas(template), ...EXTRA_GOAL_AREAS[template]];
}

/** The label to show for a stored area id, or the raw id if it is free text. */
export function goalAreaLabel(template: TemplateName, id: string | null): string | null {
  if (!id) return null;
  return goalAreasFor(template).find((area) => area.id === id)?.label ?? id;
}
