import { and, asc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { goals, goalSteps, type Goal, type GoalStep } from '../db/schema.js';
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

  // Handed back so the screen at the end of a check-in can say which goals just
  // went up where the family can see them, and offer to keep any of them back.
  // That is the moment somebody is thinking about it; a privacy control they
  // have to go looking for afterwards is one they will not find.
  return created;
}
