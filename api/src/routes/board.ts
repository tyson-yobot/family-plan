import { asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db } from '../db/client.js';
import { dashboardAccess, drafts, houseAccess, people, submissions } from '../db/schema.js';
import { currentCycleLabel, daysLeftInMonth, previousCycleLabel } from '../lib/cycle.js';

/**
 * The family board: the one screen everybody sees, behind the one link the
 * whole house shares.
 *
 * What it is allowed to contain is the entire point of it, so it is worth
 * saying plainly rather than leaving it to be read out of the code: a name, a
 * status, and the date somebody finished. No score, no goal, no answer, no
 * count of words written, nothing derived from what anybody said. Adding a
 * single number that came out of somebody's answers would break the promise the
 * rest of this release is built on, whatever it was labelled on screen.
 *
 * "Started" is deliberately the coarsest thing it says. How far through
 * somebody is would be a real quantity about their private work, and it is not
 * here.
 */

/** Anything that proves the holder is in this house. None of them opens a person. */
async function resolveLink(
  token: string,
): Promise<{ kind: 'house' | 'person'; slug?: string } | null> {
  if (typeof token !== 'string' || token.length < 20) return null;

  const house = await db
    .select({ id: houseAccess.id })
    .from(houseAccess)
    .where(eq(houseAccess.accessToken, token))
    .limit(1);
  if (house[0]) return { kind: 'house' };

  // The old parent links. They used to read everybody's answers; now they are
  // simply another way of holding the house link, so a link already on
  // somebody's phone still opens the board instead of breaking.
  const old = await db
    .select({ id: dashboardAccess.id })
    .from(dashboardAccess)
    .where(eq(dashboardAccess.accessToken, token))
    .limit(1);
  if (old[0]) return { kind: 'house' };

  const person = await db
    .select({ slug: people.slug })
    .from(people)
    .where(eq(people.accessToken, token))
    .limit(1);
  if (person[0]) return { kind: 'person', slug: person[0].slug };

  return null;
}

export { resolveLink };

/**
 * How many months in a row everybody finished, ending with the most recent
 * month that everybody finished.
 *
 * It is the one shared number in the whole tool, and it moves only when all
 * five show up, which is why it is safe: it cannot be used to rank anybody
 * against anybody, because there is nothing in it that belongs to one person.
 *
 * A month part way through does not break the streak. September being
 * unfinished on the fifteenth is not a missed month, so the count is taken from
 * the last complete one.
 */
async function familyStreak(currentCycle: string): Promise<number> {
  const everyone = await db.select({ id: people.id }).from(people);
  if (everyone.length === 0) return 0;

  const rows = await db
    .select({ personId: submissions.personId, cycleLabel: submissions.cycleLabel })
    .from(submissions);

  const byCycle = new Map<string, Set<string>>();
  for (const row of rows) {
    const set = byCycle.get(row.cycleLabel) ?? new Set<string>();
    set.add(row.personId);
    byCycle.set(row.cycleLabel, set);
  }

  const complete = (cycle: string) => (byCycle.get(cycle)?.size ?? 0) >= everyone.length;

  let cursor = complete(currentCycle) ? currentCycle : previousCycleLabel(currentCycle);
  let streak = 0;
  // Twenty years of months is far more than this tool will ever hold, and it
  // stops a bad row turning this into a loop with no end.
  for (let guard = 0; guard < 240; guard++) {
    if (!complete(cursor)) break;
    streak += 1;
    cursor = previousCycleLabel(cursor);
  }
  return streak;
}

export function registerBoardRoutes(app: FastifyInstance) {
  interface TokenParams {
    token: string;
  }

  /** What kind of link this is, so an old bookmark can be sent somewhere sensible. */
  app.get<{ Params: TokenParams }>('/api/link/:token', async (request, reply) => {
    const link = await resolveLink(request.params.token);
    if (!link) return reply.code(404).send({ error: 'This link is not valid.' });
    return link;
  });

  app.get<{ Params: TokenParams }>('/api/board/:token', async (request, reply) => {
    const link = await resolveLink(request.params.token);
    if (!link) return reply.code(404).send({ error: 'This link is not valid.' });

    const cycle = currentCycleLabel();
    const everyone = await db.select().from(people).orderBy(asc(people.createdAt));

    const rows = await Promise.all(
      everyone.map(async (person) => {
        const mine = await db
          .select({ submittedAt: submissions.submittedAt, cycleLabel: submissions.cycleLabel })
          .from(submissions)
          .where(eq(submissions.personId, person.id));
        const finished = mine.find((row) => row.cycleLabel === cycle);

        const draft = await db
          .select({ cycleLabel: drafts.cycleLabel })
          .from(drafts)
          .where(eq(drafts.personId, person.id))
          .limit(1);
        const started = Boolean(draft[0] && draft[0].cycleLabel === cycle);

        return {
          name: person.name,
          slug: person.slug,
          status: finished ? 'done' : started ? 'started' : 'not_started',
          // A date, never a time. The hour somebody sat down with this is
          // nobody else's business and the board has no use for it.
          finished_on: finished ? finished.submittedAt.toISOString().slice(0, 10) : null,
          // Whether they have set a code yet, so a first visit can say "set
          // yours" rather than asking for one that does not exist. It says
          // nothing about what is behind it.
          has_code: Boolean(person.codeHash),
          // Deliberately not here: how many check-ins this person has ever
          // done. It was written and then taken out again. It is not answer
          // content, but it is a number that puts five people in an order, and
          // the shared streak is the only number allowed to exist on this
          // screen precisely because it cannot be used that way.
        };
      }),
    );

    return {
      current_cycle_label: cycle,
      days_left: daysLeftInMonth(),
      family_streak: await familyStreak(cycle),
      finished_count: rows.filter((row) => row.status === 'done').length,
      people_count: rows.length,
      people: rows,
      /** Which person this link belongs to, when it is somebody's own link. */
      link_person_slug: link.kind === 'person' ? (link.slug ?? null) : null,
    };
  });
}
