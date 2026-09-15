/**
 * A before-and-after fingerprint of everybody's own records.
 *
 * This release changes the schema, the access control and the shape of a goal
 * all at once, so "nobody's records were touched" has to be something that was
 * checked rather than something that was hoped. This prints a fingerprint of
 * what is in the database for each person: how many check-ins, which months,
 * and a hash over the exact bytes of every answer they have ever written.
 *
 * The hash is what makes it worth running. Counts would not notice a payload
 * being rewritten; the hash notices a single character.
 *
 * It prints no answer content and no credential. Run it before the work and
 * again afterwards, and compare the two.
 *
 *     cd api
 *     npx tsx src/scripts/snapshot.ts
 */
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { db, queryClient } from '../db/client.js';
import { drafts, goals, people, submissions } from '../db/schema.js';

async function main() {
  // Only the three columns that existed before this release. This script has
  // to run against the old schema as well as the new one, or the "before" half
  // of the comparison cannot be taken at all.
  const everyone = await db
    .select({ id: people.id, name: people.name, slug: people.slug })
    .from(people)
    .orderBy(asc(people.createdAt));
  console.log(`${everyone.length} people.\n`);

  for (const person of everyone) {
    const mine = await db
      .select({
        cycleLabel: submissions.cycleLabel,
        payload: submissions.payload,
        submittedAt: submissions.submittedAt,
      })
      .from(submissions)
      .where(eq(submissions.personId, person.id))
      .orderBy(asc(submissions.submittedAt));

    const hash = createHash('sha256');
    for (const row of mine) {
      hash.update(row.cycleLabel);
      hash.update(row.submittedAt.toISOString());
      hash.update(JSON.stringify(row.payload));
    }

    const draft = await db
      .select({ cycleLabel: drafts.cycleLabel, payload: drafts.payload })
      .from(drafts)
      .where(eq(drafts.personId, person.id))
      .limit(1);
    const draftHash = draft[0]
      ? createHash('sha256').update(JSON.stringify(draft[0].payload)).digest('hex').slice(0, 16)
      : 'none';

    // The goals table does not exist yet on the old schema, so a missing table
    // is reported as "not yet" rather than failing the whole snapshot.
    let boardCount: number | 'n/a' = 'n/a';
    try {
      const board = await db.select({ id: goals.id }).from(goals).where(eq(goals.personId, person.id));
      boardCount = board.length;
    } catch {
      boardCount = 'n/a';
    }

    console.log(
      `${person.name.padEnd(9)} ` +
        `check-ins ${String(mine.length).padStart(2)} ` +
        `[${mine.map((row) => row.cycleLabel).join(' ') || 'none'}] ` +
        `answers ${hash.digest('hex').slice(0, 16)} ` +
        `draft ${draft[0] ? `${draft[0].cycleLabel} ${draftHash}` : 'none'} ` +
        `goals ${boardCount}`,
    );
  }

  await queryClient.end();
}

main().catch(async (error) => {
  console.error(error);
  await queryClient.end();
  process.exit(1);
});
