/**
 * Turns 2026-09 into "September 2026", because nobody says "cycle label".
 *
 * It lives in its own file because four different screens now say a month out
 * loud: the family board, a person's space, their history, and the check-in
 * itself. Four copies of a date formatter is four chances for one of them to
 * name a different month than the others on the same day.
 */
export function monthName(cycleLabel: string): string {
  const [year, month] = cycleLabel.split('-').map(Number);
  if (!year || !month) return cycleLabel;
  // The date is built in UTC, so it has to be read back in UTC. Formatting it
  // in the phone's own timezone turns the first of the month into the last day
  // of the month before, anywhere west of Greenwich.
  const formatter = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return formatter.format(new Date(Date.UTC(year, month - 1, 1)));
}

/** Just the month, with no year, for a headline that already says which year it is. */
export function shortMonthName(cycleLabel: string): string {
  return monthName(cycleLabel).split(' ')[0];
}
