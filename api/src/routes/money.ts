import { and, eq, gt, lt, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { db } from '../db/client.js';
import {
  categoryRules,
  moneyAccess,
  moneySessions,
  people,
  savingsTargets,
  spendingCaps,
  type Person,
} from '../db/schema.js';
import { personFromSession } from '../lib/auth.js';
import { hashCode, hashSessionToken, newSessionToken, verifyCode } from '../lib/codes.js';
import { currentCycleLabel } from '../lib/cycle.js';
import { moneyView, quarterOf, syncBank } from '../lib/money.js';
import { simplefinConfigured } from '../lib/simplefin.js';

/**
 * The money area.
 *
 * TWO GATES, and both have to be passed on every single request here.
 *
 *   1. AN ADULT. `templateType` must be 'adult'. The three children cannot
 *      reach any route in this file with any credential they could ever hold,
 *      and the money area does not appear on their side of the app at all: the
 *      web build asks for nothing here unless the person is an adult, so it is
 *      absent rather than hidden or empty.
 *   2. A MONEY SESSION. The ordinary four-digit code is NOT enough. Four digits
 *      guards a goal board; it is not the right size of secret for a year of
 *      bank transactions. Each adult sets their own longer passphrase, and a
 *      money session expires in minutes rather than the month an ordinary
 *      session lasts.
 *
 * Either adult's correct passphrase opens the SAME shared household view. They
 * run a household together and mutual accountability is the point of building
 * this at all; a per-adult slice of a joint account would be a fiction.
 *
 * READ ONLY, ALWAYS. There is no route in this file, and no function it calls,
 * that could move money. SimpleFIN cannot do it either.
 */

/**
 * Short on purpose. A phone left face-up on a kitchen counter in a house with
 * three children should not still be showing the bank half an hour later.
 */
const MONEY_SESSION_MINUTES = 15;

/** A passphrase is not a code. Length is most of what makes it a better one. */
const MIN_PASSPHRASE = 12;

const ATTEMPTS_BEFORE_LOCK = 5;

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The signed-in person, if they are an adult. Used before the money gate. */
async function adultFrom(request: FastifyRequest, reply: FastifyReply): Promise<Person | null> {
  const person = await personFromSession(request);
  if (!person) {
    await reply.code(401).send({ error: 'Enter your code to open this.', code: 'code_required' });
    return null;
  }
  if (person.templateType !== 'adult') {
    /*
     * Answered as a plain not-found rather than "you are not allowed".
     *
     * A child who taps a link they should not have does not need to be told
     * there is a room they cannot enter, and an explicit refusal is also a way
     * of confirming the area exists and is worth attacking. As far as any
     * child's session is concerned, there is nothing at this address.
     */
    await reply.code(404).send({ error: 'There is nothing at that address.' });
    return null;
  }
  return person;
}

function bearer(request: FastifyRequest): string | null {
  // A SECOND header, deliberately not Authorization. The ordinary session token
  // travels in Authorization and the two must never be interchangeable: if the
  // money gate read the same header, an ordinary month-long session would open
  // the bank, which is the whole thing this gate exists to prevent.
  const header = request.headers['x-money-session'];
  return typeof header === 'string' && header.trim() !== '' ? header.trim() : null;
}

/** An adult who has ALSO answered the money passphrase recently. */
async function moneyUnlocked(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<Person | null> {
  const person = await adultFrom(request, reply);
  if (!person) return null;

  const token = bearer(request);
  if (!token) {
    await reply
      .code(401)
      .send({ error: 'Enter your money passphrase.', code: 'passphrase_required' });
    return null;
  }
  const rows = await db
    .select({ id: moneySessions.id })
    .from(moneySessions)
    .where(
      and(
        eq(moneySessions.tokenHash, await hashSessionToken(token)),
        gt(moneySessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!rows[0]) {
    await reply
      .code(401)
      .send({ error: 'Enter your money passphrase.', code: 'passphrase_required' });
    return null;
  }
  return person;
}

export function registerMoneyRoutes(app: FastifyInstance) {
  /** Whether this adult has set a passphrase yet. Says nothing about the money. */
  app.get('/api/money/gate', async (request, reply) => {
    const person = await adultFrom(request, reply);
    if (!person) return;
    const rows = await db
      .select({ lockedUntil: moneyAccess.lockedUntil })
      .from(moneyAccess)
      .where(eq(moneyAccess.personId, person.id))
      .limit(1);
    const now = new Date();
    return {
      has_passphrase: rows.length > 0,
      minimum_length: MIN_PASSPHRASE,
      locked_for_seconds:
        rows[0]?.lockedUntil && rows[0].lockedUntil > now
          ? Math.ceil((rows[0].lockedUntil.getTime() - now.getTime()) / 1000)
          : 0,
      /** So the screen can be honest about there being no bank connected yet. */
      bank_connected: simplefinConfigured(),
    };
  });

  interface PassphraseBody {
    passphrase?: unknown;
  }

  /**
   * Sets this adult's own money passphrase.
   *
   * Only when they do not already have one, exactly like the four-digit code.
   * Somebody who has forgotten theirs is not served here, because a route that
   * replaced a forgotten passphrase from inside an ordinary session would make
   * the ordinary session sufficient to reach the money, which is the one thing
   * this gate exists to stop.
   */
  app.post<{ Body: PassphraseBody }>('/api/money/passphrase', async (request, reply) => {
    const person = await adultFrom(request, reply);
    if (!person) return;

    const existing = await db
      .select({ id: moneyAccess.id })
      .from(moneyAccess)
      .where(eq(moneyAccess.personId, person.id))
      .limit(1);
    if (existing[0]) {
      return reply
        .code(409)
        .send({ error: 'You already have a money passphrase set on this account.' });
    }

    const passphrase = typeof request.body?.passphrase === 'string' ? request.body.passphrase : '';
    if (passphrase.trim().length < MIN_PASSPHRASE) {
      return reply.code(400).send({
        error: `A money passphrase needs at least ${MIN_PASSPHRASE} characters. A short sentence works well.`,
      });
    }
    // Four digits would defeat the entire point of a second gate.
    if (/^\d+$/.test(passphrase.trim())) {
      return reply
        .code(400)
        .send({ error: 'Use words as well as numbers. All digits is too easy to guess.' });
    }

    await db.insert(moneyAccess).values({
      personId: person.id,
      passphraseHash: await hashCode(passphrase),
    });
    return { ok: true };
  });

  /** Answers the passphrase and opens a short money session. */
  app.post<{ Body: PassphraseBody }>('/api/money/unlock', async (request, reply) => {
    const person = await adultFrom(request, reply);
    if (!person) return;

    const rows = await db
      .select()
      .from(moneyAccess)
      .where(eq(moneyAccess.personId, person.id))
      .limit(1);
    const access = rows[0];
    if (!access) {
      return reply
        .code(409)
        .send({ error: 'No money passphrase is set yet.', code: 'set_passphrase_first' });
    }

    const now = new Date();
    if (access.lockedUntil && access.lockedUntil > now) {
      return reply.code(401).send({
        error: 'Too many wrong tries. Wait a bit and try again.',
        locked_for_seconds: Math.ceil((access.lockedUntil.getTime() - now.getTime()) / 1000),
      });
    }

    const passphrase = typeof request.body?.passphrase === 'string' ? request.body.passphrase : '';
    const correct = await verifyCode(passphrase, access.passphraseHash);
    // On the right answer as well as the wrong one, for the same reason the
    // four-digit gate does it: a delay only on failure times the difference.
    await pause(Math.min(150 * (access.failedAttempts + 1), 2000));

    if (!correct) {
      // Incremented in SQL, not read-modify-write. A hundred parallel guesses
      // must produce a hundred increments or the lockout never escalates.
      const bumped = await db
        .update(moneyAccess)
        .set({ failedAttempts: sql`${moneyAccess.failedAttempts} + 1` })
        .where(eq(moneyAccess.personId, person.id))
        .returning({ failedAttempts: moneyAccess.failedAttempts });
      const failed = bumped[0]?.failedAttempts ?? access.failedAttempts + 1;
      if (failed % ATTEMPTS_BEFORE_LOCK === 0) {
        await db
          .update(moneyAccess)
          .set({ lockedUntil: new Date(now.getTime() + 15 * 60_000) })
          .where(eq(moneyAccess.personId, person.id));
      }
      return reply.code(401).send({ error: 'That passphrase is not right.' });
    }

    await db
      .update(moneyAccess)
      .set({ failedAttempts: 0, lockedUntil: null })
      .where(eq(moneyAccess.personId, person.id));

    const token = newSessionToken();
    const expiresAt = new Date(now.getTime() + MONEY_SESSION_MINUTES * 60_000);
    await db.insert(moneySessions).values({
      personId: person.id,
      tokenHash: await hashSessionToken(token),
      expiresAt,
    });
    await db.delete(moneySessions).where(lt(moneySessions.expiresAt, now));

    return { ok: true, money_session: token, expires_at: expiresAt.toISOString() };
  });

  app.post('/api/money/lock', async (request) => {
    const token = bearer(request);
    if (token) {
      await db.delete(moneySessions).where(eq(moneySessions.tokenHash, await hashSessionToken(token)));
    }
    return { ok: true };
  });

  /** The household money picture. Both gates passed. */
  app.get('/api/money', async (request, reply) => {
    const person = await moneyUnlocked(request, reply);
    if (!person) return;
    return moneyView();
  });

  interface CapBody {
    category?: unknown;
    monthly_cap?: unknown;
  }

  /** Sets or clears what a category should cost in a month. */
  app.put<{ Body: CapBody }>('/api/money/caps', async (request, reply) => {
    const person = await moneyUnlocked(request, reply);
    if (!person) return;

    const category = typeof request.body?.category === 'string' ? request.body.category.trim() : '';
    if (category === '') return reply.code(400).send({ error: 'Which category?' });

    const raw = request.body?.monthly_cap;
    if (raw === null || raw === '') {
      await db.delete(spendingCaps).where(eq(spendingCaps.category, category));
      return { ok: true, cleared: true };
    }
    const cap = Number(raw);
    if (!Number.isFinite(cap) || cap < 0) {
      return reply.code(400).send({ error: 'A cap is a number of dollars, or nothing at all.' });
    }

    const existing = await db
      .select({ id: spendingCaps.id })
      .from(spendingCaps)
      .where(eq(spendingCaps.category, category))
      .limit(1);
    if (existing[0]) {
      await db
        .update(spendingCaps)
        .set({ monthlyCap: cap.toFixed(2), updatedAt: new Date() })
        .where(eq(spendingCaps.id, existing[0].id));
    } else {
      await db.insert(spendingCaps).values({ category, monthlyCap: cap.toFixed(2) });
    }
    return { ok: true };
  });

  interface TargetBody {
    target_amount?: unknown;
    baseline_amount?: unknown;
  }

  /** The quarterly cut they are aiming for. */
  app.put<{ Body: TargetBody }>('/api/money/target', async (request, reply) => {
    const person = await moneyUnlocked(request, reply);
    if (!person) return;

    const amount = Number(request.body?.target_amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return reply.code(400).send({ error: 'A target is a number of dollars.' });
    }
    const baselineRaw = request.body?.baseline_amount;
    const baseline = baselineRaw === undefined || baselineRaw === null || baselineRaw === ''
      ? null
      : Number(baselineRaw);
    if (baseline !== null && (!Number.isFinite(baseline) || baseline < 0)) {
      return reply.code(400).send({ error: 'A baseline is a number of dollars, or nothing.' });
    }

    const quarter = quarterOf(currentCycleLabel());
    const existing = await db
      .select({ id: savingsTargets.id })
      .from(savingsTargets)
      .where(eq(savingsTargets.quarterLabel, quarter))
      .limit(1);
    if (existing[0]) {
      await db
        .update(savingsTargets)
        .set({
          targetAmount: amount.toFixed(2),
          baselineAmount: baseline === null ? null : baseline.toFixed(2),
        })
        .where(eq(savingsTargets.id, existing[0].id));
    } else {
      await db.insert(savingsTargets).values({
        quarterLabel: quarter,
        targetAmount: amount.toFixed(2),
        baselineAmount: baseline === null ? null : baseline.toFixed(2),
      });
    }
    return { ok: true, quarter_label: quarter };
  });

  interface RuleBody {
    match_text?: unknown;
    category?: unknown;
  }

  /**
   * A household rule for a transaction SimpleFIN did not categorise.
   *
   * Applies GOING FORWARD only. A rule that rewrote history would silently
   * change a number somebody has already looked at and made a decision about.
   */
  app.post<{ Body: RuleBody }>('/api/money/rules', async (request, reply) => {
    const person = await moneyUnlocked(request, reply);
    if (!person) return;

    const matchText = typeof request.body?.match_text === 'string' ? request.body.match_text.trim() : '';
    const category = typeof request.body?.category === 'string' ? request.body.category.trim() : '';
    if (matchText === '' || category === '') {
      return reply.code(400).send({ error: 'A rule needs something to match and a category.' });
    }
    await db.insert(categoryRules).values({ matchText, category });
    return { ok: true };
  });

  /**
   * Pulls the feed now.
   *
   * The scheduled pull is what keeps the figures current; this is here so an
   * adult who has just set a rule or connected the bank does not have to wait
   * for the next one. It answers with the view either way, including when the
   * pull failed, so the screen can say plainly that it did.
   */
  app.post('/api/money/refresh', async (request, reply) => {
    const person = await moneyUnlocked(request, reply);
    if (!person) return;
    const outcome = await syncBank();
    return { ok: outcome.ok, error: outcome.error ?? null, view: await moneyView() };
  });
}

/** Whether this person should be shown a money area at all. */
export async function moneyAreaAppliesTo(person: Person): Promise<boolean> {
  return person.templateType === 'adult';
}

export { MONEY_SESSION_MINUTES, MIN_PASSPHRASE };
