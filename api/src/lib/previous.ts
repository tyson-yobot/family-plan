import type { TemplateName } from './templates.js';
import type { GoalStatusEntry } from './validate.js';

/**
 * What a person's most recent submission hands forward into their next cycle.
 * Everything here is that person's own earlier answer, read back only to them
 * through their own link.
 */
export interface CarriedForward {
  previousGoals: string[];
  myArea: string | null;
  lastCycleStatus: GoalStatusEntry[] | null;
  lastInitiativeNote: string | null;
  noteToSelf: string | null;
}

export const EMPTY_CARRIED_FORWARD: CarriedForward = {
  previousGoals: [],
  myArea: null,
  lastCycleStatus: null,
  lastInitiativeNote: null,
  noteToSelf: null,
};

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

export function carryForward(
  templateName: TemplateName,
  payload: unknown,
): CarriedForward {
  if (typeof payload !== 'object' || payload === null) {
    return EMPTY_CARRIED_FORWARD;
  }
  const body = payload as Record<string, unknown>;

  let previousGoals: string[] = [];
  if (templateName === 'adult') {
    // Adults carry three goals forward.
    const goals = Array.isArray(body.goals) ? body.goals : [];
    previousGoals = goals
      .map((goal) =>
        typeof goal === 'object' && goal !== null
          ? text((goal as Record<string, unknown>).goal)
          : null,
      )
      .filter((goal): goal is string => goal !== null);
  } else {
    // Teen and young-adult worksheets carry one, and it is optional, so there
    // may be nothing to close the loop on next time.
    const goal = text(body.goal_this_month);
    previousGoals = goal ? [goal] : [];
  }

  const myArea =
    typeof body.my_area === 'object' && body.my_area !== null
      ? text((body.my_area as Record<string, unknown>).name)
      : null;

  const lastCycleStatus = Array.isArray(body.goal_status)
    ? (body.goal_status as GoalStatusEntry[])
    : null;

  return {
    previousGoals,
    myArea,
    lastCycleStatus: lastCycleStatus && lastCycleStatus.length > 0 ? lastCycleStatus : null,
    lastInitiativeNote: text(body.went_beyond),
    noteToSelf: text(body.note_to_self),
  };
}
