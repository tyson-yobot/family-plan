/**
 * Writes everything anybody has ever entered to a single file on this laptop.
 *
 * Run before a schema change, so that "nobody's records were touched" has
 * something behind it beyond a fingerprint: if the fingerprint ever disagrees,
 * this is what the rows are put back from.
 *
 * It contains every answer everybody has written, so it is private in the same
 * way the database is. Write it somewhere that is not the repository and do not
 * commit it. Pass the destination explicitly; there is no default on purpose.
 *
 *     cd api
 *     npx tsx src/scripts/backup.ts C:\some\path\backup.json
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { asc } from 'drizzle-orm';
import { db, queryClient } from '../db/client.js';
import { drafts, people, submissions } from '../db/schema.js';

async function main() {
  const out = process.argv[2];
  if (!out) {
    throw new Error(
      'Say where to write it. This file holds every answer everybody has written, ' +
        'so it does not get a default path inside the repository.',
    );
  }

  const everyone = await db
    .select({ id: people.id, name: people.name, slug: people.slug })
    .from(people)
    .orderBy(asc(people.createdAt));
  const allDrafts = await db.select().from(drafts);
  const allSubmissions = await db.select().from(submissions).orderBy(asc(submissions.submittedAt));

  writeFileSync(
    out,
    JSON.stringify(
      { taken_at: new Date().toISOString(), people: everyone, drafts: allDrafts, submissions: allSubmissions },
      null,
      2,
    ),
    'utf8',
  );

  console.log(
    `Written to ${out}: ${everyone.length} people, ${allDrafts.length} draft(s), ` +
      `${allSubmissions.length} submission(s).`,
  );

  await queryClient.end();
}

main().catch(async (error) => {
  console.error(error);
  await queryClient.end();
  process.exit(1);
});
