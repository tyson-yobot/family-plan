import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  bankSync,
  categoryRules,
  savingsTargets,
  spendingByCategory,
  spendingCaps,
} from '../db/schema.js';
import { currentCycleLabel, previousCycleLabel } from './cycle.js';
import { pullSince, simplefinConfigured } from './simplefin.js';
import { redactSecrets } from './redact.js';

/**
 * The household money picture.
 *
 * ADULTS ONLY, and that is enforced in the routes rather than here: there is no
 * money route a child's session can reach, and the money area does not exist on
 * a child's side of the app at all, not hidden and not empty.
 *
 * Everything here is about SUMMARIES. Individual transactions are pulled from
 * the bank, totalled, and discarded. See the comment on spendingByCategory in
 * the schema for why that trade was made.
 */

/** The bucket for anything neither SimpleFIN nor a household rule named. */
export const UNCATEGORISED = 'Uncategorised';

const SYNC_LABEL = 'simplefin';

/** "2026-Q3" for a YYYY-MM label. */
export function quarterOf(cycleLabel: string): string {
  const [year, month] = cycleLabel.split('-').map(Number);
  return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
}

/** The three months of a quarter label, oldest first. */
export function monthsInQuarter(quarterLabel: string): string[] {
  const [year, q] = quarterLabel.split('-Q').map(Number);
  const firstMonth = (q - 1) * 3 + 1;
  return [0, 1, 2].map((i) => `${year}-${String(firstMonth + i).padStart(2, '0')}`);
}

/**
 * Which category a transaction belongs to.
 *
 * SimpleFIN's own category wins where it supplied one. Where it did not, the
 * household's rules are tried in the order they were made, matching on the
 * description. Anything still unnamed is Uncategorised, which is shown as
 * itself rather than hidden: a large unnamed pile is exactly the thing the
 * adults need to see so they can write a rule for it.
 *
 * A NOTE ON "GOING FORWARD", BECAUSE THIS FILE USED TO CLAIM THE OPPOSITE.
 * A new rule is applied to every transaction in the pulled window, so it does
 * change the last three months, not just the future. Two comments here and in
 * the schema said the reverse, and they were simply wrong about the code.
 *
 * Re-categorising the window is the RIGHT behaviour and the comments were the
 * defect: somebody who writes "KROGER is Groceries" while looking at a pile of
 * uncategorised spending means this month's pile, and a rule that only touched
 * future months would leave the number they were looking at untouched and look
 * broken. What must not happen alongside it is the money being counted twice,
 * which is what `syncBank` now replaces whole months to prevent.
 */
export function categorise(
  description: string,
  supplied: string | null,
  rules: { matchText: string; category: string }[],
): string {
  if (supplied && supplied.trim() !== '') return supplied.trim();
  const haystack = description.toLowerCase();
  for (const rule of rules) {
    if (rule.matchText.trim() === '') continue;
    if (haystack.includes(rule.matchText.toLowerCase())) return rule.category;
  }
  return UNCATEGORISED;
}

/**
 * Pulls the feed and rewrites the month totals it covers.
 *
 * Runs on a schedule rather than on a page load, so opening the money screen
 * never waits on a third party and a hundred refreshes are a hundred database
 * reads rather than a hundred bank pulls.
 *
 * Never throws. A failure is recorded against bank_sync with a scrubbed reason
 * and the previous totals are left exactly as they were, so the screen shows
 * the last good figures with their age on them rather than blanking.
 */
