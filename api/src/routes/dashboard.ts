import { and, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db } from '../db/client.js';
import { dashboardAccess, drafts, people, submissions } from '../db/schema.js';
import { currentCycleLabel } from '../lib/cycle.js';

/**
 * The parent view. Phase 2.
 *
 * Access works the same way as the worksheets: a long random token in the URL
 * and no login, because that is the model this whole tool already runs on and a
 * second, different one would be worse than either. A dashboard token reads
 * every person's answers, so it is the one link in this system that matters
 * most: it belongs to a parent and to nobody else.
 *
 * These routes are read only. Nothing here can change or delete an answer.
 */
export function registerDashboardRoutes(app: FastifyInstance) {
  async function findViewer(token: string) {
    if (typeof token !== 'string' || token.length < 20) return null;
    const rows = await db
      .select()
      .from(dashboardAccess)
      .where(eq(dashboardAccess.accessToken, token))
      .limit(1);
    return rows[0] ?? null;
  }

  interface TokenParams {
    token: string;
  }

  // Everyone, and where each of them is with this month.
  app.get<{ Params: TokenParams }>('/api/dashboard/:token', async (request, reply) => {
    const viewer = await findViewer(request.params.token);
    if (!viewer) return reply.code(404).send({ error: 'This link is not valid.' });

    const cycle = currentCycleLabel();
    const everyone = await db.select().from(people).orderBy(people.createdAt);

    const rows = await Promise.all(
      everyone.map(async (person) => {
        const thisMonth = await db
          .select({
            id: submissions.id,
            submittedAt: submissions.submittedAt,
            startedAt: submissions.startedAt,
          })
          .from(submissions)
          .where(and(eq(submissions.personId, person.id), eq(submissions.cycleLabel, cycle)))
          .orderBy(desc(submissions.submittedAt))
          .limit(1);

        const draft = await db
          .select({ startedAt: drafts.startedAt, updatedAt: drafts.updatedAt, cycleLabel: drafts.cycleLabel })
          .from(drafts)
          .where(eq(drafts.personId, person.id))
          .limit(1);

        const all = await db
          .select({ id: submissions.id })
          .from(submissions)
          .where(eq(submissions.personId, person.id));

        return {
          name: person.name,
          slug: person.slug,
          template_type: person.templateType,
          submission_id: thisMonth[0]?.id ?? null,
          submitted_at: thisMonth[0]?.submittedAt.toISOString() ?? null,
          // A draft only counts as "started" when it belongs to this month.
          started_at:
            draft[0] && draft[0].cycleLabel === cycle ? draft[0].startedAt.toISOString() : null,
          last_touched:
            draft[0] && draft[0].cycleLabel === cycle ? draft[0].updatedAt.toISOString() : null,
          total_submissions: all.length,
        };
      }),
    );

    return { viewer_name: viewer.label, current_cycle_label: cycle, people: rows };
  });

  // One person's history.
  app.get<{ Params: TokenParams & { slug: string } }>(
    '/api/dashboard/:token/person/:slug',
    async (request, reply) => {
      const viewer = await findViewer(request.params.token);
      if (!viewer) return reply.code(404).send({ error: 'This link is not valid.' });

      const found = await db
        .select()
        .from(people)
        .where(eq(people.slug, request.params.slug))
        .limit(1);
      const person = found[0];
      if (!person) return reply.code(404).send({ error: 'Nobody by that name.' });

      const history = await db
        .select({
          id: submissions.id,
          cycleLabel: submissions.cycleLabel,
          startedAt: submissions.startedAt,
          submittedAt: submissions.submittedAt,
        })
        .from(submissions)
        .where(eq(submissions.personId, person.id))
        .orderBy(desc(submissions.submittedAt));

      return {
        name: person.name,
        slug: person.slug,
        template_type: person.templateType,
        current_cycle_label: currentCycleLabel(),
        submissions: history.map((row) => ({
          id: row.id,
          cycle_label: row.cycleLabel,
          started_at: row.startedAt.toISOString(),
          submitted_at: row.submittedAt.toISOString(),
        })),
      };
    },
  );

  // One submission, in full.
  app.get<{ Params: TokenParams & { id: string } }>(
    '/api/dashboard/:token/submission/:id',
    async (request, reply) => {
      const viewer = await findViewer(request.params.token);
      if (!viewer) return reply.code(404).send({ error: 'This link is not valid.' });

      const rows = await db
        .select({
          id: submissions.id,
          cycleLabel: submissions.cycleLabel,
          payload: submissions.payload,
          startedAt: submissions.startedAt,
          submittedAt: submissions.submittedAt,
          name: people.name,
          slug: people.slug,
          templateType: people.templateType,
        })
        .from(submissions)
        .innerJoin(people, eq(people.id, submissions.personId))
        .where(eq(submissions.id, request.params.id))
        .limit(1);

      const row = rows[0];
      if (!row) return reply.code(404).send({ error: 'That check-in could not be found.' });

      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        template_type: row.templateType,
        cycle_label: row.cycleLabel,
        started_at: row.startedAt.toISOString(),
        submitted_at: row.submittedAt.toISOString(),
        payload: row.payload,
      };
    },
  );
}
