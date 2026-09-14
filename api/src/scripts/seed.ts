/**
 * Inserts the five people and prints each person's private link and QR code.
 *
 * Run this locally, never in a build step: it prints full access tokens, and a
 * build log is not a place for them. Re-running it is safe. Anyone already in
 * the table keeps the token they have, so links already handed out keep working.
 */
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import QRCode from 'qrcode';
import { db, queryClient } from '../db/client.js';
import { people } from '../db/schema.js';
import type { TemplateName } from '../lib/templates.js';

const FAMILY: { name: string; slug: string; templateType: TemplateName }[] = [
  { name: 'Tyson', slug: 'tyson', templateType: 'adult' },
  { name: 'Danyell', slug: 'danyell', templateType: 'adult' },
  { name: 'Aidan', slug: 'aidan', templateType: 'teen' },
  { name: 'Mariah', slug: 'mariah', templateType: 'teen' },
  { name: 'Dylan', slug: 'dylan', templateType: 'young_adult' },
];

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

  const results: { name: string; url: string; qrPath: string; created: boolean }[] = [];

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

    const url = `${baseUrl}/f/${token}`;
    const qrPath = join(qrDir, `${person.slug}.png`);
    await QRCode.toFile(qrPath, url, { width: 600, margin: 2 });
    results.push({ name: person.name, url, qrPath, created });
  }

  console.log('\nPrivate links, one per person. Send each person only their own.\n');
  for (const result of results) {
    console.log(`${result.name}${result.created ? '' : ' (already existed, link unchanged)'}`);
    console.log(`  ${result.url}`);
    console.log(`  QR code: ${result.qrPath}`);
    console.log('');
  }

  await queryClient.end();
}

main().catch(async (error) => {
  console.error(error);
  await queryClient.end();
  process.exit(1);
});
