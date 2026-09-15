import {
  CHORES_RATINGS,
  LOOP_ANSWERS,
  TEMPLATES,
  UNFINISHED_ANSWERS,
  type LoopAnswer,
  type TemplateName,
} from './templates.js';

export interface GoalStatusEntry {
  /** Which goal on their board this answer is about. */
  goal_id: string;
  goal: string;
  status: LoopAnswer;
  reflection?: string;
}

/** A goal still open on somebody's board, as the check-in needs to see it. */
export interface OpenGoal {
  id: string;
  title: string;
}

/** Thrown for anything the person can fix, and turned into a 400 with this message. */
export class ValidationError extends Error {}

function fail(message: string): never {
  throw new ValidationError(message);
}

function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(`${what} is missing or is not in the expected shape.`);
  }
  return value as Record<string, unknown>;
}

function requireText(value: unknown, what: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(`${what} is required.`);
  }
  return value.trim();
}

function requireScore(value: unknown, what: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    fail(`${what} needs a score from ${min} to ${max}.`);
  }
  return value;
}

/**
 * Validates the answers against the required fields for this person's template.
 * The three templates are three distinct shapes, so each is checked in full
 * rather than the client being trusted.
 *
 * `openGoals` is what is still open on this person's own goal board. When it is
 * non-empty, every one of them needs an answer, because the check-in would not
 * have let them past that step either.
 *
 * The answers are matched by goal id rather than by position. A board can be
 * added to from the goal board itself at any moment, including from a second
 * tab while a check-in is open, so "the third answer is about the third goal"
 * is not something this can assume.
 */
export function validatePayload(
  templateName: TemplateName,
  payload: unknown,
  openGoals: OpenGoal[],
): void {
  const template = TEMPLATES[templateName];
  if (!template) {
    // Only reachable if a row carries a template nobody wrote a worksheet for.
    // Without this the next line reads a property of undefined and the whole
    // request fails as a 500, which reads like the server is broken rather
    // than like the data is wrong.
    fail(`There is no worksheet for the template type "${templateName}".`);
  }
  const body = asRecord(payload, 'The worksheet answers');

  // Closing the loop, where there is anything still open to close.
  if (openGoals.length > 0) {
    const statuses = body.goal_status;
    if (!Array.isArray(statuses)) {
      fail('Each goal still open on your board needs an answer.');
    }
    const answered = new Set<string>();
    statuses.forEach((entry, i) => {
      const row = asRecord(entry, `The answer for goal ${i + 1}`);
      const goalId = requireText(row.goal_id, `The goal being answered at position ${i + 1}`);
      if (!openGoals.some((goal) => goal.id === goalId)) {
        fail('One of these answers is about a goal that is not open on your board.');
      }
      requireText(row.goal, `The goal text for goal ${i + 1}`);
      const status = row.status;
      if (typeof status !== 'string' || !LOOP_ANSWERS.includes(status as LoopAnswer)) {
        fail(`Goal ${i + 1} needs one of: ${LOOP_ANSWERS.join(', ')}.`);
      }
      answered.add(goalId);
    });
    const missing = openGoals.filter((goal) => !answered.has(goal.id));
    if (missing.length > 0) {
      fail(
        `${missing.length} goal${missing.length === 1 ? '' : 's'} on your board still ` +
          'needs an answer before this can be sent.',
      );
    }

    /*
     * Teen and young-adult worksheets ask what they would try differently when
     * something did not finish.
     *
     * Asked across ALL their open goals, not just the first one. The rule used
     * to read statuses[0] because those worksheets had one goal and could only
     * ever have one. The goal board removed that: a teen can add goals of their
     * own, so "the first answer" became an arbitrary one of several, and the
     * question was asked or skipped on the strength of whichever goal happened
     * to be at the top of the board.
     */
    if (!template.requiresThreeGoals) {
      const unfinished = statuses.some((entry) =>
        UNFINISHED_ANSWERS.includes((entry as Record<string, unknown>).status as LoopAnswer),
      );
      if (unfinished) {
        requireText(body.try_differently, 'One thing you could try differently');
      }
    }
  }

  // "My area", the one thing on the worksheet they defined themselves.
  if (template.hasMyArea) {
    const myArea = asRecord(body.my_area, 'Your area');
    requireText(myArea.name, 'The name of your area');
    requireScore(
      myArea.score,
      'The score for your area',
      template.myAreaScoreMin,
      template.myAreaScoreMax,
    );
    requireText(myArea.reason, 'The reason for your area score');
  }

  // Scored life areas.
  const areas = asRecord(body.areas, 'Your score for each area');
  for (const area of template.areas) {
    const entry = asRecord(areas[area.id], `"${area.label}"`);
    requireScore(entry.score, `"${area.label}"`, template.scoreMin, template.scoreMax);
    requireText(entry.reason, `The reason for "${area.label}"`);
  }

  // Adults set exactly three goals, each fully filled in.
  if (template.requiresThreeGoals) {
    const goals = body.goals;
    if (!Array.isArray(goals) || goals.length !== 3) {
      fail('Three goals are required, no more and no fewer.');
    }
    goals.forEach((goal, i) => {
      const row = asRecord(goal, `Goal ${i + 1}`);
      requireText(row.goal, `Goal ${i + 1}`);
      requireText(row.owner, `The owner of goal ${i + 1}`);
      requireText(row.due_date, `The due date for goal ${i + 1}`);
      requireText(row.first_action, `The first action this week for goal ${i + 1}`);
    });
  }

  // Teen and young-adult chores check-in.
  if (template.requiresChoresRating) {
    const rating = body.chores_rating;
    if (typeof rating !== 'string' || !CHORES_RATINGS.includes(rating as never)) {
      fail(`The chores and house zone answer needs to be ${CHORES_RATINGS.join(', ')}.`);
    }
  }
}
