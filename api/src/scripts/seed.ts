/**
 * Makes sure the five people and the one shared house link exist, and prints
 * them.
 *
 * Run this locally, never in a build step: it prints full access tokens, and a
 * build log is not a place for them. Re-running it is safe. Anybody already in
 * the table keeps the token they have, so links already handed out keep
 * working, and the house link is only created once.
 *
 * What the links mean now:
 *
 *   The house link is the one everybody uses. It opens the family board, which
 *   is names, who has finished this month, and the date. Tapping your own name
 *   asks for your own code. It is safe for all five to hold.
 *
 *   A person's own link is now only a bookmark. It lands on that person's own
 *   sign-in screen and opens nothing without their code, so an old one already
 *   on a phone home screen still works and is no longer a way in.
 */
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import QRCode from 'qrcode';
import { db, queryClient } from '../db/client.js';
import { houseAccess, people } from '../db/schema.js';
import type { TemplateName } from '../lib/templates.js';

const FAMILY: { name: string; slug: string; templateType: TemplateName }[] = [
  { name: 'Tyson', slug: 'tyson', templateType: 'adult' },
  { name: 'Danyell', slug: 'danyell', templateType: 'adult' },
  { name: 'Aidan', slug: 'aidan', templateType: 'teen' },
  { name: 'Mariah', slug: 'mariah', templateType: 'teen' },
  { name: 'Dylan', slug: 'dylan', templateType: 'young_adult' },
];

const HOUSE_LABEL = 'Our house';

/** 24 random bytes, 32 characters once base64url encoded. */
function newToken(): string {
  return randomBytes(24).toString('base64url');
}

async function main() {
  const baseUrl = (process.env.WEB_BASE_URL ?? '').replace(/\/$/, '');
  if (!baseUrl) {
    throw new Error(
      'WEB_BASE_URL is not set. Set it to the site address, for example ' +
        'https://family-plan.vercel.app, so the printed links are the real ones.',
    );
  }

  const qrDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'qr-codes');
  mkdirSync(qrDir, { recursive: true });

  // The one link for the whole house.
  const existingHouse = await db
    .select()
    .from(houseAccess)
    .where(eq(houseAccess.label, HOUSE_LABEL))
    .limit(1);
  let houseToken: string;
  let houseCreated = false;
  if (existingHouse[0]) {
    houseToken = existingHouse[0].accessToken;
  } else {
    houseToken = newToken();
    await db.insert(houseAccess).values({ label: HOUSE_LABEL, accessToken: houseToken });
    houseCreated = true;
  }
  const houseUrl = `${baseUrl}/h/${houseToken}`;
  const houseQr = join(qrDir, 'family-plan.png');
  await QRCode.toFile(houseQr, houseUrl, { width: 600, margin: 2 });

  const results: { name: string; url: string; created: boolean }[] = [];

  for (const person of FAMILY) {
    const existing = await db.select().from(people).where(eq(people.slug, person.slug)).limit(1);
    let token: string;
    let created = false;

    if (existing[0]) {
      token = existing[0].accessToken;
      // Keep the link stable, but correct the name or template if they changed.
      await db
        .update(people)
        .set({ name: person.name, templateType: person.templateType })
        .where(eq(people.id, existing[0].id));
    } else {
      token = newToken();
      await db.insert(people).values({
        name: person.name,
        slug: person.slug,
        templateType: person.templateType,
        accessToken: token,
      });
      created = true;
    }

    results.push({ name: person.name, url: `${baseUrl}/f/${token}`, created });
  }

  console.log('\nThe one link for the whole house. This is the one to share.\n');
  console.log(`  ${houseUrl}${houseCreated ? '' : '  (already existed, unchanged)'}`);
  console.log(`  QR code: ${houseQr}`);
  console.log('\nIt opens the family board. Tapping your own name asks for your own code.');

  console.log('\nOld per-person links, still working, now only bookmarks.\n');
  for (const result of results) {
    console.log(`${result.name}${result.created ? '' : ' (already existed, link unchanged)'}`);
    console.log(`  ${result.url}`);
  }
  console.log(
    '\nEach one lands on that person’s own sign-in screen and opens nothing without\n' +
      'their code, so an old one on a phone home screen keeps working.\n',
  );

  await queryClient.end();
}

main().catch(async (error) => {
  console.error(error);
  await queryClient.end();
  process.exit(1);
});
