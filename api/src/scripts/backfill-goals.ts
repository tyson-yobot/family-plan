/**
 * Moves goals that were written in a check-in before the goal board existed
 * onto the goal board, so nothing anybody already sent is lost.
 *
 * Before the board, a goal lived only inside the payload of the submission it
 * was written in, and next month's check-in read it back out of the most recent
 * one. A goal that is now a living item somebody ticks, edits and closes has to
 * exist as a row, so this walks each person's own submissions and creates the
 * rows that should already have been there.
 *
 * Which goals become open items, and why only these:
 *
 *   Only the person's MOST RECENT submission. Anything older was already
 *   answered by the check-in that came after it, so putting it on the board
 *   would reopen a goal its owner has already closed and then ask them about it
 *   again next month.
 *
 * Safe to run more than once. A goal already carrying the submission it came
 * out of is left alone, so a second run adds nothing and changes nothing.
 *
 * Run it locally, against one database at a time:
 *
 *     cd api
 *     npx tsx src/scripts/backfill-goals.ts            # says what it would do
 *     npx tsx src/scripts/backfill-goals.ts --write     # does it
 */
import 'dotenv/config';
import { desc, eq } from 'drizzle-orm';
import { db, queryClient } from '../db/client.js';
import { goals, goalSteps, people, submissions } from '../db/schema.js';

interface Found {
  title: string;
  dueDate: string | null;
  owner: string | null;
  firstStep: string | null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function goalsIn(templateType: string, payload: unknown): Found[] {
  if (typeof payload !== 'object' || payload === null) return [];
  const body = payload as Record<string, unknown>;

  if (templateType === 'adult') {
    const written = Array.isArray(body.goals) ? body.goals : [];
    return written
      .map((item) => {
        if (typeof item !== 'object' || item === null) return null;
        const row = item as Record<string, unknown>;
        const title = text(row.goal);
        if (!title) return null;
        return {
          title,
          dueDate: text(row.due_date),
          owner: text(row.owner),
          firstStep: text(row.first_action),
        };
      })
      .filter((item): item is Found => item !== null);
  }

  const title = text(body.goal_this_month);
  return title ? [{ title, dueDate: null, owner: null, firstStep: null }] : [];
}

async function main() {
  const write = process.argv.includes('--write');

  const everyone = await db.select().from(people).orderBy(people.createdAt);
  let created = 0;
  let skipped = 0;

  for (const person of everyone) {
    const latest = await db
      .select()
      .from(submissions)
      .where(eq(submissions.personId, person.id))
      .orderBy(desc(submissions.submittedAt))
      .limit(1);
    const submission = latest[0];
    if (!submission) {
      console.log(`${person.name}: no check-ins, nothing to move.`);
      continue;
    }

    const already = await db
      .select({
        id: goals.id,
        sourceSubmissionId: goals.sourceSubmissionId,
        sortOrder: goals.sortOrder,
      })
      .from(goals)
      .where(eq(goals.personId, person.id));
    if (already.some((row) => row.sourceSubmissionId === submission.id)) {
      console.log(
        `${person.name}: the goals from ${submission.cycleLabel} are already on the board.`,
      );
      skipped += 1;
      continue;
    }

    const found = goalsIn(submission.templateType, submission.payload);
    if (found.length === 0) {
      console.log(`${person.name}: ${submission.cycleLabel} had no goal written down.`);
      continue;
    }

    // The highest sort order already on the board, so backfilled goals land
    // after it rather than on top of it. The first version wrote this as a
    // reduce whose callback ignored the row and always returned zero, which is
    // a sum that cannot be anything but nought.
    let sortOrder = already.reduce((highest, row) => Math.max(highest, row.sortOrder), 0);
    for (const item of found) {
      sortOrder += 1;
      console.log(
        `${person.name}: ${write ? 'moving' : 'would move'} one goal from ` +
          `${submission.cycleLabel} onto the board` +
          (item.firstStep ? ', with its first step' : ''),
      );
      created += 1;
      if (!write) continue;

      const inserted = await db
        .insert(goals)
        .values({
          personId: person.id,
          title: item.title,
          dueDate: item.dueDate,
          owner: item.owner ?? person.name,
          source: 'checkin',
          sourceSubmissionId: submission.id,
          createdCycleLabel: submission.cycleLabel,
          sortOrder,
        })
        .returning({ id: goals.id });

      if (item.firstStep) {
        await db.insert(goalSteps).values({
          goalId: inserted[0].id,
          personId: person.id,
          title: item.firstStep,
          sortOrder: 1,
        });
      }
    }
  }

  console.log(
    `\n${created} goal${created === 1 ? '' : 's'} ${write ? 'moved onto boards' : 'would move'}, ` +
      `${skipped} person${skipped === 1 ? '' : 's'} already done.`,
  );
  if (!write) console.log('Nothing was written. Run again with --write to do it.');

  await queryClient.end();
}

main().catch(async (error) => {
  console.error(error);
  await queryClient.end();
  process.exit(1);
});
