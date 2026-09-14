/**
 * Phase 1a has no dashboard and no scheduler, so the cycle is computed rather
 * than clicked into existence: it is the current calendar month, server-side,
 * for every template type alike. Quarterly review timing is a later,
 * dashboard-driven concept and is deliberately not implemented here.
 *
 * The month is read in the family's own timezone, not the server's. Railway
 * runs in UTC, so a plain UTC month would roll over to the next month in the
 * early evening on the last day of the month, while everyone filling the
 * worksheet in is still in the old one.
 */
export const FAMILY_TIMEZONE = 'America/Chicago';

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: FAMILY_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
});

export function currentCycleLabel(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM, which is the label format we want.
  return formatter.format(now);
}
