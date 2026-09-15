import { and, asc, eq, ne } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db } from '../db/client.js';
import { cheers, goals, goalSteps, people, type Goal } from '../db/schema.js';
import { personFromSession } from '../lib/auth.js';

/**
 * What the five of them can see of each other.
 *
 * The line this file exists to hold, and the reasoning behind it, because every
 * future change here will be a judgement call against it:
 *
 *   A GOAL IS SHARED. It is a commitment somebody is willing to be held to, and
 *   sharing it is the point: the title, which part of life it belongs to, when
 *   it is due, how it is going, and whether it was hit, missed or dropped.
 *
 *   A SCORE, AND THE SENTENCE BEHIND IT, IS PRIVATE. That is somebody admitting
 *   where they are weak. Sharing it does not make anybody better; it turns
 *   honest answers into careful ones, which destroys the only thing a check-in
 *   is for.
 *
 *   ANYTHING GENUINELY AMBIGUOUS IS PRIVATE.
 *
 * So the shape below is a deliberately short allow-list rather than a row with
 * a few things stripped out. A column added to `goals` later is private until
 * somebody decides otherwise and adds it here on purpose, which is the right
 * way round: the failure of a deny-list is a leak, and the failure of an
 * allow-list is a missing field somebody notices immediately.
 *
 * What is deliberately NOT in it, and why:
 *
 *   detail, closedNote, progressNote   written reflections, private
 *   step titles                        a step can say more than a commitment
 *                                      does; the COUNT is the progress, and the
 *                                      count is what is shared
 *   targetNumber, progressNumber       the figures behind a goal. Mission 2's
 *                                      money screens live in these, and a money
 *                                      goal is shareable without its numbers
 *   parentGoalId                       would confirm a private parent exists
 *   weeklyHabit, weeklyTargetCount     the weekly detail is the owner's alone,
 *   habit ticks                        and no route here reads habit_logs at all
 *   any score, any reason, any note    never leaves the person's own space
 *   any coach response                 written for one person and shown to them
 *
 * And a goal its owner has marked private is not here at all: not its title,
 * not its status, not as a number. A row that says "and two others" is still a
 * row about somebody's private goals.
 */

/** The reactions somebody can send. A closed set, and there is no free text. */
export const REACTIONS = ['Go on', 'Proud of you', 'Big one', 'You have got this'] as const;
export type Reaction = (typeof REACTIONS)[number];

interface SharedGoal {
  id: string;
  person_slug: string;
  person_name: string;
  title: string;
  life_area: string | null;
  due_date: string | null;
  /**
   * Which timeframe this goal sits in. Added to the allow-list on purpose in
   * Mission 2, and the reasoning matters because it is the first thing added
   * here since the list was written.
   *
   * It is the same class of fact as `due_date`, which was already shared: when
   * somebody means to have done this by. A ten-year goal being visible as a
   * ten-year goal is the thing that lets the household see somebody is playing
   * a long game rather than missing a short one, which is the point of sharing
   * goals at all.
   *
   * `parent_goal_id` was deliberately NOT added alongside it. A ninety-day goal
   * may hang off a parent its owner has marked private, and handing out that
   * id would confirm a private goal exists and let a caller match several
   * shared goals to the same hidden one. The laddering view lives in the
   * owner's own space, where the parent is theirs to see.
   */
  horizon: Goal['horizon'];
  status: Goal['status'];
  created_cycle_label: string;
  closed_cycle_label: string | null;
  steps_done: number;
  steps_total: number;
  cheers: { from_slug: string; from_name: string; reaction: string }[];
}

