/**
 * Creates the parent view links, one per parent, and prints them with a QR code
 * each. Phase 2.
 *
 * These are the most powerful links in the whole tool: each one reads every
 * person's answers. Run this locally, never in a build step, and do not forward
 * either link to anyone else.
 *
 * Re-running is safe. A parent already in the table keeps the link they have.
 */
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import QRCode from 'qrcode';
import { db, queryClient } from '../db/client.js';
import { dashboardAccess } from '../db/schema.js';

const PARENTS = [
  { label: 'Tyson', slug: 'tyson' },
  { label: 'Danyell', slug: 'danyell' },
];

function newToken(): string {
  return randomBytes(24).toString('base64url');
}

async function main() {
  const baseUrl = (process.env.WEB_BASE_URL ?? '').replace(/\/$/, '');
  if (!baseUrl) {
    throw new Error(
      'WEB_BASE_URL is not set. Set it to the site address so the printed links are the real ones.',
    );
  }

  const qrDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'qr-codes');
  mkdirSync(qrDir, { recursive: true });

  const results: { label: string; url: string; qrPath: string; created: boolean }[] = [];

  for (const parent of PARENTS) {
    const existing = await db
      .select()
      .from(dashboardAccess)
      .where(eq(dashboardAccess.label, parent.label))
      .limit(1);

    let token: string;
    let created = false;
    if (existing[0]) {
      token = existing[0].accessToken;
    } else {
      token = newToken();
      await db.insert(dashboardAccess).values({ label: parent.label, accessToken: token });
      created = true;
    }

    const url = `${baseUrl}/d/${token}`;
    const qrPath = join(qrDir, `parent-view-${parent.slug}.png`);
    await QRCode.toFile(qrPath, url, { width: 600, margin: 2 });
    results.push({ label: parent.label, url, qrPath, created });
  }

  console.log('\nParent view links. Each one reads everybody. Keep them to yourselves.\n');
  for (const result of results) {
    console.log(`${result.label}${result.created ? '' : ' (already existed, link unchanged)'}`);
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
