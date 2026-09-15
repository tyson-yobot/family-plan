import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

/**
 * A person's own four-digit code: how it is stored, how it is checked, and
 * which codes are refused at the point of setting one.
 *
 * Nothing in this file ever puts a code into a return value, an error message
 * or a log line. The only things that leave it are a stored hash, a yes or no,
 * and a reason for a refusal that describes the shape of the code rather than
 * repeating it.
 */

/**
 * promisify loses scrypt's four-argument overload, the one that carries the
 * cost parameters, so the signature is named here. Without it this silently
 * falls back to the three-argument form and the cost factors below are ignored,
 * which is a weaker hash under code that reads as though it set one.
 */
const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>;

/**
 * scrypt, with the parameters Node documents as a sensible interactive default.
 *
 * Four digits is ten thousand possibilities, so the hash on its own is not what
 * makes this hard to break: somebody holding the table can try all ten thousand
 * whatever the cost factor is. What the hash buys is that a copy of the
 * database does not hand anybody a code they can walk up to a phone and type,
 * and a slow hash means the ten thousand take real time rather than a second.
 * The lockout in the sign-in route is what defends the live door.
 */
const COST = 16384;
const BLOCK_SIZE = 8;
const PARALLELISATION = 1;
const KEY_LENGTH = 32;
const SALT_BYTES = 16;

/** scrypt$N$r$p$salt$key, all base64url. Self-describing, so the cost can change later. */
export async function hashCode(code: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await scryptAsync(code, salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELISATION,
  });
  return [
    'scrypt',
    COST,
    BLOCK_SIZE,
    PARALLELISATION,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$');
}

/**
 * Compares in constant time. A plain string comparison leaks how much of the
 * code was right through how long it took, which on four digits is a real way
 * in rather than a theoretical one.
 */
export async function verifyCode(code: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, salt, key] = parts;
  const expected = Buffer.from(key, 'base64url');
  let got: Buffer;
  try {
    got = await scryptAsync(code, Buffer.from(salt, 'base64url'), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
  } catch {
    return false;
  }
  if (got.length !== expected.length) return false;
  return timingSafeEqual(got, expected);
}

/** A session token, and the way it is looked up. The raw value is never stored. */
export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export async function hashSessionToken(token: string): Promise<string> {
  // A session token is 32 random bytes, so there is nothing to guess and no
  // reason for a slow hash. This only has to stop a copy of this table being
  // replayed as a live session. Async anyway, so that making it slower later is
  // a change in one function rather than at every call site.
  return createHash('sha256').update(token).digest('base64url');
}

/**
 * Codes that are refused at the point of somebody choosing one.
 *
 * The message that goes with each is written to be readable by an eleven year
 * old and never repeats the code back. Refusing is the whole of it: there is no
 * scoring, no "weak but allowed", because on four digits there is no useful
 * middle ground and a warning somebody can tap past is not a rule.
 */
export interface CodeRefusal {
  reason: string;
}

/** Four digits that are all the same: 0000, 1111, and so on. */
function allSame(code: string): boolean {
  return new Set(code).size === 1;
}

/** A run up or down by one: 1234, 4321, 0123, 9876. */
function isRun(code: string): boolean {
  const digits = [...code].map(Number);
  const up = digits.every((digit, i) => i === 0 || digit === digits[i - 1] + 1);
  const down = digits.every((digit, i) => i === 0 || digit === digits[i - 1] - 1);
  return up || down;
}

/** A repeated pair: 1212, 5656. Common enough to be worth naming. */
function isRepeatedPair(code: string): boolean {
  return code[0] === code[2] && code[1] === code[3];
}

/**
 * The handful of four-digit codes that turn up at the top of every list of the
 * most-used ones. Kept short on purpose: a long list starts refusing codes for
 * reasons nobody can see, and the three rules above already catch most of them.
 */
const WELL_KNOWN = new Set(['2580', '1004', '2000', '6969', '1122', '1313']);

/**
 * The four ways a date gets written as four digits. Only used when a birthday
 * is actually on the person's row, which is nobody's today.
 */
function birthdayForms(birthday: string): string[] {
  // Stored as YYYY-MM-DD.
  const match = birthday.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return [];
  const [, year, month, day] = match;
  return [`${month}${day}`, `${day}${month}`, `${year.slice(2)}${month}`, `${month}${year.slice(2)}`];
}

export function refuseCode(code: string, birthday: string | null): CodeRefusal | null {
  if (!/^\d{4}$/.test(code)) {
    return { reason: 'A code is four numbers, nothing else.' };
  }
  if (allSame(code)) {
    return { reason: 'That is the same number four times. Pick four that are not all the same.' };
  }
  if (isRun(code)) {
    return { reason: 'That is four numbers in a row. Pick some that are not in order.' };
  }
  if (isRepeatedPair(code)) {
    return { reason: 'That is the same two numbers twice. Mix them up a bit more.' };
  }
  if (WELL_KNOWN.has(code)) {
    return { reason: 'That is one of the most guessed codes there is. Pick another one.' };
  }
  if (birthday && birthdayForms(birthday).includes(code)) {
    return { reason: 'That is your birthday, which is the first thing anyone would try.' };
  }
  return null;
}
