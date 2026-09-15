import { and, eq, gt, lt, sql } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { db } from '../db/client.js';
import { people, sessions, type Person } from '../db/schema.js';
import { hashSessionToken, newSessionToken, verifyCode } from './codes.js';

/**
 * The access control.
 *
 * Two separate things are checked, and the difference between them is the whole
 * of the privacy model here:
 *
 *   - Holding the shared house link proves you are in this house. It opens the
 *     family board, which is names, a status and a date, and nothing else.
 *   - Holding a person's own link proves nothing at all any more. Every request
 *     for anything private has to carry a session that was created by that
 *     person typing their own code, and the session's person has to be the
 *     person being asked about.
 *
 * Both halves matter. Checking only the session would let Aidan's phone read
 * Mariah's board through her link. Checking only the link is where this started
 * and is what Change 2 replaced.
 */

/** Long enough that a phone is not asked every day, short enough that a shared
 * device does not stay open forever. These are household phones. */
export const SESSION_DAYS = 30;

/** Wrong codes before the door closes for a while. */
const ATTEMPTS_BEFORE_LOCK = 5;

/**
 * How long the lockout lasts, by how many times it has now happened. The first
 * one is short enough to be a nuisance rather than a disaster for somebody who
 * genuinely forgot; they get longer from there.
 */
function lockMinutes(failedAttempts: number): number {
  const locks = Math.floor(failedAttempts / ATTEMPTS_BEFORE_LOCK);
  if (locks <= 1) return 1;
  if (locks === 2) return 5;
  if (locks === 3) return 15;
  return 60;
}

/**
 * A deliberate pause before every answer about a code, right or wrong.
 *
 * It is on the correct answer too, on purpose: a delay that only happens when
 * the code is wrong tells somebody which of their guesses was right by how fast
 * the refusal came back, which hands away most of what the lockout is defending.
 */
function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface SignInOutcome {
  ok: boolean;
  /** Set when the door is shut for now, in whole seconds. */
  lockedForSeconds?: number;
  sessionToken?: string;
  expiresAt?: Date;
}

export async function signIn(person: Person, code: string): Promise<SignInOutcome> {
  const now = new Date();

  if (person.lockedUntil && person.lockedUntil > now) {
    return {
      ok: false,
      lockedForSeconds: Math.ceil((person.lockedUntil.getTime() - now.getTime()) / 1000),
    };
  }

  const correct = await verifyCode(code, person.codeHash);

  // The slow-down grows with the run of wrong answers, and is applied before
  // the answer goes back whichever way it went.
  await pause(Math.min(150 * (person.failedAttempts + 1), 2000));

  if (!correct) {
    /*
     * The count is incremented BY THE DATABASE, not by this process.
     *
     * The first version read person.failedAttempts, added one, and wrote the
     * result back. That is a read-modify-write across a round trip, and it is
     * exactly the shape of a check that passes when you test it by hand and
     * fails against the thing it exists to stop. Fire a hundred wrong codes at
     * once and every one of them reads the same stale count, every one writes
     * the same number back, the count never climbs, the lock never escalates
     * and the delay stays at its floor. Ten thousand codes is then a few
     * minutes of wall clock, which is the whole of a four-digit code.
     *
     * Incrementing in SQL means a hundred parallel requests produce a hundred
     * increments, which is what the lockout is counting.
     */
    const bumped = await db
      .update(people)
      .set({ failedAttempts: sql`${people.failedAttempts} + 1` })
      .where(eq(people.id, person.id))
      .returning({ failedAttempts: people.failedAttempts, lockedUntil: people.lockedUntil });

    const failed = bumped[0]?.failedAttempts ?? person.failedAttempts + 1;
    const alreadyLocked =
      bumped[0]?.lockedUntil && bumped[0].lockedUntil > now ? bumped[0].lockedUntil : null;

    let locked = alreadyLocked;
    if (failed % ATTEMPTS_BEFORE_LOCK === 0) {
      locked = new Date(now.getTime() + lockMinutes(failed) * 60_000);
      await db.update(people).set({ lockedUntil: locked }).where(eq(people.id, person.id));
    }

    return {
      ok: false,
      lockedForSeconds: locked ? Math.ceil((locked.getTime() - now.getTime()) / 1000) : undefined,
    };
  }

  await db
    .update(people)
    .set({ failedAttempts: 0, lockedUntil: null })
    .where(eq(people.id, person.id));

  const token = newSessionToken();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({
    personId: person.id,
    tokenHash: await hashSessionToken(token),
    expiresAt,
  });

  // Anything already past its date, cleared out while we are here. There is no
  // scheduler in this tool, so the tidying has to hang off something that
  // actually happens.
  await db.delete(sessions).where(lt(sessions.expiresAt, now));

  return { ok: true, sessionToken: token, expiresAt };
}

export async function endSession(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, await hashSessionToken(token)));
}

/** Every session this person has, anywhere. Used when their code is reset. */
export async function endAllSessions(personId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.personId, personId));
}

function bearerFrom(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (typeof header !== 'string') return null;
  const match = header.match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : null;
}

/** The person a request proves it is, or null. Says nothing about who it asked for. */
export async function personFromSession(request: FastifyRequest): Promise<Person | null> {
  const token = bearerFrom(request);
  if (!token) return null;
  const rows = await db
    .select({ person: people })
    .from(sessions)
    .innerJoin(people, eq(people.id, sessions.personId))
    .where(
      and(
        eq(sessions.tokenHash, await hashSessionToken(token)),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!rows[0]) return null;
  // Marks the row as used. Without this lastSeenAt is a column that says "last
  // seen" and means "created", which is worse than not having it.
  await db
    .update(sessions)
    .set({ lastSeenAt: new Date() })
    .where(eq(sessions.tokenHash, await hashSessionToken(token)));
  return rows[0].person;
}

/**
 * The guard on every private route.
 *
 * It answers one question: is the caller the person whose data this route is
 * about? A valid session for somebody else is refused here, which is the check
 * that makes "one person's proof never works for another person's data" a thing
 * the server does rather than a thing the interface hides.
 *
 * Both failures answer 401 with the same words. Telling a caller apart, "your
 * session is fine but this is not your data" versus "your session is no good",
 * is a way of confirming whose link you are holding, and there is nothing a
 * real person can do differently with the two answers anyway.
 */
export async function requireOwner(
  request: FastifyRequest,
  reply: FastifyReply,
  wanted: Person,
): Promise<Person | null> {
  const signedIn = await personFromSession(request);
  if (!signedIn || signedIn.id !== wanted.id) {
    await reply
      .code(401)
      .send({ error: 'Enter your code to open this.', code: 'code_required' });
    return null;
  }
  return signedIn;
}
