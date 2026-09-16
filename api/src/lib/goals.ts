import { and, asc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { goals, goalSteps, habitLogs, type Goal, type GoalStep } from '../db/schema.js';
import { currentCycleLabel } from './cycle.js';
import { LOOP_ANSWERS, type LoopAnswer, type TemplateName } from './templates.js';

/**
 * A person's goal board: what lives on it, how a check-in puts things there,
 * and how a goal gets closed.
 *
 * Everything in this file is scoped by person id, every time, with no exception
 * and no convenience read that skips it. There is no route anywhere that hands
 * back one person's goals to another, and this is where that has to hold.
 */

export const OPEN = 'open' as const;

export type ClosedStatus = 'hit' | 'missed' | 'dropped';

/**
 * The four timeframes a goal can sit in.
 *
 * Ordered shortest first, and the order is load-bearing rather than
 * decorative: a goal may only hang off one that is LONGER than itself, which is
 * checked by comparing positions in this array. Without that a ten year goal
 * could be attached to a ninety day one, or to itself, and the derived progress
 * below would count in a circle.
 */
export const HORIZONS = ['ninety_day', 'one_year', 'three_year', 'ten_year'] as const;
export type Horizon = (typeof HORIZONS)[number];

export function isHorizon(value: unknown): value is Horizon {
  return typeof value === 'string' && (HORIZONS as readonly string[]).includes(value);
}

/** Whether `parent` is a longer timeframe than `child`. */
export function isLongerThan(parent: Horizon, child: Horizon): boolean {
  return HORIZONS.indexOf(parent) > HORIZONS.indexOf(child);
}

/** Plain words for a horizon, for a screen and for the coach's prompt. */
export const HORIZON_LABELS: Record<Horizon, string> = {
  ninety_day: 'Next 90 days',
  one_year: '1 year',
  three_year: '3 years',
  ten_year: '10 years',
};

export { LOOP_ANSWERS };
export type { LoopAnswer };

export function closedStatusFor(answer: LoopAnswer): ClosedStatus | null {
  if (answer === 'Hit it') return 'hit';
  if (answer === 'Missed it') return 'missed';
  if (answer === 'Changed my mind') return 'dropped';
  return null;
}

export interface GoalWithSteps {
  goal: Goal;
  steps: GoalStep[];
}

async function stepsFor(personId: string, goalIds: string[]): Promise<Map<string, GoalStep[]>> {
  const byGoal = new Map<string, GoalStep[]>();
  if (goalIds.length === 0) return byGoal;
  const rows = await db
    .select()
    .from(goalSteps)
    .where(eq(goalSteps.personId, personId))
    .orderBy(asc(goalSteps.sortOrder), asc(goalSteps.createdAt));
  for (const row of rows) {
    if (!goalIds.includes(row.goalId)) continue;
    const list = byGoal.get(row.goalId) ?? [];
    list.push(row);
    byGoal.set(row.goalId, list);
  }
  return byGoal;
}

/**
 * Everything on this person's board, in the order it was put there, each with
 * its steps. Open and closed together: the screen decides which to show where.
 */
export async function boardFor(personId: string): Promise<GoalWithSteps[]> {
  const rows = await db
    .select()
    .from(goals)
    .where(eq(goals.personId, personId))
    .orderBy(asc(goals.sortOrder), asc(goals.createdAt));
  const steps = await stepsFor(
    personId,
    rows.map((row) => row.id),
  );
  return rows.map((goal) => ({ goal, steps: steps.get(goal.id) ?? [] }));
}

/** The goals a check-in has to ask about, which is everything still open. */
export async function openGoalsFor(personId: string): Promise<Goal[]> {
  return db
    .select()
    .from(goals)
    .where(and(eq(goals.personId, personId), eq(goals.status, OPEN)))
    .orderBy(asc(goals.sortOrder), asc(goals.createdAt));
}

async function nextSortOrder(personId: string): Promise<number> {
  const rows = await db.select({ sortOrder: goals.sortOrder }).from(goals).where(eq(goals.personId, personId));
  return rows.reduce((highest, row) => Math.max(highest, row.sortOrder), 0) + 1;
}

export interface NewGoal {
  title: string;
  dueDate?: string | null;
  owner?: string | null;
  lifeArea?: string | null;
  detail?: string | null;
  firstStep?: string | null;
  isPrivate?: boolean;
  source?: string;
  sourceSubmissionId?: string | null;
  horizon?: Horizon;
  parentGoalId?: string | null;
  weeklyHabit?: string | null;
  weeklyTargetCount?: number | null;
}

export async function addGoal(personId: string, input: NewGoal): Promise<GoalWithSteps> {
  const sortOrder = await nextSortOrder(personId);
  const inserted = await db
    .insert(goals)
    .values({
      personId,
      title: input.title,
      dueDate: input.dueDate ?? null,
      owner: input.owner ?? null,
      lifeArea: input.lifeArea ?? null,
      detail: input.detail ?? null,
      isPrivate: input.isPrivate ?? false,
      source: input.source ?? 'manual',
      sourceSubmissionId: input.sourceSubmissionId ?? null,
      horizon: input.horizon ?? 'ninety_day',
      parentGoalId: input.parentGoalId ?? null,
      weeklyHabit: input.weeklyHabit ?? null,
      weeklyTargetCount: input.weeklyTargetCount ?? null,
      createdCycleLabel: currentCycleLabel(),
      sortOrder,
    })
    .returning();
  const goal = inserted[0];

  const steps: GoalStep[] = [];
  if (input.firstStep && input.firstStep.trim() !== '') {
    const step = await db
      .insert(goalSteps)
      .values({ goalId: goal.id, personId, title: input.firstStep.trim(), sortOrder: 1 })
      .returning();
    steps.push(step[0]);
  }
  return { goal, steps };
}

/**
 * Turns the goals somebody just wrote in a check-in into real items on their
 * board, and closes the ones they just answered about.
 *
 * Runs inside the submit transaction, so a check-in either lands whole, board
 * and all, or does not land at all. A submission that recorded the answers and
 * failed halfway through the board would leave somebody with a month's answers
 * filed and a board that does not match them, which is worse than either.
 */
export async function applyCheckIn(
  tx: typeof db,
  personId: string,
  templateName: TemplateName,
  payload: Record<string, unknown>,
  submissionId: string,
  personName: string,
): Promise<{ id: string; title: string }[]> {
  const cycle = currentCycleLabel();
  const now = new Date();

  // Close, or leave open, whatever this check-in was asked about.
  const answers = Array.isArray(payload.goal_status) ? payload.goal_status : [];
  for (const entry of answers) {
    if (typeof entry !== 'object' || entry === null) continue;
    const row = entry as Record<string, unknown>;
    const goalId = typeof row.goal_id === 'string' ? row.goal_id : null;
    const answer = row.status as LoopAnswer;
    if (!goalId) continue;
    const closed = closedStatusFor(answer);
    const note = typeof row.reflection === 'string' && row.reflection.trim() !== '' ? row.reflection.trim() : null;
    if (!closed) {
      // Still working on it. The line they wrote goes in its own column, not
      // in the one that means "how it ended".
      if (note) {
        await tx
          .update(goals)
          .set({ progressNote: note, updatedAt: now })
          .where(and(eq(goals.id, goalId), eq(goals.personId, personId)));
      }
      continue;
    }
    // A blank line at the close does not wipe what they wrote on the way. The
    // first version set closedNote to null here, which destroyed three months
    // of somebody's notes at the exact moment they finished the thing.
    const closing: Record<string, unknown> = {
      status: closed,
      closedCycleLabel: cycle,
      closedAt: now,
      updatedAt: now,
    };
    if (note) closing.closedNote = note;
    await tx
      .update(goals)
      .set(closing)
      .where(and(eq(goals.id, goalId), eq(goals.personId, personId)));
  }

  // The "Where I am going" answers become real horizon goals, in the same
  // transaction as everything else here, so a check-in still lands whole. They
  // are created PRIVATE; see applyVision for why that differs from every other
  // goal on the board.
  const visionGoals = await applyVision(
    tx,
    personId,
    templateName,
    payload,
    submissionId,
    personName,
  );

  // Put this month's new goals on the board.
  const fresh: NewGoal[] = [];
  if (templateName === 'adult') {
    const written = Array.isArray(payload.goals) ? payload.goals : [];
    written.forEach((item) => {
      if (typeof item !== 'object' || item === null) return;
      const row = item as Record<string, unknown>;
      const title = typeof row.goal === 'string' ? row.goal.trim() : '';
      if (title === '') return;
      fresh.push({
        title,
        dueDate: typeof row.due_date === 'string' ? row.due_date.trim() : null,
        owner: typeof row.owner === 'string' ? row.owner.trim() : personName,
        firstStep: typeof row.first_action === 'string' ? row.first_action.trim() : null,
        source: 'checkin',
        sourceSubmissionId: submissionId,
      });
    });
  } else {
    const title = typeof payload.goal_this_month === 'string' ? payload.goal_this_month.trim() : '';
    if (title !== '') {
      fresh.push({ title, owner: personName, source: 'checkin', sourceSubmissionId: submissionId });
    }
  }

  const existing = await tx
    .select({ sortOrder: goals.sortOrder, title: goals.title, status: goals.status })
    .from(goals)
    .where(eq(goals.personId, personId));
  let sortOrder = existing.reduce((highest, row) => Math.max(highest, row.sortOrder), 0);

  /*
   * A goal already open on the board is not added again.
   *
   * The adult worksheet asks for three goals every single month, and a
   * ninety-day goal is three months long, so the honest thing to write in
   * month two is the same three goals. Without this the board goes 3, 6, 9, 12
   * and the next check-in asks about every one of them. Nobody would see that
   * until the second or third month, by which time real answers are in it.
   *
   * Matched on the words, ignoring case and spacing, because that is what
   * "the same goal" means to the person typing it.
   */
  const normalise = (title: string) => title.trim().toLowerCase().replace(/\s+/g, ' ');
  const openTitles = new Set(
    existing.filter((row) => row.status === OPEN).map((row) => normalise(row.title)),
  );

  const created: { id: string; title: string }[] = [];
  for (const item of fresh) {
    if (openTitles.has(normalise(item.title))) continue;
    openTitles.add(normalise(item.title));
    sortOrder += 1;
    const inserted = await tx
      .insert(goals)
      .values({
        personId,
        title: item.title,
        dueDate: item.dueDate ?? null,
        owner: item.owner ?? null,
        isPrivate: item.isPrivate ?? false,
        source: item.source ?? 'checkin',
        sourceSubmissionId: item.sourceSubmissionId ?? null,
        createdCycleLabel: cycle,
        sortOrder,
      })
      .returning({ id: goals.id });
    if (item.firstStep && item.firstStep !== '') {
      await tx
        .insert(goalSteps)
        .values({ goalId: inserted[0].id, personId, title: item.firstStep, sortOrder: 1 });
    }
    created.push({ id: inserted[0].id, title: item.title });
  }

  /*
   * Handed back so the screen at the end of a check-in can say which goals just
   * went up where the family can see them, and offer to keep any of them back.
   * That is the moment somebody is thinking about it; a privacy control they
   * have to go looking for afterwards is one they will not find.
   *
   * The vision goals are included even though they are already private, because
   * the same screen is where somebody would choose to SHARE one. Leaving them
   * out would mean three goals appeared on the board that the finish screen
   * never mentioned.
   */
  return [...created, ...visionGoals];
}

/**
 * The three "Where I am going" answers, and which horizon each becomes.
 *
 * These field ids belong to the adult worksheet's second section. That
 * section's wording is fixed by the mission and is not touched here: this reads
 * what somebody already wrote and gives it somewhere to live, rather than
 * asking anything new.
 */
const VISION_FIELDS: { field: string; horizon: Horizon }[] = [
  { field: 'ten_years', horizon: 'ten_year' },
  { field: 'three_years', horizon: 'three_year' },
  { field: 'one_year', horizon: 'one_year' },
];

/**
 * A short title out of a long answer.
 *
 * Somebody writing about where they want to be in ten years writes a paragraph,
 * not a goal title, and the whole paragraph as a board item is unreadable. The
 * first sentence is almost always the claim and the rest is the reasoning, so
 * the first sentence becomes the title and the full text is kept in `detail`,
 * where nothing is lost.
 *
 * Cut at a word boundary, never mid-word, and only when it is genuinely long.
 */
export function visionTitle(answer: string): string {
  const clean = answer.trim().replace(/\s+/g, ' ');
  const firstSentence = clean.split(/(?<=[.!?])\s/)[0] ?? clean;
  const candidate = firstSentence.length > 0 ? firstSentence : clean;
  if (candidate.length <= 90) return candidate;
  const cut = candidate.slice(0, 90);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

/**
 * Turns the "Where I am going" answers into real horizon goals.
 *
 * ONE open goal per horizon per person, updated rather than duplicated. A
 * person has one ten-year vision, not a new one every month, and the adult
 * worksheet asks the same three questions every time. Creating a row per
 * check-in would put twelve near-identical ten-year goals on the board within a
 * year, which is exactly the bug the ninety-day de-duplication already exists
 * to stop, one horizon up.
 *
 * Rewriting the answer edits the goal that is already there. That is the honest
 * reading of somebody changing what they wrote: the vision moved, it is not a
 * second vision. A vision goal somebody has deliberately closed is left closed,
 * and a new one is written, because closing it was a decision.
 *
 * THESE ARE CREATED PRIVATE, AND THAT IS THE ONE DECISION HERE WORTH ARGUING
 * WITH.
 *
 * Mission 2 says horizon goals follow the same privacy rules as any goal, which
 * means shared by default. Every other goal on the board is a title somebody
 * typed into a box labelled "a goal". These are not: they are the first
 * sentence of a paragraph somebody wrote in a section of the check-in, under an
 * intro that promises in as many words that "what you write and the scores you
 * give are yours alone". A ten-year answer is where somebody says the true
 * frightening thing, and the first sentence of it is exactly the part that
 * would hurt to publish.
 *
 * Publishing it by default would also do it silently. The finish screen can
 * only offer to hold back the goals it is handed, so an answer turned into a
 * shared goal here would reach the family board without ever being named.
 *
 * So they start private and their owner can share any of them with the tap that
 * already exists on every goal card. That is the mission's tie-breaker applied
 * as written: the more private option wins, and the reversible one wins.
 */
async function applyVision(
  tx: typeof db,
  personId: string,
  templateName: TemplateName,
  payload: Record<string, unknown>,
  submissionId: string,
  personName: string,
): Promise<{ id: string; title: string }[]> {
  // Only the adult worksheet asks these. The teen and young-adult sheets have
  // no horizon questions, and inventing answers for them is not this function's
  // business.
  const made: { id: string; title: string }[] = [];
  if (templateName !== 'adult') return made;

  const now = new Date();
  for (const { field, horizon } of VISION_FIELDS) {
    const raw = payload[field];
    const answer = typeof raw === 'string' ? raw.trim() : '';
    if (answer === '') continue;

    const existing = await tx
      .select()
      .from(goals)
      .where(
        and(
          eq(goals.personId, personId),
          eq(goals.horizon, horizon),
          eq(goals.source, 'vision'),
          eq(goals.status, OPEN),
        ),
      )
      .limit(1);

    if (existing[0]) {
      // Unchanged answer, nothing to write. Worth the check: an update here
      // every month would move updatedAt and make an untouched vision look
      // freshly worked on, which the weekly nudge reads.
      if (existing[0].detail === answer) continue;
      await tx
        .update(goals)
        .set({ title: visionTitle(answer), detail: answer, updatedAt: now })
        .where(eq(goals.id, existing[0].id));
      continue;
    }

    const rows = await tx
      .select({ sortOrder: goals.sortOrder })
      .from(goals)
      .where(eq(goals.personId, personId));
    const sortOrder = rows.reduce((highest, row) => Math.max(highest, row.sortOrder), 0) + 1;

    const inserted = await tx
      .insert(goals)
      .values({
        personId,
        title: visionTitle(answer),
        detail: answer,
        horizon,
        owner: personName,
        // Private until its owner decides otherwise. See the doc comment.
        isPrivate: true,
        source: 'vision',
        sourceSubmissionId: submissionId,
        createdCycleLabel: currentCycleLabel(),
        sortOrder,
      })
      .returning({ id: goals.id });
    made.push({ id: inserted[0].id, title: visionTitle(answer) });
  }
  return made;
}

export { applyVision };

/**
 * How far along a longer goal is, worked out from the shorter goals hanging off
 * it rather than from anything its owner types.
 *
 * This is the point of the horizons: somebody should be able to see a ninety
 * day win move a three year number without doing any arithmetic. So it counts
 * children, and it counts them by what actually happened.
 *
 * Only `hit` counts as done. A goal that was missed or deliberately dropped is
 * still part of the denominator, because pretending a dropped goal never
 * existed quietly inflates the number, and a progress bar that flatters is
 * worse than none.
 *
 * Returns nothing for a goal with no children, rather than zero. "No progress
 * yet" and "nothing attached yet" are different things and a bar at zero says
 * the wrong one.
 */
export interface HorizonProgress {
  done: number;
  total: number;
}

export function horizonProgressFrom(all: Goal[]): Map<string, HorizonProgress> {
  const out = new Map<string, HorizonProgress>();
  for (const goal of all) {
    if (!goal.parentGoalId) continue;
    const at = out.get(goal.parentGoalId) ?? { done: 0, total: 0 };
    at.total += 1;
    if (goal.status === 'hit') at.done += 1;
    out.set(goal.parentGoalId, at);
  }
  return out;
}
