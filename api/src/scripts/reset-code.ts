/**
 * Clears somebody's code so they can pick a new one.
 *
 * Tyson can already do this from inside his own space for everybody else. This
 * exists for the one case that screen cannot cover: Tyson forgetting his own.
 * Without it his code is the single thing in this tool with no way back, and a
 * lock with no key is not a safeguard, it is a defect waiting for a bad week.
 *
 * What it does and does not do, and the difference matters:
 *
 *   It clears the stored code and ends every session that person has open, so
 *   the next visit to their name is a "pick your code" screen.
 *
 *   It does not reveal the old code. Nothing can: what is stored is a scrypt
 *   hash and there is no path back from it. It does not read, print or touch a
 *   single answer, score or goal either.
 *
 * It needs the database, which means it needs the laptop, which is the whole of
 * why it is safe to have.
 *
 *     cd api
 *     npx tsx src/scripts/reset-code.ts tyson
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db, queryClient } from '../db/client.js';
import { people, sessions } from '../db/schema.js';

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    throw new Error('Say whose code to clear, for example: npx tsx src/scripts/reset-code.ts tyson');
  }

  const found = await db.select().from(people).where(eq(people.slug, slug)).limit(1);
  const person = found[0];
  if (!person) {
    throw new Error(`There is nobody with the name "${slug}".`);
  }

  await db
    .update(people)
    .set({ codeHash: null, codeSetAt: null, failedAttempts: 0, lockedUntil: null })
    .where(eq(people.id, person.id));
  const ended = await db.delete(sessions).where(eq(sessions.personId, person.id)).returning({
    id: sessions.id,
  });

  console.log(
    `${person.name} can pick a new code next time they open their own name. ` +
      `${ended.length} signed-in phone${ended.length === 1 ? '' : 's'} signed out.`,
  );
  console.log('Nothing they have written was read, changed or shown.');

  await queryClient.end();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await queryClient.end();
  process.exit(1);
});
