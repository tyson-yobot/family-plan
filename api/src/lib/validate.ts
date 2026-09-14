import {
  CHORES_RATINGS,
  GOAL_STATUSES,
  TEMPLATES,
  type GoalStatus,
  type TemplateName,
} from './templates.js';

export interface GoalStatusEntry {
  goal: string;
  status: GoalStatus;
  reflection?: string;
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
 * `previousGoals` is the goal list from this person's most recent submission.
 * When it is non-empty the closing-the-loop answers are required, because the
 * worksheet would not have let them past that step either.
 */
export function validatePayload(
  templateName: TemplateName,
  payload: unknown,
  previousGoals: string[],
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

  // Closing the loop, where there is a previous cycle to close.
  if (previousGoals.length > 0) {
    const statuses = body.goal_status;
    if (!Array.isArray(statuses) || statuses.length !== previousGoals.length) {
      fail(
        `Last cycle's goals need an answer each: ${previousGoals.length} expected, ` +
          `${Array.isArray(statuses) ? statuses.length : 0} given.`,
      );
    }
    statuses.forEach((entry, i) => {
      const row = asRecord(entry, `The answer for last cycle's goal ${i + 1}`);
      requireText(row.goal, `The goal text for last cycle's goal ${i + 1}`);
      const status = row.status;
      if (typeof status !== 'string' || !GOAL_STATUSES.includes(status as GoalStatus)) {
        fail(
          `Last cycle's goal ${i + 1} needs a status of ${GOAL_STATUSES.join(', ')}.`,
        );
      }
    });

    // Teen and young-adult worksheets ask what they would try differently, but
    // only when the single goal was not finished.
    if (!template.requiresThreeGoals) {
      const status = (statuses[0] as Record<string, unknown>).status;
      if (status === 'Partly' || status === 'Not yet') {
        requireText(
          body.try_differently,
          'One thing you could try differently',
        );
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