export async function syncBank(now: Date = new Date()): Promise<{ ok: boolean; error?: string }> {
  await ensureSyncRow();
  await db
    .update(bankSync)
    .set({ lastAttemptAt: now })
    .where(eq(bankSync.label, SYNC_LABEL));

  if (!simplefinConfigured()) {
    const message = 'The bank feed is not connected yet.';
    await db.update(bankSync).set({ lastError: message }).where(eq(bankSync.label, SYNC_LABEL));
    return { ok: false, error: message };
  }

  try {
    /*
     * Roughly ninety days, but snapped back to the FIRST DAY OF THAT MONTH.
     *
     * Not more than that: the retention decision in the schema says only
     * summaries are kept, and pulling a year every time to throw it away would
     * be a lot of somebody's financial history crossing the wire for no screen
     * that shows it.
     *
     * The snapping matters and its absence was a real bug. A plain
     * now-minus-90-days lands part way through the month three months back, so
     * that month's rows were rewritten from a partial window: on 15 September
     * the window began on 17 June, and June's totals, which had been complete
     * and correct, were overwritten with just 17-30 June. The figure then
     * shrank a little more every day. Whole months only, so a month is either
     * rewritten from all of its transactions or left alone.
     */
    const rough = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const oldestMonth = currentCycleLabel(rough);
    const [oy, om] = oldestMonth.split('-').map(Number);
    const windowStart = new Date(Date.UTC(oy, om - 1, 1));
    const since = Math.floor(windowStart.getTime() / 1000);
    const pull = await pullSince(since);

    const rules = await db
      .select({ matchText: categoryRules.matchText, category: categoryRules.category })
      .from(categoryRules)
      .orderBy(asc(categoryRules.createdAt));

    // month -> category -> {spent, count}
    const totals = new Map<string, Map<string, { spent: number; count: number }>>();
    for (const account of pull.accounts) {
      for (const transaction of account.transactions) {
        // Money OUT only. A negative amount is a debit in SimpleFIN; income and
        // transfers in are not spending and would net the categories against
        // each other into a meaningless number.
        if (!(transaction.amount < 0)) continue;
        const when = new Date(transaction.posted * 1000);
        const cycle = currentCycleLabel(when);
        const category = categorise(transaction.description, transaction.category, rules);
        const byCategory = totals.get(cycle) ?? new Map();
        const at = byCategory.get(category) ?? { spent: 0, count: 0 };
        at.spent += Math.abs(transaction.amount);
        at.count += 1;
        byCategory.set(category, at);
        totals.set(cycle, byCategory);
      }
    }

    /*
     * Every month in the window is REPLACED, not merged into.
     *
     * This was the worst bug in the money work and it would have shown a number
     * roughly double the truth the first time anybody used the category-rule
     * feature it ships with. The first version updated a row if it existed and
     * inserted otherwise, and never deleted a row that stopped receiving
     * transactions. So the screen showing "Uncategorised $842" plus a new rule
     * sending those payments to Groceries produced "Uncategorised $842" AND
     * "Groceries $842": the same money twice, a doubled monthly total, an
     * inflated quarter and a wrong saved-so-far against the baseline.
     *
     * The same thing happened with no rule at all, whenever SimpleFIN enriched
     * a pending transaction's category between two pulls, or a pending
     * transaction was cancelled.
     *
     * Replacing the whole month is the only version that is correct under
     * re-categorisation, and it is safe because every month in the window is
     * pulled in full (see the snapping above). One transaction per month so
     * that a failure cannot leave a month half-deleted and reading as zero.
     */
    const monthsPulled = [...totals.keys()];
    for (const cycle of monthsPulled) {
      const byCategory = totals.get(cycle);
      if (!byCategory) continue;
      await db.transaction(async (tx) => {
        await tx.delete(spendingByCategory).where(eq(spendingByCategory.cycleLabel, cycle));
        for (const [category, at] of byCategory) {
          await tx.insert(spendingByCategory).values({
            cycleLabel: cycle,
            category,
            spent: at.spent.toFixed(2),
            transactionCount: at.count,
            updatedAt: now,
          });
        }
      });
    }

    await db
      .update(bankSync)
      .set({ lastSuccessAt: now, lastError: null, accountCount: pull.accounts.length })
      .where(eq(bankSync.label, SYNC_LABEL));
    return { ok: true };
  } catch (error) {
    // Scrubbed again here even though simplefin.ts already scrubbed: this is
    // the value that gets WRITTEN TO THE DATABASE and then shown on a screen,
    // and a second pass costs nothing.
    const message = redactSecrets(
      error instanceof Error ? error.message : 'The bank feed did not answer.',
    );
    await db.update(bankSync).set({ lastError: message }).where(eq(bankSync.label, SYNC_LABEL));
    return { ok: false, error: message };
  }
}

async function ensureSyncRow(): Promise<void> {
  const rows = await db.select().from(bankSync).where(eq(bankSync.label, SYNC_LABEL)).limit(1);
  if (!rows[0]) await db.insert(bankSync).values({ label: SYNC_LABEL });
}

export interface CategoryLine {
  category: string;
  spent: number;
  cap: number | null;
  transaction_count: number;
  /** Dollars over the cap, or null where there is no cap or it is not over. */
  over_by: number | null;
  /** Months in a row this category has finished over its cap, this one included. */
  months_over: number;
}

export interface MoneyView {
  cycle_label: string;
  categories: CategoryLine[];
  total_spent: number;
  /** The one costing them most against its cap, or null if nothing is over. */
  worst: { category: string; over_by: number; months_over: number } | null;
  quarter: {
    label: string;
    target: number | null;
    baseline: number | null;
    spent_so_far: number;
    /** Dollars saved against the baseline so far, which can be negative. */
    saved_so_far: number | null;
  };
  freshness: {
    connected: boolean;
    last_success_at: string | null;
    last_attempt_at: string | null;
    /** Whole hours since the last good pull, or null if there has never been one. */
    hours_old: number | null;
    stale: boolean;
    error: string | null;
  };
}

