import Anthropic from '@anthropic-ai/sdk';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { coachNotes, goals, people, submissions, type Person } from '../db/schema.js';
import { HORIZON_LABELS, type Horizon } from './goals.js';
import { TEMPLATES, type TemplateName } from './templates.js';

/**
 * The private coach.
 *
 * After somebody finishes a check-in they get a few sentences written for them,
 * about what they just wrote. It is the only part of this app that says
 * anything back.
 *
 * FOUR RULES, and every one of them is a rule about what it must NOT do. They
 * are enforced here in code and repeated in the prompt, because a prompt is a
 * request and the code is the guarantee.
 *
 *   1. IT READS ONE PERSON. `contextFor` selects by a single person id, every
 *      query, with no exception. It never reads the shared goals, never reads a
 *      sibling's anything, and there is no code path that could pass it two
 *      people. A comparison is impossible rather than discouraged.
 *   2. IT NEVER GRADES. A 2 gets the same warmth as a 9. Somebody writing 2 has
 *      told themselves the truth, which is the single hardest thing this app
 *      asks anybody to do, and praising a 9 teaches everybody to write 9s. That
 *      would quietly destroy the only thing a check-in is for.
 *   3. IT NEVER BLOCKS. Generation happens after the check-in is already saved
 *      and committed. If the model is slow, down, or not configured, the person
 *      still gets their finish screen and their answers are still filed. There
 *      is no path where a coach failure loses somebody's work.
 *   4. IT SPEAKS TO THE PERSON IN FRONT OF IT. An eleven year old and a fifty
 *      three year old do not get the same tone, and the tier on the record is
 *      what decides.
 */

/**
 * Chosen 2026-09-15 after checking the current line-up rather than reusing
 * whatever was to hand.
 *
 * Claude Opus 5, 1M context, $5 per million tokens in and $25 out. At five
 * people checking in monthly plus a handful of rereads this is well under a
 * dollar a month, so the cheaper models buy nothing worth having here. What is
 * actually at stake is tone on a child's screen, and that is the wrong place to
 * save a fraction of a cent. See docs/DECISIONS for the arithmetic.
 */
export const COACH_MODEL = 'claude-opus-5';

/**
 * Effort is deliberately not the default.
 *
 * Writing four warm sentences is not a reasoning problem, and `high` spends
 * thinking tokens on a task that does not have a hard part. `medium` keeps
 * enough judgement to pick the one thing worth saying out of a month of
 * answers, which IS the hard part, without paying for depth nothing reads.
 */
const COACH_EFFORT = 'medium';

/** Whether the coach can run at all. Checked by NAME; the value is never read here. */
export function coachConfigured(): boolean {
  return typeof process.env.ANTHROPIC_API_KEY === 'string' && process.env.ANTHROPIC_API_KEY !== '';
}

/**
 * How the coach talks to each tier.
 *
 * Written as instructions about register rather than about vocabulary, because
 * a rule like "use short words" produces something that reads as talking down,
 * which an eleven year old spots immediately and resents.
 */
const VOICE: Record<TemplateName, string> = {
  adult: [
    'You are writing to an adult who runs a household and a business.',
    'Talk to them as a peer who has read what they wrote and taken it seriously.',
    'No pep talk, no exclamation marks, no motivational-poster language. They will stop reading.',
  ].join(' '),
  young_adult: [
    'You are writing to somebody in their late teens or early twenties who is working out',
    'what they are doing with themselves. Talk to them as an adult, because they are one.',
    'Do not be parental, do not give advice they did not ask for, and do not be impressed by them.',
  ].join(' '),
  teen: [
    'You are writing to a young teenager, around eleven to fifteen.',
    'Be warm and completely straight with them. Short sentences. No baby talk, no slang you',
    'are not sure about, no jokes at their expense, and nothing that sounds like a school report.',
    'They should finish reading it feeling like somebody listened, not like they were marked.',
  ].join(' '),
};

/**
 * Everything the coach is allowed to see, for ONE person.
 *
 * Note what is gathered and what is not. Their own answers, their own goals,
 * their own history. No other person appears in any query in this function, and
 * the person id is a parameter rather than something derived from a request, so
 * there is nothing here that a mistaken route could widen.
 */
interface CoachContext {
  person: Person;
  cycleLabel: string;
  payload: Record<string, unknown>;
  submissionId: string | null;
  openGoals: { id: string; title: string; horizon: Horizon; areaId: string | null }[];
  monthsDone: number;
}

export async function contextFor(personId: string): Promise<CoachContext | null> {
  const found = await db.select().from(people).where(eq(people.id, personId)).limit(1);
  const person = found[0];
  if (!person) return null;

  const mine = await db
    .select({
      id: submissions.id,
      cycleLabel: submissions.cycleLabel,
      payload: submissions.payload,
    })
    .from(submissions)
    .where(eq(submissions.personId, personId))
    .orderBy(desc(submissions.submittedAt));

  const latest = mine[0] ?? null;

  const open = await db
    .select({
      id: goals.id,
      title: goals.title,
      horizon: goals.horizon,
      lifeArea: goals.lifeArea,
    })
    .from(goals)
    .where(and(eq(goals.personId, personId), eq(goals.status, 'open')));

  return {
    person,
    cycleLabel: latest?.cycleLabel ?? '',
    payload: (latest?.payload as Record<string, unknown>) ?? {},
    submissionId: latest?.id ?? null,
    openGoals: open.map((goal) => ({
      id: goal.id,
      title: goal.title,
      horizon: goal.horizon,
      areaId: goal.lifeArea,
    })),
    monthsDone: new Set(mine.map((row) => row.cycleLabel)).size,
  };
}