export function registerFamilyRoutes(app: FastifyInstance) {
  /**
   * Everybody's shared goals, for somebody who is signed in as one of them.
   *
   * Being signed in is required even though a goal is shared, and the
   * distinction is worth stating: "shared with all five" is not the same as
   * "readable by whoever is holding the link". The link can be forwarded, sit
   * in a message thread, or turn up in somebody else's browser history. A code
   * is what proves you are one of the five.
   *
   * Nothing here is ordered or scored by how much anybody has done. The people
   * come back in the order they were added and always will, because any
   * ordering that moves is a league table whatever it is labelled.
   */
  app.get('/api/family/goals', async (request, reply) => {
    const viewer = await personFromSession(request);
    if (!viewer) {
      return reply.code(401).send({ error: 'Enter your code to open this.', code: 'code_required' });
    }

    const everyone = await db.select().from(people).orderBy(asc(people.createdAt));
    const shared = await db
      .select()
      .from(goals)
      .where(eq(goals.isPrivate, false))
      .orderBy(asc(goals.sortOrder), asc(goals.createdAt));

    const steps = await db
      .select({ goalId: goalSteps.goalId, done: goalSteps.done })
      .from(goalSteps);
    const stepCount = new Map<string, { done: number; total: number }>();
    for (const step of steps) {
      const at = stepCount.get(step.goalId) ?? { done: 0, total: 0 };
      at.total += 1;
      if (step.done) at.done += 1;
      stepCount.set(step.goalId, at);
    }

    const allCheers = await db
      .select({
        goalId: cheers.goalId,
        reaction: cheers.reaction,
        fromSlug: people.slug,
        fromName: people.name,
      })
      .from(cheers)
      .innerJoin(people, eq(people.id, cheers.fromPersonId));
    const cheersByGoal = new Map<string, SharedGoal['cheers']>();
    for (const cheer of allCheers) {
      const list = cheersByGoal.get(cheer.goalId) ?? [];
      list.push({ from_slug: cheer.fromSlug, from_name: cheer.fromName, reaction: cheer.reaction });
      cheersByGoal.set(cheer.goalId, list);
    }

    const byPerson = new Map<string, { name: string; slug: string; goals: SharedGoal[] }>();
    for (const person of everyone) {
      byPerson.set(person.id, { name: person.name, slug: person.slug, goals: [] });
    }
    for (const goal of shared) {
      const owner = byPerson.get(goal.personId);
      if (!owner) continue;
      const count = stepCount.get(goal.id) ?? { done: 0, total: 0 };
      owner.goals.push({
        id: goal.id,
        person_slug: owner.slug,
        person_name: owner.name,
        title: goal.title,
        life_area: goal.lifeArea,
        due_date: goal.dueDate,
        horizon: goal.horizon,
        status: goal.status,
        created_cycle_label: goal.createdCycleLabel,
        closed_cycle_label: goal.closedCycleLabel,
        steps_done: count.done,
        steps_total: count.total,
        cheers: cheersByGoal.get(goal.id) ?? [],
      });
    }

    return {
      viewer_slug: viewer.slug,
      reactions: REACTIONS,
      people: [...byPerson.values()],
    };
  });

  interface CheerBody {
    reaction?: unknown;
  }

  /**
   * A cheer on somebody else's goal.
   *
   * One per person per goal, so tapping again swaps it rather than stacking
   * another one up, and tapping the same one again takes it off.
   *
   * The three things it refuses are the three ways this could become something
   * other than a nudge: a private goal, your own goal, and anything that is not
   * one of the four preset reactions. There is no text field anywhere near it.
   */
  app.post<{ Params: { goalId: string }; Body: CheerBody }>(
    '/api/family/goals/:goalId/cheer',
    async (request, reply) => {
      const viewer = await personFromSession(request);
      if (!viewer) {
        return reply
          .code(401)
          .send({ error: 'Enter your code to open this.', code: 'code_required' });
      }

      const reaction = request.body?.reaction;
      if (typeof reaction !== 'string' || !REACTIONS.includes(reaction as Reaction)) {
        return reply.code(400).send({ error: 'That is not one of the cheers.' });
      }

      const found = await db
        .select({ id: goals.id, personId: goals.personId, isPrivate: goals.isPrivate })
        .from(goals)
        .where(and(eq(goals.id, request.params.goalId), eq(goals.isPrivate, false)))
        .limit(1);
      const goal = found[0];
      if (!goal) {
        // Answered the same way whether the goal does not exist or is private,
        // because a different answer for a private goal confirms it is there.
        return reply.code(404).send({ error: 'That goal could not be found.' });
      }
      if (goal.personId === viewer.id) {
        return reply.code(400).send({ error: 'You cannot cheer your own goal.' });
      }

      const already = await db
        .select({ id: cheers.id, reaction: cheers.reaction })
        .from(cheers)
        .where(and(eq(cheers.goalId, goal.id), eq(cheers.fromPersonId, viewer.id)))
        .limit(1);

      if (already[0] && already[0].reaction === reaction) {
        await db.delete(cheers).where(eq(cheers.id, already[0].id));
        return { ok: true, reaction: null };
      }
      if (already[0]) {
        await db.update(cheers).set({ reaction }).where(eq(cheers.id, already[0].id));
        return { ok: true, reaction };
      }
      await db.insert(cheers).values({
        goalId: goal.id,
        goalOwnerId: goal.personId,
        fromPersonId: viewer.id,
        reaction,
      });
      return { ok: true, reaction };
    },
  );

  /** The cheers on this person's own goals, shown to them and to nobody else. */
  app.get<{ Params: { slug: string } }>('/api/family/cheers/:slug', async (request, reply) => {
    const viewer = await personFromSession(request);
    if (!viewer || viewer.slug !== request.params.slug) {
      return reply.code(401).send({ error: 'Enter your code to open this.', code: 'code_required' });
    }
    const rows = await db
      .select({
        goalId: cheers.goalId,
        reaction: cheers.reaction,
        fromName: people.name,
        fromSlug: people.slug,
      })
      .from(cheers)
      .innerJoin(people, eq(people.id, cheers.fromPersonId))
      .where(and(eq(cheers.goalOwnerId, viewer.id), ne(cheers.fromPersonId, viewer.id)));
    return {
      cheers: rows.map((row) => ({
        goal_id: row.goalId,
        reaction: row.reaction,
        from_name: row.fromName,
        from_slug: row.fromSlug,
      })),
    };
  });
}
