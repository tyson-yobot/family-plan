import { redactSecrets } from './redact.js';

/**
 * The bank feed, through SimpleFIN Bridge.
 *
 * SimpleFIN is READ-ONLY by design: the protocol has no concept of moving
 * money, and this file has no code that could. Nothing in this app initiates a
 * payment, now or ever. That is a property of the protocol and of this file
 * together, and both halves are worth keeping.
 *
 * THE ACCESS URL IS A SECRET AND IS TREATED LIKE A DATABASE PASSWORD.
 * It carries a username and password in front of the host, so the whole string
 * is a credential. The rules, all enforced below:
 *
 *   - It lives in SIMPLEFIN_ACCESS_URL and nowhere else. Never in the repo.
 *   - It is never returned from any function here.
 *   - It is never put into an error. Everything thrown out of this file goes
 *     through `redactSecrets` first, because every HTTP client quotes the URL
 *     it was handed when a request fails, and that is the way this leaks.
 *   - It never reaches a client payload. Nothing in the money routes returns
 *     anything derived from it except totals.
 */

/** Checked by NAME. The value is never read into a log, a reply or a return. */
export function simplefinConfigured(): boolean {
  const url = process.env.SIMPLEFIN_ACCESS_URL;
  return typeof url === 'string' && url.trim() !== '';
}

export interface SimplefinTransaction {
  id: string;
  /** Unix seconds. */
  posted: number;
  /** Negative for money out, in dollars, as SimpleFIN reports it. */
  amount: number;
  description: string;
  /** SimpleFIN supplies this only sometimes, which is why household rules exist. */
  category: string | null;
}

export interface SimplefinAccount {
  id: string;
  name: string;
  transactions: SimplefinTransaction[];
}

export interface SimplefinPull {
  accounts: SimplefinAccount[];
}

/**
 * Pulls accounts and transactions for a window.
 *
 * Throws a scrubbed error on any failure. Callers treat a throw as "the feed is
 * down", record it, and leave the last good figures in place with their date
 * shown, rather than blanking the screen.
 */
export async function pullSince(startUnix: number): Promise<SimplefinPull> {
  const access = process.env.SIMPLEFIN_ACCESS_URL;
  if (!access || access.trim() === '') {
    throw new Error('The bank feed is not connected.');
  }

  let response: Response;
  try {
    const base = access.trim().replace(/\/$/, '');
    const url = `${base}/accounts?start-date=${startUnix}`;
    response = await fetch(url, {
      // A feed that hangs must not hold a request open behind it.
      signal: AbortSignal.timeout(30_000),
      headers: { accept: 'application/json' },
    });
  } catch (error) {
    /*
     * This is the leak this whole file is careful about. `fetch` puts the URL
     * it was given into the message of almost every network failure, and the
     * URL is the credential. Scrubbing here means nothing above this line ever
     * sees it, whatever that caller then does with the error.
     */
    throw new Error(redactSecrets(error instanceof Error ? error.message : 'The bank feed did not answer.'));
  }

  if (!response.ok) {
    // Deliberately not the body: an error body from an upstream service can
    // quote the request URL back.
    throw new Error(`The bank feed answered ${response.status}.`);
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new Error('The bank feed sent something unreadable.');
  }

  const accounts: SimplefinAccount[] = [];
  const raw = (json as { accounts?: unknown }).accounts;
  if (!Array.isArray(raw)) return { accounts };

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const account = entry as Record<string, unknown>;
    const transactions: SimplefinTransaction[] = [];
    const rawTransactions = Array.isArray(account.transactions) ? account.transactions : [];
    for (const item of rawTransactions) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const amount = Number(row.amount);
      if (!Number.isFinite(amount)) continue;
      transactions.push({
        id: String(row.id ?? ''),
        posted: Number(row.posted ?? 0),
        amount,
        description: typeof row.description === 'string' ? row.description : '',
        // SimpleFIN does not always supply one. Null here is honest; the
        // household rules and the "Uncategorised" bucket handle it downstream.
        category:
          typeof row.category === 'string' && row.category.trim() !== ''
            ? row.category.trim()
            : null,
      });
    }
    accounts.push({
      id: String(account.id ?? ''),
      name: typeof account.name === 'string' ? account.name : 'Account',
      transactions,
    });
  }

  return { accounts };
}