/**
 * The person's own answers, flattened into something readable.
 *
 * Scores are passed through with their labels so the coach can see WHAT
 * somebody rated low, which is the whole point, but the prompt forbids reading
 * a low number as bad news. That distinction is the difference between "you
 * said money is the one weighing on you" and "your money score is poor".
 */
function describeAnswers(template: TemplateName, payload: Record<string, unknown>): string {
  const lines: string[] = [];
  const spec = TEMPLATES[template];

  const areas = payload.areas;
  if (areas && typeof areas === 'object') {
    for (const area of spec.areas) {
      const entry = (areas as Record<string, unknown>)[area.id];
      if (!entry || typeof entry !== 'object') continue;
      const row = entry as Record<string, unknown>;
      const score = row.score;
      const reason = typeof row.reason === 'string' ? row.reason.trim() : '';
      if (score === undefined || score === null) continue;
      lines.push(
        `${area.label}: ${score} out of ${spec.scoreMax}${reason ? `. In their words: ${reason}` : ''}`,
      );
    }
  }

  // Everything else they wrote, as it was written. Field ids are turned into
  // words so the coach is not reading variable names.
  for (const [key, value] of Object.entries(payload)) {
    if (key === 'areas' || key === 'goal_status' || key === '_ui') continue;
    if (typeof value !== 'string' || value.trim() === '') continue;
    lines.push(`${key.replace(/_/g, ' ')}: ${value.trim()}`);
  }

  return lines.join('\n');
}

export interface CoachDraft {
  body: string;
  suggestedStep: string | null;
  suggestedGoalId: string | null;
}

/**
 * The instruction. Long on purpose: every line of it is a failure somebody
 * would otherwise have to read on their own screen.
 */
function systemPrompt(context: CoachContext): string {
  const { person } = context;
  const template = person.templateType as TemplateName;
  return [
    `You are writing a short private note to ${person.name}, who has just finished their monthly check-in.`,
    VOICE[template],
    '',
    'WHAT THIS IS. They answered honestly about how their life is going. Nobody else will ever',
    'see this note or the answers behind it. You are responding to somebody who told themselves',
    'the truth, which is the hard part, and that is the thing worth acknowledging.',
    '',
    'ABSOLUTE RULES.',
    '- Never grade, score, rank or evaluate them. A low number is not bad news and a high number',
    '  is not a win. Somebody who wrote a 2 has been braver than somebody who wrote a 9.',
    '- Never compare them to anybody: not a sibling, not a parent, not people in general,',
    '  not their own past self in a way that implies they have slipped.',
    '- Never congratulate them for a high score or commiserate about a low one.',
    '- Do not be impressed. Do not be disappointed. The warmth is identical either way.',
    '- No emoji. No exclamation marks. No "keep it up", no "you have got this", no slogans.',
    '- Do not repeat their answers back to them. They just wrote them.',
    '- Do not mention money figures, and never invent a number, a name or a fact.',
    '',
    'WHAT TO WRITE. Three or four sentences, under 90 words. Notice ONE specific thing they',
    'actually said, and say something true about it that they might not have put together',
    'themselves. Plain everyday words. If two things they wrote connect, that connection is',
    'usually the most useful thing you can offer.',
    '',
    'THE ONE STEP. You may suggest one small, concrete first step, and it must be genuinely',
    'small: something doable in a week, ideally in an evening. If nothing obvious presents',
    'itself, or they are already doing the work, leave it out. A made-up task is worse than none.',
    context.openGoals.length > 0
      ? `Their open goals, if the step belongs under one: ${context.openGoals
          .map((goal) => `[${goal.id}] ${goal.title} (${HORIZON_LABELS[goal.horizon]})`)
          .join('; ')}`
      : 'They have no open goals, so any step you suggest stands on its own.',
  ].join('\n');
}

/**
 * The shape the model has to answer in, so accepting a step can be a button.
 *
 * Every field is a plain string and "no step" is the empty string rather than
 * null. A union type written as `type: ['string', 'null']` is not a shape the
 * structured-output support is documented to take, and if it were rejected the
 * request would 400, the catch below would swallow it, and the coach would be
 * silently dead for ever with nothing on any screen saying so. A plain string
 * cannot fail that way, and an empty string is unambiguous.
 */
