/**
 * The month, and the two things the family board says about it.
 *
 * There is still no scheduler, so the cycle is computed rather than chosen: it
 * is the current calendar month, server-side, for every template type alike.
 *
 * The month is read in the family's own timezone, not the server's. Railway
 * runs in UTC, so a plain UTC month would roll over to the next month in the
 * early evening on the last day of the month, while everyone filling the
 * worksheet in is still in the old one.
 */
export const FAMILY_TIMEZONE = 'America/Chicago';

const monthFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: FAMILY_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
});

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: FAMILY_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function currentCycleLabel(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM, which is the label format we want.
  return monthFormatter.format(now);
}

/** Today in the family's own timezone, as YYYY-MM-DD. */
export function todayLabel(now: Date = new Date()): string {
  return dayFormatter.format(now);
}

/**
 * How many days of this month are left, counting today as one of them.
 *
 * Worked out from the family's own calendar date rather than from a UTC clock,
 * for the same reason the month is: on the evening of the thirtieth, a UTC
 * server has already rolled over and would say nought days left to somebody who
 * still has one.
 */
export function daysLeftInMonth(now: Date = new Date()): number {
  const today = todayLabel(now);
  const [year, month, day] = today.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return lastDay - day + 1;
}

/** The month before a given label. "2026-01" goes back to "2025-12". */
export function previousCycleLabel(cycleLabel: string): string {
  const [year, month] = cycleLabel.split('-').map(Number);
  if (!year || !month) return cycleLabel;
  const previousMonth = month === 1 ? 12 : month - 1;
  const previousYear = month === 1 ? year - 1 : year;
  return `${previousYear}-${String(previousMonth).padStart(2, '0')}`;
}
