import { and, asc, desc, eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { db } from '../db/client.js';
import {
  coachNotes,
  drafts,
  goals,
  goalSteps,
  people,
  submissions,
  type Person,
} from '../db/schema.js';
import { endAllSessions, endSession, requireOwner, signIn } from '../lib/auth.js';
import { hashCode, refuseCode } from '../lib/codes.js';
import { currentCycleLabel, daysLeftInMonth } from '../lib/cycle.js';
import {
  addGoal,
  applyCheckIn,
  boardFor,
  horizonProgressFrom,
  isHorizon,
  isLongerThan,
  openGoalsFor,
  type GoalWithSteps,
  type Horizon,
} from '../lib/goals.js';
import { toggleHabitDay, weekFor } from '../lib/week.js';
import { coachConfigured, writeNoteFor } from '../lib/coach.js';
import { goalAreasFor } from '../lib/templates.js';
import { carryForward, EMPTY_CARRIED_FORWARD } from '../lib/previous.js';
import type { TemplateName } from '../lib/templates.js';
import { ValidationError, validatePayload } from '../lib/validate.js';
import { resolveLink } from './board.js';

/**
 * A person's own space: the gate on the way in, and everything behind it.
 *
 * Every route below the gate is refused unless the request carries a session
 * that was created by this person typing their own code, and unless that
 * session's person is the person the route is about. Nothing here has a path
 * that trusts a link, a header, a query parameter or a name, and there is no
 * route anywhere in this service that hands one person's answers, scores or
 * goals to anybody else, including a parent.
 */

/** A goal and its steps, as the space sends them. */
function goalShape({ goal, steps }: GoalWithSteps) {
  return {
    id: goal.id,
    title: goal.title,
    detail: goal.detail,
    life_area: goal.lifeArea,
    horizon: goal.horizon,
    parent_goal_id: goal.parentGoalId,
    target_number: goal.targetNumber,
    target_unit: goal.targetUnit,
    progress_number: goal.progressNumber,
    weekly_habit: goal.weeklyHabit,
    weekly_target_count: goal.weeklyTargetCount,
    due_date: goal.dueDate,
    owner: goal.owner,
    status: goal.status,
    is_private: goal.isPrivate,
    closed_note: goal.closedNote,
    progress_note: goal.progressNote,
    source: goal.source,
    created_cycle_label: goal.createdCycleLabel,
    closed_cycle_label: goal.closedCycleLabel,
    created_at: goal.createdAt.toISOString(),
    closed_at: goal.closedAt ? goal.closedAt.toISOString() : null,
    steps: steps.map((step) => ({
      id: step.id,
      title: step.title,
      due_date: step.dueDate,
      done: step.done,
      done_at: step.doneAt ? step.doneAt.toISOString() : null,
    })),
  };
}

async function personBySlug(slug: string): Promise<Person | null> {
  if (typeof slug !== 'string' || slug === '') return null;
  const rows = await db.select().from(people).where(eq(people.slug, slug)).limit(1);
  return rows[0] ?? null;
}

/**
 * Resolves the person a private route is about and proves the caller is them.
 * Returns null when it has already answered, so every route can simply stop.
 */
async function owner(
  request: FastifyRequest,
  reply: FastifyReply,
  slug: string,
): Promise<Person | null> {
  const wanted = await personBySlug(slug);
  if (!wanted) {
    // Answered the same way as a session that does not match, on purpose. A
    // different answer for "no such person" turns this into a way of finding
    // out who is in this house from outside it.
    await reply.code(401).send({ error: 'Enter your code to open this.', code: 'code_required' });
    return null;
  }
  return requireOwner(request, reply, wanted);
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

export function registerSpaceRoutes(app: FastifyInstance) {
  interface GateParams {
    token: string;
    slug: string;
  }
  interface SlugParams {
    slug: string;
  }

  /**
   * The sign-in screen's own data. Holding any link into this house is enough
   * to see it, because it says nothing a person has written: a name, whether a
   * code has been set yet, and whether the door is shut for a few minutes.
   */
  app.get<{ Params: GateParams }>('/api/gate/:token/:slug', async (request, reply) => {
    const link = await resolveLink(request.params.token);
    if (!link) return reply.code(404).send({ error: 'This link is not valid.' });
    const person = await personBySlug(request.params.slug);
    if (!person) return reply.code(404).send({ error: 'Nobody by that name.' });

    const now = new Date();
    return {
      name: person.name,
      slug: person.slug,
      template_type: person.templateType,
      has_code: Boolean(person.codeHash),
      locked_for_seconds:
        person.lockedUntil && person.lockedUntil > now
          ? Math.ceil((person.lockedUntil.getTime() - now.getTime()) / 1000)
          : 0,
    };
  });

  interface CodeBody {
    code?: unknown;
  }

  /**
   * Setting a code for the first time.
   *
   * Only ever works when there is no code on the row. Somebody who has one and
   * has forgotten it is not served here: Tyson clears it first, and only then
   * does this screen come back for them. That is what stops this being a way
   * round the code rather than a way of having one.
   */
  app.post<{ Params: GateParams; Body: CodeBody }>(
    '/api/gate/:token/:slug/set-code',
    async (request, reply) => {
      const link = await resolveLink(request.params.token);
      if (!link) return reply.code(404).send({ error: 'This link is not valid.' });
      const person = await personBySlug(request.params.slug);
      if (!person) return reply.code(404).send({ error: 'Nobody by that name.' });
      /*
       * A person's own link can only claim that person.
       *
       * Before this, holding ANY link in the house was enough to set a code for
       * ANYBODY who had not set one yet. On the day this ships that is all five
       * of them, so one child's own link, or an old parent link, could have set
       * all five codes and been signed in as everybody for a month, with the
       * real people locked out. The house link still works for anybody, because
       * it is the link the whole house is meant to be holding.
       */
      if (link.kind === 'person' && link.slug !== person.slug) {
        return reply.code(403).send({
          error: 'That link is somebody else’s. Open the one for the house, then tap your own name.',
        });
      }
      if (person.codeHash) {
        return reply
          .code(409)
          .send({ error: 'This person already has a code. Ask Tyson to reset it.' });
      }

      const code = typeof request.body?.code === 'string' ? request.body.code : '';
      const refusal = refuseCode(code);
      if (refusal) return reply.code(400).send({ error: refusal.reason });

      await db
        .update(people)
        .set({
          codeHash: await hashCode(code),
          codeSetAt: new Date(),
          failedAttempts: 0,
          lockedUntil: null,
        })
        .where(eq(people.id, person.id));

      // Straight in, rather than asking them to type the code they just chose.
      const refreshed = await personBySlug(person.slug);
      const outcome = await signIn(refreshed as Person, code);
      if (!outcome.ok) {
        // Cannot happen: the code was just written. Saying so plainly beats
        // pretending it worked.
        return reply.code(500).send({ error: 'Your code was saved but sign-in failed.' });
      }
      return { ok: true, session_token: outcome.sessionToken, expires_at: outcome.expiresAt };
    },
  );

  app.post<{ Params: GateParams; Body: CodeBody }>(
    '/api/gate/:token/:slug/signin',
    async (request, reply) => {
      const link = await resolveLink(request.params.token);
      if (!link) return reply.code(404).send({ error: 'This link is not valid.' });
      const person = await personBySlug(request.params.slug);
      if (!person) return reply.code(404).send({ error: 'Nobody by that name.' });
      if (!person.codeHash) {
        return reply.code(409).send({ error: 'No code is set yet.', code: 'set_code_first' });
      }

      const code = typeof request.body?.code === 'string' ? request.body.code : '';
      const outcome = await signIn(person, code);
      if (!outcome.ok) {
        return reply.code(401).send({
          error: outcome.lockedForSeconds
            ? 'Too many wrong tries. Wait a bit and try again.'
            : 'That code is not right.',
          locked_for_seconds: outcome.lockedForSeconds ?? 0,
        });
      }
      return { ok: true, session_token: outcome.sessionToken, expires_at: outcome.expiresAt };
    },
  );

  app.post('/api/space/signout', async (request) => {
    const header = request.headers.authorization;
    const match = typeof header === 'string' ? header.match(/^Bearer\s+(\S+)$/i) : null;
    if (match) await endSession(match[1]);
    return { ok: true };
  });

  /** Their own space. Goals, where they are with this month, and their streak. */
  app.get<{ Params: SlugParams }>('/api/space/:slug', async (request, reply) => {
    const person = await owner(request, reply, request.params.slug);
    if (!person) return;

    const cycle = currentCycleLabel();
    const board = await boardFor(person.id);
    const mine = await db
      .select({ cycleLabel: submissions.cycleLabel, submittedAt: submissions.submittedAt })
      .from(submissions)
      .where(eq(submissions.personId, person.id))
      .orderBy(desc(submissions.submittedAt));
    const thisMonth = mine.find((row) => row.cycleLabel === cycle) ?? null;
    const draft = await db
      .select({ cycleLabel: drafts.cycleLabel })
      .from(drafts)
      .where(eq(drafts.personId, person.id))
      .limit(1);

    return {
      name: person.name,
      slug: person.slug,
      template_type: person.templateType,
      current_cycle_label: cycle,
      days_left: daysLeftInMonth(),
      submitted_this_cycle: thisMonth
        ? { submitted_at: thisMonth.submittedAt.toISOString() }
        : null,
      started_this_cycle: Boolean(draft[0] && draft[0].cycleLabel === cycle),
      /** Their own run of months, which is theirs and is never compared to anybody. */
      own_streak: ownStreak(mine.map((row) => row.cycleLabel), cycle),
      // Months finished, not rows filed. Redoing a month files a second row
      // and must not read as a second month.
      total_check_ins: new Set(mine.map((row) => row.cycleLabel)).size,
      goals: board.map(goalShape),
      /**
       * How far each longer goal has come, worked out from the shorter goals
       * hanging off it. Keyed by the longer goal's id, and absent rather than
       * zero where nothing is attached yet: "no progress" and "nothing attached"
       * are different things and a bar at nought says the wrong one.
       */
      horizon_progress: Object.fromEntries(
        horizonProgressFrom(board.map((item) => item.goal)),
      ),
      /** Every area a goal on this tier can be filed under. Not the scored list. */
      goal_areas: goalAreasFor(person.templateType),
    };
  });

  /**
   * This person's week: the habits on their own goals, what is ticked, and the
   * run of weeks behind each one.
   *
   * Private to its owner, like everything else below `owner()`. The household
   * sees a goal and whether it was hit; it does not see which days anybody
   * ticked, and nothing in this route's shape goes anywhere near the family
   * board.
   */
  app.get<{ Params: SlugParams }>('/api/space/:slug/week', async (request, reply) => {
    const person = await owner(request, reply, request.params.slug);
    if (!person) return;
    return { habits: await weekFor(person.id) };
  });

  /**
   * The private note written back to this person.
   *
   * Under `owner()` like everything else here, which is what makes it
   * unreachable by the other four. There is no family-facing equivalent of this
   * route and there must never be one: the note is derived from somebody's
   * scores and reflections, so handing it to anybody else hands over the thing
   * those were promised to keep.
   */
  app.get<{ Params: SlugParams }>('/api/space/:slug/coach', async (request, reply) => {
    const person = await owner(request, reply, request.params.slug);
    if (!person) return;

    const rows = await db
      .select()
      .from(coachNotes)
      .where(eq(coachNotes.personId, person.id))
      .orderBy(desc(coachNotes.createdAt))
      .limit(1);
    const note = rows[0];
    if (!note) {
      // Nothing yet is a normal answer, not an error. It means either the
      // coach is still writing, or it is not configured, or it had nothing to
      // say. The screen tells the person which without dressing it up.
      return { note: null, configured: coachConfigured() };
    }
    return {
      configured: coachConfigured(),
      note: {
        id: note.id,
        body: note.body,
        cycle_label: note.cycleLabel,
        created_at: note.createdAt.toISOString(),
        // Only offered while it is still outstanding.
        suggested_step:
          note.acceptedAt || note.dismissedAt ? null : note.suggestedStep,
        suggested_goal_id:
          note.acceptedAt || note.dismissedAt ? null : note.suggestedGoalId,
        accepted: Boolean(note.acceptedAt),
      },
    };
  });

  /**
   * Takes the one step it offered onto their board.
   *
   * This is the ONLY way anything the coach wrote reaches a board, and it takes
   * a tap from the owner. Nothing here writes a goal or a step on its own.
   */
  app.post<{ Params: SlugParams & { noteId: string } }>(
    '/api/space/:slug/coach/:noteId/accept',
    async (request, reply) => {
      const person = await owner(request, reply, request.params.slug);
      if (!person) return;

      const rows = await db
        .select()
        .from(coachNotes)
        .where(and(eq(coachNotes.id, request.params.noteId), eq(coachNotes.personId, person.id)))
        .limit(1);
      const note = rows[0];
      if (!note) return reply.code(404).send({ error: 'That note could not be found.' });
      if (!note.suggestedStep) {
        return reply.code(400).send({ error: 'There is no step on that note.' });
      }
      if (note.acceptedAt || note.dismissedAt) {
        return reply.code(409).send({ error: 'That one has already been dealt with.' });
      }

      /*
       * The goal is re-checked against this person here, not trusted from the
       * note. The id was validated when the note was written, but a goal can be
       * deleted or closed in between, and a step landing on a stale id is a step
       * nobody ever sees.
       */
      let goalId: string | null = null;
      if (note.suggestedGoalId) {
        const target = await db
          .select({ id: goals.id })
          .from(goals)
          .where(
            and(
              eq(goals.id, note.suggestedGoalId),
              eq(goals.personId, person.id),
              eq(goals.status, 'open'),
            ),
          )
          .limit(1);
        goalId = target[0]?.id ?? null;
      }

      if (goalId) {
        const existing = await db
          .select({ sortOrder: goalSteps.sortOrder })
          .from(goalSteps)
          .where(eq(goalSteps.goalId, goalId));
        const sortOrder =
          existing.reduce((highest, row) => Math.max(highest, row.sortOrder), 0) + 1;
        await db
          .insert(goalSteps)
          .values({ goalId, personId: person.id, title: note.suggestedStep, sortOrder });
      } else {
        // No goal to hang it under, so it becomes a small goal of its own with
        // the step as its first action. Better than dropping it on the floor.
        await addGoal(person.id, {
          title: note.suggestedStep,
          owner: person.name,
          source: 'coach',
        });
      }

      await db
        .update(coachNotes)
        .set({ acceptedAt: new Date() })
        .where(eq(coachNotes.id, note.id));

      const board = await boardFor(person.id);
      return { ok: true, goals: board.map(goalShape) };
    },
  );

  /** Waves the step away. It is not offered again. */
  app.post<{ Params: SlugParams & { noteId: string } }>(
    '/api/space/:slug/coach/:noteId/dismiss',
    async (request, reply) => {
      const person = await owner(request, reply, request.params.slug);
      if (!person) return;
      const updated = await db
        .update(coachNotes)
        .set({ dismissedAt: new Date() })
        .where(and(eq(coachNotes.id, request.params.noteId), eq(coachNotes.personId, person.id)))
        .returning({ id: coachNotes.id });
      if (!updated[0]) return reply.code(404).send({ error: 'That note could not be found.' });
      return { ok: true };
    },
  );

  interface HabitBody {
    date?: unknown;
  }

  /** Tick or untick one day of one habit. Scoped by person, like every write here. */
  app.post<{ Params: SlugParams & { goalId: string }; Body: HabitBody }>(
    '/api/space/:slug/goals/:goalId/habit',
    async (request, reply) => {
      const person = await owner(request, reply, request.params.slug);
      if (!person) return;

      const found = await db
        .select()
        .from(goals)
        .where(and(eq(goals.id, request.params.goalId), eq(goals.personId, person.id)))
        .limit(1);
      if (!found[0]) return reply.code(404).send({ error: 'That goal could not be found.' });
      if (!found[0].weeklyHabit || found[0].weeklyHabit.trim() === '') {
        return reply.code(400).send({ error: 'That goal has no weekly habit on it yet.' });
      }

      const day = typeof request.body?.date === 'string' ? request.body.date : '';
      const outcome = await toggleHabitDay(person.id, found[0], day);
      if (!outcome.ok) return reply.code(400).send({ error: outcome.error });
      return { ok: true, done: outcome.done, habits: await weekFor(person.id) };
    },
  );

  /** Their own history: their own scores over time, and every goal they ever set. */
  app.get<{ Params: SlugParams }>('/api/space/:slug/history', async (request, reply) => {
    const person = await owner(request, reply, request.params.slug);
    if (!person) return;

    const rows = await db
      .select({
        id: submissions.id,
        cycleLabel: submissions.cycleLabel,
        payload: submissions.payload,
        submittedAt: submissions.submittedAt,
      })
      .from(submissions)
      .where(eq(submissions.personId, person.id))
      .orderBy(asc(submissions.submittedAt));

    const board = await boardFor(person.id);

    /*
     * One entry per month, not one per submission.
     *
     * Redoing a month is allowed, and it files a second row rather than
     * overwriting the first, which is deliberate: the first answers are kept.
     * But a history that shows September twice reads as two months, and after
     * three goes at the same month the chart is mostly one month wide. So the
     * most recent submission for a month is the one that stands, and the
     * earlier ones stay in the database without being drawn.
     *
     * Found by redoing a month on a preview and looking at the result, not by
     * reading this code back.
     */
    const latestPerMonth = new Map<string, (typeof rows)[number]>();
    for (const row of rows) latestPerMonth.set(row.cycleLabel, row);
    const months = [...latestPerMonth.values()].sort((a, b) =>
      a.cycleLabel.localeCompare(b.cycleLabel),
    );

    return {
      name: person.name,
      template_type: person.templateType,
      months: months.map((row) => {
        const payload = row.payload as Record<string, unknown>;
        const areas = (payload.areas ?? {}) as Record<string, { score?: number }>;
        const myArea = (payload.my_area ?? null) as { name?: string; score?: number } | null;
        return {
          cycle_label: row.cycleLabel,
          submitted_at: row.submittedAt.toISOString(),
          // Scores only. The written reasons are their own answers and stay in
          // the check-in they were written in; a history screen does not need
          // them and this keeps the payload small on a phone.
          scores: Object.fromEntries(
            Object.entries(areas).map(([id, entry]) => [id, entry?.score ?? null]),
          ),
          my_area: myArea ? { name: myArea.name ?? null, score: myArea.score ?? null } : null,
        };
      }),
      goals: board.map(goalShape),
    };
  });

  interface NewGoalBody {
    title?: unknown;
    due_date?: unknown;
    life_area?: unknown;
    detail?: unknown;
    first_step?: unknown;
    is_private?: unknown;
    horizon?: unknown;
    parent_goal_id?: unknown;
    weekly_habit?: unknown;
    weekly_target_count?: unknown;
  }

  /**
   * How many times a week a habit is meant to happen.
   *
   * Refused outside one to seven, because a weekly row has seven boxes and a
   * target of nine is a target nobody can ever meet. Null clears it, which is a
   * habit somebody wants to do "regularly" without committing to a number.
   */
  function weeklyTarget(value: unknown): number | null | 'bad' {
    if (value === null || value === undefined || value === '') return null;
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isInteger(n) || n < 1 || n > 7) return 'bad';
    return n;
  }

  /**
   * Checks a goal may hang off the parent it names.
   *
   * Three things have to hold, and all three are about somebody else's data or
   * about arithmetic that would otherwise loop forever: the parent has to
   * belong to the SAME person, it has to be a LONGER horizon than the child,
   * and a goal cannot be its own parent. Without the first, a goal id belonging
   * to another person could be attached to and its progress read through the
   * derived count, which is the exact hole the rest of this file closes.
   */
  async function checkParent(
    personId: string,
    parentId: string | null,
    childHorizon: Horizon,
    selfId: string | null,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!parentId) return { ok: true };
    if (selfId && parentId === selfId) {
      return { ok: false, error: 'A goal cannot hang off itself.' };
    }
    const found = await db
      .select({ id: goals.id, horizon: goals.horizon })
      .from(goals)
      .where(and(eq(goals.id, parentId), eq(goals.personId, personId)))
      .limit(1);
    if (!found[0]) return { ok: false, error: 'That bigger goal could not be found.' };
    if (!isLongerThan(found[0].horizon, childHorizon)) {
      return { ok: false, error: 'A goal can only hang off a longer one than itself.' };
    }
    return { ok: true };
  }

  app.post<{ Params: SlugParams; Body: NewGoalBody }>(
    '/api/space/:slug/goals',
    async (request, reply) => {
      const person = await owner(request, reply, request.params.slug);
      if (!person) return;

      const title = text(request.body?.title);
      if (!title) return reply.code(400).send({ error: 'A goal needs writing down first.' });

      const horizonRaw = request.body?.horizon;
      const horizon: Horizon = isHorizon(horizonRaw) ? horizonRaw : 'ninety_day';
      if (horizonRaw !== undefined && horizonRaw !== null && !isHorizon(horizonRaw)) {
        return reply.code(400).send({ error: 'That is not one of the timeframes.' });
      }

      const parentId = text(request.body?.parent_goal_id);
      const parentOk = await checkParent(person.id, parentId, horizon, null);
      if (!parentOk.ok) return reply.code(400).send({ error: parentOk.error });

      const target = weeklyTarget(request.body?.weekly_target_count);
      if (target === 'bad') {
        return reply.code(400).send({ error: 'A weekly habit happens one to seven times a week.' });
      }

      const created = await addGoal(person.id, {
        title,
        dueDate: text(request.body?.due_date),
        lifeArea: text(request.body?.life_area),
        detail: text(request.body?.detail),
        firstStep: text(request.body?.first_step),
        isPrivate: request.body?.is_private === true,
        horizon,
        parentGoalId: parentId,
        weeklyHabit: text(request.body?.weekly_habit),
        weeklyTargetCount: target,
        owner: person.name,
        source: 'manual',
      });
      return { ok: true, goal: goalShape(created) };
    },
  );

  interface EditGoalBody {
    title?: unknown;
    due_date?: unknown;
    life_area?: unknown;
    detail?: unknown;
    status?: unknown;
    closed_note?: unknown;
    is_private?: unknown;
    horizon?: unknown;
    parent_goal_id?: unknown;
    weekly_habit?: unknown;
    weekly_target_count?: unknown;
  }

  app.patch<{ Params: SlugParams & { goalId: string }; Body: EditGoalBody }>(
    '/api/space/:slug/goals/:goalId',
    async (request, reply) => {
      const person = await owner(request, reply, request.params.slug);
      if (!person) return;

      // Scoped by person as well as by id. Without the person in the where
      // clause, a goal id belonging to somebody else would be editable by
      // anybody signed in as anybody, which is the same hole this whole release
      // exists to close, moved one level down.
      const existing = await db
        .select()
        .from(goals)
        .where(and(eq(goals.id, request.params.goalId), eq(goals.personId, person.id)))
        .limit(1);
      if (!existing[0]) return reply.code(404).send({ error: 'That goal could not be found.' });

      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if ('title' in (request.body ?? {})) {
        const title = text(request.body?.title);
        if (!title) return reply.code(400).send({ error: 'A goal cannot be left blank.' });
        patch.title = title;
      }
      if ('due_date' in (request.body ?? {})) patch.dueDate = text(request.body?.due_date);
      if ('life_area' in (request.body ?? {})) patch.lifeArea = text(request.body?.life_area);
      if ('detail' in (request.body ?? {})) patch.detail = text(request.body?.detail);
      if ('closed_note' in (request.body ?? {})) patch.closedNote = text(request.body?.closed_note);
      if ('is_private' in (request.body ?? {})) patch.isPrivate = request.body?.is_private === true;

      /*
       * Horizon and parent move together whether or not both were sent.
       *
       * They have to be validated as a pair: "a parent must be longer than its
       * child" is a comparison between the two, so changing either one alone
       * can break the pair. Checking only the field that arrived would let a
       * ninety-day goal already hanging off a one-year goal be promoted to a
       * ten-year goal, leaving a ten-year goal hanging off a one-year one.
       */
      const body = request.body ?? {};
      const wantsHorizon = 'horizon' in body;
      const wantsParent = 'parent_goal_id' in body;
      if (wantsHorizon || wantsParent) {
        let horizon: Horizon = existing[0].horizon;
        if (wantsHorizon) {
          if (!isHorizon(body.horizon)) {
            return reply.code(400).send({ error: 'That is not one of the timeframes.' });
          }
          horizon = body.horizon;
        }
        const parentId = wantsParent ? text(body.parent_goal_id) : existing[0].parentGoalId;
        const parentOk = await checkParent(person.id, parentId, horizon, existing[0].id);
        if (!parentOk.ok) return reply.code(400).send({ error: parentOk.error });
        patch.horizon = horizon;
        patch.parentGoalId = parentId;
      }

      if ('weekly_habit' in body) patch.weeklyHabit = text(body.weekly_habit);
      if ('weekly_target_count' in body) {
        const target = weeklyTarget(body.weekly_target_count);
        if (target === 'bad') {
          return reply
            .code(400)
            .send({ error: 'A weekly habit happens one to seven times a week.' });
        }
        patch.weeklyTargetCount = target;
      }

      if ('status' in (request.body ?? {})) {
        const status = request.body?.status;
        if (status !== 'open' && status !== 'hit' && status !== 'missed' && status !== 'dropped') {
          return reply.code(400).send({ error: 'That is not something a goal can be.' });
        }
        patch.status = status;
        if (status === 'open') {
          patch.closedAt = null;
          patch.closedCycleLabel = null;
          // A goal put back on the board is not carrying a line about how it
          // ended, because it has not ended.
          patch.closedNote = null;
        } else {
          patch.closedAt = new Date();
          patch.closedCycleLabel = currentCycleLabel();
        }
      }

      await db.update(goals).set(patch).where(eq(goals.id, existing[0].id));
      const board = await boardFor(person.id);
      const updated = board.find((item) => item.goal.id === existing[0].id);
      return { ok: true, goal: updated ? goalShape(updated) : null };
    },
  );

  interface NewStepBody {
    title?: unknown;
    due_date?: unknown;
  }

  app.post<{ Params: SlugParams & { goalId: string }; Body: NewStepBody }>(
    '/api/space/:slug/goals/:goalId/steps',
    async (request, reply) => {
      const person = await owner(request, reply, request.params.slug);
      if (!person) return;

      const goal = await db
        .select({ id: goals.id })
        .from(goals)
        .where(and(eq(goals.id, request.params.goalId), eq(goals.personId, person.id)))
        .limit(1);
      if (!goal[0]) return reply.code(404).send({ error: 'That goal could not be found.' });

      const title = text(request.body?.title);
      if (!title) return reply.code(400).send({ error: 'A step needs writing down first.' });

      const existing = await db
        .select({ sortOrder: goalSteps.sortOrder })
        .from(goalSteps)
        .where(eq(goalSteps.goalId, goal[0].id));
      const sortOrder = existing.reduce((highest, row) => Math.max(highest, row.sortOrder), 0) + 1;

      await db.insert(goalSteps).values({
        goalId: goal[0].id,
        personId: person.id,
        title,
        dueDate: text(request.body?.due_date),
        sortOrder,
      });

      const board = await boardFor(person.id);
      const updated = board.find((item) => item.goal.id === goal[0].id);
      return { ok: true, goal: updated ? goalShape(updated) : null };
    },
  );

  interface EditStepBody {
    title?: unknown;
    due_date?: unknown;
    done?: unknown;
  }

  app.patch<{ Params: SlugParams & { goalId: string; stepId: string }; Body: EditStepBody }>(
    '/api/space/:slug/goals/:goalId/steps/:stepId',
    async (request, reply) => {
      const person = await owner(request, reply, request.params.slug);
      if (!person) return;

      const existing = await db
        .select()
        .from(goalSteps)
        .where(and(eq(goalSteps.id, request.params.stepId), eq(goalSteps.personId, person.id)))
        .limit(1);
      if (!existing[0] || existing[0].goalId !== request.params.goalId) {
        return reply.code(404).send({ error: 'That step could not be found.' });
      }

      const patch: Record<string, unknown> = {};
      if ('title' in (request.body ?? {})) {
        const title = text(request.body?.title);
        if (!title) return reply.code(400).send({ error: 'A step cannot be left blank.' });
        patch.title = title;
      }
      if ('due_date' in (request.body ?? {})) patch.dueDate = text(request.body?.due_date);
      if ('done' in (request.body ?? {})) {
        const done = Boolean(request.body?.done);
        patch.done = done;
        patch.doneAt = done ? new Date() : null;
      }

      await db.update(goalSteps).set(patch).where(eq(goalSteps.id, existing[0].id));
      const board = await boardFor(person.id);
      const updated = board.find((item) => item.goal.id === existing[0].goalId);
      return { ok: true, goal: updated ? goalShape(updated) : null };
    },
  );

  interface ResetBody {
    slug?: unknown;
  }

  /**
   * Tyson clearing somebody's forgotten code.
   *
   * It clears the code and ends every session that person has open. It does not
   * reveal the old code, because nothing anywhere can, and it does not give
   * Tyson a way in: the next person through that door is whoever sets the new
   * code, on that person's own screen. Tyson's own session is never a session
   * for anybody else, and every route above proves that separately.
   */
  app.post<{ Params: SlugParams; Body: ResetBody }>(
    '/api/space/:slug/reset-code',
    async (request, reply) => {
      const person = await owner(request, reply, request.params.slug);
      if (!person) return;
      if (person.slug !== 'tyson') {
        return reply.code(403).send({ error: 'Only Tyson can reset a code.' });
      }

      const targetSlug = text(request.body?.slug);
      const target = targetSlug ? await personBySlug(targetSlug) : null;
      if (!target) return reply.code(404).send({ error: 'Nobody by that name.' });

      await db
        .update(people)
        .set({ codeHash: null, codeSetAt: null, failedAttempts: 0, lockedUntil: null })
        .where(eq(people.id, target.id));
      await endAllSessions(target.id);

      return { ok: true, name: target.name };
    },
  );

  // --------------------------------------------------------------------------
  // The check-in itself. Same six sections, same questions, same rules. What
  // changed is that it is behind the code like everything else, and that the
  // loop at the start asks the goal board rather than last month's answers.
  // --------------------------------------------------------------------------

  app.get<{ Params: SlugParams }>('/api/space/:slug/form', async (request, reply) => {
    const person = await owner(request, reply, request.params.slug);
    if (!person) return;

    const latest = await db
      .select()
      .from(submissions)
      .where(eq(submissions.personId, person.id))
      .orderBy(desc(submissions.submittedAt))
      .limit(1);
    const previous = latest[0] ?? null;
    const carried = previous ? carryForward(previous.payload) : EMPTY_CARRIED_FORWARD;

    const cycle = currentCycleLabel();
    const open = await openGoalsFor(person.id);

    return {
      name: person.name,
      slug: person.slug,
      template_type: person.templateType,
      current_cycle_label: cycle,
      submitted_this_cycle:
        previous && previous.cycleLabel === cycle
          ? { id: previous.id, submitted_at: previous.submittedAt.toISOString() }
          : null,
      has_earlier_submissions: Boolean(previous),
      /** What is still open on their own board, which is what the loop asks about. */
      open_goals: open.map((goal) => ({
        id: goal.id,
        title: goal.title,
        due_date: goal.dueDate,
        created_cycle_label: goal.createdCycleLabel,
      })),
      my_area: carried.myArea,
      last_initiative_note: carried.lastInitiativeNote,
      note_to_self: carried.noteToSelf,
    };
  });

  app.get<{ Params: SlugParams }>('/api/space/:slug/draft', async (request, reply) => {
    const person = await owner(request, reply, request.params.slug);
    if (!person) return;

    const rows = await db.select().from(drafts).where(eq(drafts.personId, person.id)).limit(1);
    const draft = rows[0];
    if (!draft) return null;

    return {
      cycle_label: draft.cycleLabel,
      payload: draft.payload,
      started_at: draft.startedAt.toISOString(),
    };
  });

  interface DraftBody {
    payload?: unknown;
    started_at?: unknown;
  }

  app.put<{ Params: SlugParams; Body: DraftBody }>(
    '/api/space/:slug/draft',
    async (request, reply) => {
      const person = await owner(request, reply, request.params.slug);
      if (!person) return;

      const { payload, started_at: startedAt } = request.body ?? {};
      if (typeof payload !== 'object' || payload === null) {
        return reply.code(400).send({ error: 'payload is required.' });
      }
      // The month is worked out here and the body's copy is ignored. A tab left
      // open across midnight on the last day of a month would otherwise keep
      // stamping the old month onto everything it saved, and a hand-written
      // request could stamp any month it liked, which is exactly how a stale
      // draft gets silently resumed or a live one made to look stale.
      const cycleLabel = currentCycleLabel();
      const started = typeof startedAt === 'string' ? new Date(startedAt) : new Date(NaN);
      if (Number.isNaN(started.getTime())) {
        return reply.code(400).send({ error: 'started_at must be a timestamp.' });
      }

      await db
        .insert(drafts)
        .values({
          personId: person.id,
          cycleLabel,
          payload,
          startedAt: started,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: drafts.personId,
          set: { cycleLabel, payload, startedAt: started, updatedAt: new Date() },
        });

      return { ok: true };
    },
  );

  app.post<{ Params: SlugParams; Body: DraftBody }>(
    '/api/space/:slug/submit',
    async (request, reply) => {
      const person = await owner(request, reply, request.params.slug);
      if (!person) return;

      const { payload, started_at: startedAt } = request.body ?? {};
      const started = typeof startedAt === 'string' ? new Date(startedAt) : new Date(NaN);
      if (Number.isNaN(started.getTime())) {
        return reply.code(400).send({ error: 'started_at must be a timestamp.' });
      }
      // Worked out here, not taken from the body. Same reasoning as the draft.
      const cycleLabel = currentCycleLabel();

      const templateName = person.templateType as TemplateName;
      const open = await openGoalsFor(person.id);

      try {
        validatePayload(
          templateName,
          payload,
          open.map((goal) => ({ id: goal.id, title: goal.title })),
        );
      } catch (error) {
        if (error instanceof ValidationError) {
          return reply.code(400).send({ error: error.message });
        }
        throw error;
      }

      /*
       * One transaction: the answers are recorded, the goals they just answered
       * about are closed or left open, this month's new goals land on the board,
       * and the draft is gone. Or none of it happened.
       *
       * The goal board is inside the same transaction as the submission on
       * purpose. Two separate steps could file a month's answers and then fail
       * to update the board, leaving somebody with a check-in that says they hit
       * a goal and a board that still shows it open, and no way of telling which
       * was right.
       */
      const submittedAt = await db.transaction(async (tx) => {
        const inserted = await tx
          .insert(submissions)
          .values({
            personId: person.id,
            templateType: person.templateType,
            cycleLabel,
            payload: payload as object,
            startedAt: started,
          })
          .returning({ id: submissions.id, submittedAt: submissions.submittedAt });

        const madeGoals = await applyCheckIn(
          tx as unknown as typeof db,
          person.id,
          templateName,
          payload as Record<string, unknown>,
          inserted[0].id,
          person.name,
        );

        await tx.delete(drafts).where(eq(drafts.personId, person.id));
        return { submittedAt: inserted[0].submittedAt, created: madeGoals };
      });

      /*
       * The coach is started here and DELIBERATELY NOT AWAITED.
       *
       * The check-in is committed by this point. Awaiting the model would put a
       * network call to a third party on the critical path of somebody pressing
       * done, so a slow or down model would turn a saved check-in into a
       * spinner and then an error, on the one screen that must never fail.
       * `writeNoteFor` catches everything internally and returns void, so a
       * rejection cannot escape here either; the `catch` is belt and braces
       * against an unhandled rejection taking the process down.
       *
       * The screen asks for the note separately, and copes with it not being
       * there yet or never arriving.
       */
      void writeNoteFor(person.id).catch(() => {});

      return {
        ok: true,
        submitted_at: submittedAt.submittedAt.toISOString(),
        /** What just went onto the board, so the finish screen can say so. */
        created_goals: submittedAt.created,
        /** Whether it is even worth the screen asking. */
        coach_expected: coachConfigured(),
      };
    },
  );
}

/**
 * How many months in a row this person has finished, ending with the most
 * recent one they finished. Their own number, shown only to them, and never put
 * next to anybody else's.
 */
function ownStreak(cycles: string[], currentCycle: string): number {
  const done = new Set(cycles);
  const step = (cycle: string) => {
    const [year, month] = cycle.split('-').map(Number);
    const previousMonth = month === 1 ? 12 : month - 1;
    const previousYear = month === 1 ? year - 1 : year;
    return `${previousYear}-${String(previousMonth).padStart(2, '0')}`;
  };
  let cursor = done.has(currentCycle) ? currentCycle : step(currentCycle);
  let streak = 0;
  for (let guard = 0; guard < 240; guard++) {
    if (!done.has(cursor)) break;
    streak += 1;
    cursor = step(cursor);
  }
  return streak;
}