const RESPONSE_FORMAT = {
  type: 'json_schema' as const,
  schema: {
    type: 'object',
    properties: {
      note: {
        type: 'string',
        description: 'Three or four sentences, under 90 words, addressed to them directly.',
      },
      step: {
        type: 'string',
        description:
          'One small concrete step doable within a week. An empty string if nothing genuine presents itself.',
      },
      step_goal_id: {
        type: 'string',
        description: 'The id of the open goal the step belongs under, or an empty string.',
      },
    },
    required: ['note', 'step', 'step_goal_id'],
    additionalProperties: false,
  },
};

/**
 * Writes the note. Returns null rather than throwing on any failure at all.
 *
 * Every caller is on a path where the person's check-in is already saved, so
 * the only correct behaviour when this goes wrong is to produce nothing and let
 * the screen carry on without it. A thrown error here would surface as a broken
 * finish screen after a check-in that actually succeeded, which is the worst
 * outcome available.
 */
export async function writeNote(context: CoachContext): Promise<CoachDraft | null> {
  if (!coachConfigured()) return null;

  try {
    const client = new Anthropic();
    const answers = describeAnswers(context.person.templateType as TemplateName, context.payload);
    if (answers.trim() === '') return null;

    const response = await client.messages.create({
      model: COACH_MODEL,
      /*
       * Room for the thinking as well as the four sentences.
       *
       * Thinking is ON BY DEFAULT on this model, which is a change from the
       * previous generation, and thinking tokens come out of this same ceiling.
       * At 2,000 a long month of answers could hit the cap, truncate the JSON
       * mid-object, throw in the parse below, and be swallowed by the catch. The
       * person would then sit on "Writing you something" for ever and no error
       * would exist anywhere. 16,000 is the documented default for a
       * non-streaming request and the output itself is under 90 words.
       */
      max_tokens: 16000,
      output_config: {
        effort: COACH_EFFORT,
        format: RESPONSE_FORMAT,
      },
      system: systemPrompt(context),
      messages: [
        {
          role: 'user',
          content: [
            context.monthsDone <= 1
              ? 'This is their first check-in.'
              : `They have checked in ${context.monthsDone} months now.`,
            '',
            'What they wrote this month:',
            answers,
          ].join('\n'),
        },
      ],
    });

    // A refusal is a legitimate outcome rather than an error, and it produces
    // no note at all rather than a note saying something went wrong.
    if (response.stop_reason === 'refusal') return null;

    /*
     * Hitting the ceiling is NOT a legitimate outcome, and it must not look
     * like one.
     *
     * A truncated response would otherwise fail in JSON.parse below and be
     * swallowed by the same catch that handles "the model was unreachable",
     * making a fixable bug indistinguishable from a quiet day. Checked
     * explicitly so it lands in the log as itself.
     */
    if (response.stop_reason === 'max_tokens') {
      console.error('coach: response hit max_tokens and was discarded; raise the ceiling');
      return null;
    }

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();
    if (text === '') return null;

    const parsed = JSON.parse(text) as {
      note?: unknown;
      step?: unknown;
      step_goal_id?: unknown;
    };
    const body = typeof parsed.note === 'string' ? parsed.note.trim() : '';
    if (body === '') return null;

    const step =
      typeof parsed.step === 'string' && parsed.step.trim() !== '' ? parsed.step.trim() : null;

    /*
     * The goal id is checked against THIS person's own open goals rather than
     * trusted. A model returning an id that belongs to somebody else, or one it
     * invented, would otherwise write a step onto a row this person does not
     * own. Anything unrecognised becomes a step with no goal attached, which is
     * still useful and cannot touch anybody else's board.
     */
    const wantedGoal =
      typeof parsed.step_goal_id === 'string' && parsed.step_goal_id.trim() !== ''
        ? parsed.step_goal_id.trim()
        : null;
    const suggestedGoalId =
      wantedGoal && context.openGoals.some((goal) => goal.id === wantedGoal) ? wantedGoal : null;

    return { body, suggestedStep: step, suggestedGoalId };
  } catch {
    // Deliberately swallowed. See the doc comment: there is nothing a failure
    // here should be allowed to break, and the person's work is already saved.
    return null;
  }
}

/**
 * Writes a note and files it, for one person, never throwing.
 *
 * Called without being awaited from the submit route. Nothing downstream
 * depends on it finishing, or on it succeeding.
 */
export async function writeNoteFor(personId: string): Promise<void> {
  try {
    const context = await contextFor(personId);
    if (!context || !context.submissionId) return;

    // Not twice for the same submission. The finish screen polls for the note,
    // and without this a reload during generation would file a second one.
    const already = await db
      .select({ id: coachNotes.id })
      .from(coachNotes)
      .where(
        and(eq(coachNotes.personId, personId), eq(coachNotes.submissionId, context.submissionId)),
      )
      .limit(1);
    if (already[0]) return;

    const draft = await writeNote(context);
    if (!draft) return;

    await db.insert(coachNotes).values({
      personId,
      cycleLabel: context.cycleLabel,
      submissionId: context.submissionId,
      body: draft.body,
      suggestedStep: draft.suggestedStep,
      suggestedGoalId: draft.suggestedGoalId,
      model: COACH_MODEL,
    });
  } catch {
    // Same reasoning as writeNote. This runs detached from any request.
  }
}
