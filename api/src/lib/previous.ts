/**
 * What a person's most recent submission hands forward into their next
 * check-in. Everything here is that person's own earlier answer, read back only
 * to them, and only once they have entered their own code.
 *
 * Goals used to be carried forward from here too. They are not any more: a goal
 * lives on the person's own goal board until they close it, so the check-in
 * asks the board what is still open rather than asking what happened to be
 * written down last month. See lib/goals.ts.
 */
export interface CarriedForward {
  myArea: string | null;
  lastInitiativeNote: string | null;
  noteToSelf: string | null;
}

export const EMPTY_CARRIED_FORWARD: CarriedForward = {
  myArea: null,
  lastInitiativeNote: null,
  noteToSelf: null,
};

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

export function carryForward(payload: unknown): CarriedForward {
  if (typeof payload !== 'object' || payload === null) {
    return EMPTY_CARRIED_FORWARD;
  }
  const body = payload as Record<string, unknown>;

  const myArea =
    typeof body.my_area === 'object' && body.my_area !== null
      ? text((body.my_area as Record<string, unknown>).name)
      : null;

  return {
    myArea,
    lastInitiativeNote: text(body.went_beyond),
    noteToSelf: text(body.note_to_self),
  };
}
