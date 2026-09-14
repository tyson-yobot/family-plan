import cors from '@fastify/cors';
import { desc, eq } from 'drizzle-orm';
import Fastify from 'fastify';
import { db } from './db/client.js';
import { drafts, people, submissions, type Person } from './db/schema.js';
import { buildInfo } from './lib/build-info.js';
import { currentCycleLabel } from './lib/cycle.js';
import { carryForward, EMPTY_CARRIED_FORWARD } from './lib/previous.js';
import type { TemplateName } from './lib/templates.js';
import { ValidationError, validatePayload } from './lib/validate.js';
import { registerDashboardRoutes } from './routes/dashboard.js';

/**
 * Keeps access tokens out of THIS service's log lines. Fastify logs every
 * request path by default, which on Railway would put every permanent private
 * link into the log stream.
 *
 * It is worth being exact about what this does not cover: the page the family
 * opens is served by Vercel, and its access log records /f/<token> in full.
 * Nothing in this repository can redact that. This guard is about Railway.
 */
function redactPath(url: string): string {
  return url.replace(/\/api\/(form|dashboard)\/[^/?]+/, '/api/$1/[token]');
}

const app = Fastify({
  logger: {
    serializers: {
      req(request) {
        return { method: request.method, url: redactPath(request.url) };
      },
    },
  },
});

const allowedOrigins = (process.env.WEB_ORIGIN ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin !== '');

if (allowedOrigins.length === 0) {
  throw new Error(
    'WEB_ORIGIN is not set. It must list the exact site origins allowed to call this API. ' +
      'A wildcard is not acceptable here: the URLs carry private access tokens.',
  );
}
if (allowedOrigins.includes('*')) {
  throw new Error('WEB_ORIGIN must name exact origins. "*" is not allowed.');
}

await app.register(cors, {
  origin: allowedOrigins,
  methods: ['GET', 'PUT', 'POST'],
});

async function findPerson(token: string): Promise<Person | null> {
  if (typeof token !== 'string' || token.length < 20) return null;
  const rows = await db.select().from(people).where(eq(people.accessToken, token)).limit(1);
  return rows[0] ?? null;
}

/** The person's most recent submission, which is what feeds the next cycle. */
async function latestSubmission(personId: string) {
  const rows = await db
    .select()
    .from(submissions)
    .where(eq(submissions.personId, personId))
    .orderBy(desc(submissions.submittedAt))
    .limit(1);
  return rows[0] ?? null;
}

interface TokenParams {
  token: string;
}

app.get('/api/version', async () => buildInfo);

// The parent view, Phase 2. Read only.
registerDashboardRoutes(app);

app.get<{ Params: TokenParams }>('/api/form/:token', async (request, reply) => {
  const person = await findPerson(request.params.token);
  if (!person) return reply.code(404).send({ error: 'This link is not valid.' });

  const previous = await latestSubmission(person.id);
  const carried = previous
    ? carryForward(person.templateType as TemplateName, previous.payload)
    : EMPTY_CARRIED_FORWARD;

  const cycle = currentCycleLabel();
  // Whether this month is already finished. Without this the worksheet reopens
  // blank after a submit, with nothing to say it has already been done, and a
  // second row lands for the same month.
  const alreadyDone =
    previous && previous.cycleLabel === cycle
      ? { id: previous.id, submitted_at: previous.submittedAt.toISOString() }
      : null;

  return {
    name: person.name,
    // The worksheet is coloured per person, so the page needs to know who this is.
    slug: person.slug,
    template_type: person.templateType,
    current_cycle_label: cycle,
    submitted_this_cycle: alreadyDone,
    // Whether they have ever finished one, which is a different question from
    // whether they set a goal last time.
    has_earlier_submissions: Boolean(previous),
    previous_goals: carried.previousGoals,
    my_area: carried.myArea,
    last_cycle_status: carried.lastCycleStatus,
    last_initiative_note: carried.lastInitiativeNote,
    // Their own note to themselves from last time, shown back before anything else.
    note_to_self: carried.noteToSelf,
  };
});

app.get<{ Params: TokenParams }>('/api/form/:token/draft', async (request, reply) => {
  const person = await findPerson(request.params.token);
  if (!person) return reply.code(404).send({ error: 'This link is not valid.' });

  const rows = await db.select().from(drafts).where(eq(drafts.personId, person.id)).limit(1);
  const draft = rows[0];
  if (!draft) return null;

  // Returns what is stored, nothing more. Whether it is stale for the current
  // month is decided against current_cycle_label from the form endpoint.
  return {
    cycle_label: draft.cycleLabel,
    payload: draft.payload,
    started_at: draft.startedAt.toISOString(),
  };
});

interface DraftBody {
  cycle_label?: unknown;
  payload?: unknown;
  started_at?: unknown;
}

app.put<{ Params: TokenParams; Body: DraftBody }>(
  '/api/form/:token/draft',
  async (request, reply) => {
    const person = await findPerson(request.params.token);
    if (!person) return reply.code(404).send({ error: 'This link is not valid.' });

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

app.post<{ Params: TokenParams; Body: DraftBody }>(
  '/api/form/:token/submit',
  async (request, reply) => {
    const person = await findPerson(request.params.token);
    if (!person) return reply.code(404).send({ error: 'This link is not valid.' });

    const { payload, started_at: startedAt } = request.body ?? {};
    const started = typeof startedAt === 'string' ? new Date(startedAt) : new Date(NaN);
    if (Number.isNaN(started.getTime())) {
      return reply.code(400).send({ error: 'started_at must be a timestamp.' });
    }
    // Worked out here, not taken from the body. Same reasoning as the draft.
    const cycleLabel = currentCycleLabel();

    const templateName = person.templateType as TemplateName;
    const previous = await latestSubmission(person.id);
    const carried = previous
      ? carryForward(templateName, previous.payload)
      : EMPTY_CARRIED_FORWARD;

    try {
      validatePayload(templateName, payload, carried.previousGoals);
    } catch (error) {
      if (error instanceof ValidationError) {
        return reply.code(400).send({ error: error.message });
      }
      throw error;
    }

    // One transaction: either the answers are recorded and the draft is gone,
    // or neither happened. Two separate statements could record the submission
    // and leave the draft behind, so the person resumes a worksheet they have
    // already handed in and submits it twice.
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
        .returning({ submittedAt: submissions.submittedAt });

      await tx.delete(drafts).where(eq(drafts.personId, person.id));
      return inserted[0].submittedAt;
    });

    return { ok: true, submitted_at: submittedAt.toISOString() };
  },
);

const port = Number(process.env.PORT ?? 8080);
await app.listen({ port, host: '0.0.0.0' });