/**
 * How many months in a row, ending at `cycle`, this category finished over its
 * cap. Counts backwards and stops at the first month that was not over.
 *
 * A month with no row at all stops the run rather than being treated as zero:
 * no data is not the same as no spending, and a gap in the feed must not be
 * allowed to quietly reset a streak the adults are relying on.
 */
async function monthsOverFor(category: string, cap: number, cycle: string): Promise<number> {
  let months = 0;
  let cursor = cycle;
  for (let i = 0; i < 24; i += 1) {
    const rows = await db
      .select({ spent: spendingByCategory.spent })
      .from(spendingByCategory)
      .where(
        and(
          eq(spendingByCategory.cycleLabel, cursor),
          eq(spendingByCategory.category, category),
        ),
      )
      .limit(1);
    if (!rows[0]) break;
    if (Number(rows[0].spent) <= cap) break;
    months += 1;
    cursor = previousCycleLabel(cursor);
  }
  return months;
}

/** Everything the money screen shows, for the household. */
export async function moneyView(now: Date = new Date()): Promise<MoneyView> {
  const cycle = currentCycleLabel(now);

  const rows = await db
    .select()
    .from(spendingByCategory)
    .where(eq(spendingByCategory.cycleLabel, cycle))
    .orderBy(desc(spendingByCategory.spent));
  const caps = await db.select().from(spendingCaps);
  const capFor = new Map(caps.map((cap) => [cap.category, Number(cap.monthlyCap)]));

  const categories: CategoryLine[] = [];
  for (const row of rows) {
    const spent = Number(row.spent);
    const cap = capFor.has(row.category) ? (capFor.get(row.category) as number) : null;
    const overBy = cap !== null && spent > cap ? Number((spent - cap).toFixed(2)) : null;
    categories.push({
      category: row.category,
      spent,
      cap,
      transaction_count: row.transactionCount,
      over_by: overBy,
      months_over: overBy !== null && cap !== null ? await monthsOverFor(row.category, cap, cycle) : 0,
    });
  }

  /*
   * The single category costing them the most against its cap.
   *
   * Ranked by how far OVER it is, not by how much it cost. A category with a
   * large cap that is slightly over is not the problem; the one that is
   * hundreds past what they decided is, whatever its absolute size.
   */
  const over = categories.filter((line) => line.over_by !== null);
  over.sort((a, b) => (b.over_by as number) - (a.over_by as number));
  const worst = over[0]
    ? {
        category: over[0].category,
        over_by: over[0].over_by as number,
        months_over: over[0].months_over,
      }
    : null;

  const quarterLabel = quarterOf(cycle);
  const targetRows = await db
    .select()
    .from(savingsTargets)
    .where(eq(savingsTargets.quarterLabel, quarterLabel))
    .limit(1);
  const target = targetRows[0] ?? null;

  const quarterMonths = monthsInQuarter(quarterLabel);
  const quarterRows = await db.select().from(spendingByCategory);
  const spentSoFar = quarterRows
    .filter((row) => quarterMonths.includes(row.cycleLabel))
    .reduce((sum, row) => sum + Number(row.spent), 0);

  const syncRows = await db.select().from(bankSync).where(eq(bankSync.label, SYNC_LABEL)).limit(1);
  const sync = syncRows[0] ?? null;
  const hoursOld = sync?.lastSuccessAt
    ? Math.floor((now.getTime() - sync.lastSuccessAt.getTime()) / (60 * 60 * 1000))
    : null;

  return {
    cycle_label: cycle,
    categories,
    total_spent: Number(categories.reduce((sum, line) => sum + line.spent, 0).toFixed(2)),
    worst,
    quarter: {
      label: quarterLabel,
      target: target ? Number(target.targetAmount) : null,
      baseline: target?.baselineAmount ? Number(target.baselineAmount) : null,
      spent_so_far: Number(spentSoFar.toFixed(2)),
      saved_so_far: target?.baselineAmount
        ? Number((Number(target.baselineAmount) - spentSoFar).toFixed(2))
        : null,
    },
    freshness: {
      connected: simplefinConfigured(),
      last_success_at: sync?.lastSuccessAt ? sync.lastSuccessAt.toISOString() : null,
      last_attempt_at: sync?.lastAttemptAt ? sync.lastAttemptAt.toISOString() : null,
      hours_old: hoursOld,
      /*
       * Older than a day and a half. The feed is pulled several times a day, so
       * anything this old means several pulls in a row have failed, which is
       * worth saying out loud rather than showing a number as though it were
       * this morning's.
       */
      stale: hoursOld === null || hoursOld > 36,
      error: sync?.lastError ?? null,
    },
  };
}
