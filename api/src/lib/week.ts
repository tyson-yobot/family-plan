import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { goals, habitLogs, type Goal } from '../db/schema.js';
import { todayLabel } from './cycle.js';

/**
 * The weekly drumbeat.
 *
 * A month is too slow a heartbeat to hit a goal: by the time a monthly check-in
 * says something has not moved, four weeks are gone. This layer is the thirty
 * seconds a day version, and everything in it is PRIVATE to the person it
 * belongs to. What the household sees is unchanged from Mission 1: the goal,
 * its progress, hit or missed. Which days somebody ticked is not in that list
 * and must never be added to it.
 */

/** Monday first, because a week of habits reads as a working week here. */
export const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** A plain YYYY-MM-DD shifted by whole days, with no timezone arithmetic. */
export function shiftDay(day: string, by: number): string {
  const [year, month, date] = day.split('-').map(Number);
  const moved = new Date(Date.UTC(year, month - 1, date + by));
  return moved.toISOString().slice(0, 10);
}

/**
 * The Monday of the week a given day falls in.
 *
 * Built on UTC arithmetic over a date that is ALREADY the family's own calendar
 * day, rather than on the server's clock. Doing it the other way round is the
 * bug cycle.ts exists to document: a UTC server is a day ahead of this house
 * for the last few hours of every day, so "this week" would change at six in
 * the evening on a Sunday.
 */
export function mondayOf(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  const at = new Date(Date.UTC(year, month - 1, date));
  // getUTCDay: 0 is Sunday. Monday-first means Sunday is six days into the week.
  const offset = (at.getUTCDay() + 6) % 7;
  return shiftDay(day, -offset);
}

/** The seven days of the week containing `day`, Monday first, as YYYY-MM-DD. */
export function weekOf(day: string): string[] {
  const monday = mondayOf(day);
  return [0, 1, 2, 3, 4, 5, 6].map((i) => shiftDay(monday, i));
}

export interface HabitWeek {
  goal_id: string;
  title: string;
  weekly_habit: string;
  weekly_target_count: number | null;
  /** The seven days of this week, each with whether it is ticked. */
  days: { date: string; label: string; done: boolean; is_today: boolean; is_future: boolean }[];
  done_this_week: number;
  /** Consecutive earlier weeks that met the target, not counting this one. */
  streak_weeks: number;
  /**
   * Days since anything was ticked, or since the goal was made if nothing ever
   * has been.
   */
  days_since_last: number | null;
  /** A quiet nudge, or null. Never a warning, and never a colour. */
  nudge: string | null;
}

/**
 * Whether a week counts towards a streak.
 *
 * A goal with no target counts any week with at least one tick, because
 * somebody who wrote a habit without a number still means "regularly".
 */
function weekMet(ticks: number, target: number | null): boolean {
  if (target && target > 0) return ticks >= target;
  return ticks > 0;
}

/**
 * The gentlest true thing that can be said about a goal nobody has touched.
 *
 * The wording here is the whole point and was the hardest part of this file.
 * Three of the five people are children, and a nudge that reads as a telling-off
 * on a child's screen is worse than no nudge at all: it teaches them to avoid
 * the app, which costs more than the goal. So there is no "you have not", no
 * count of missed days, no streak-broken language, and nothing red anywhere
 * near it. It names the goal and offers a way back in.
 *
 * Nothing is said at all until a fortnight has passed. A week of quiet is a
 * normal week.
 */
function nudgeFor(daysSince: number | null, title: string): string | null {
  if (daysSince === null || daysSince < 14) return null;
  if (daysSince < 30) return `Still want this one? ${title} is here whenever you are ready.`;
  return `${title} has been waiting a while. Keep it, or let it go, either is fine.`;
}

/**
 * Every goal with a weekly habit on it, for one person, for the week containing
 * today. Scoped by person id like everything else in this codebase.
 */
export async function weekFor(personId: string, now: Date = new Date()): Promise<HabitWeek[]> {
  const today = todayLabel(now);
  const days = weekOf(today);

  const withHabits = (
    await db
      .select()
      .from(goals)
      .where(and(eq(goals.personId, personId), eq(goals.status, 'open')))
  ).filter((goal) => goal.weeklyHabit && goal.weeklyHabit.trim() !== '');

  if (withHabits.length === 0) return [];

  const logs = await db
    .select({ goalId: habitLogs.goalId, logDate: habitLogs.logDate })
    .from(habitLogs)
    .where(
      and(
        eq(habitLogs.personId, personId),
        inArray(
          habitLogs.goalId,
          withHabits.map((goal) => goal.id),
        ),
      ),
    );

  const byGoal = new Map<string, Set<string>>();
  for (const log of logs) {
    const set = byGoal.get(log.goalId) ?? new Set<string>();
    set.add(log.logDate);
    byGoal.set(log.goalId, set);
  }

  return withHabits.map((goal) => {
    const ticked = byGoal.get(goal.id) ?? new Set<string>();
    const target = goal.weeklyTargetCount;

    const doneThisWeek = days.filter((day) => ticked.has(day)).length;

    /*
     * Walk backwards a week at a time while each one met the target. Capped, so
     * a goal made years ago cannot turn this into an unbounded loop; a hundred
     * weeks is two years, which is longer than any streak this app will show.
     */
    let streak = 0;
    let cursor = shiftDay(mondayOf(today), -7);
    for (let i = 0; i < 100; i += 1) {
      const earlier = weekOf(cursor);
      const ticks = earlier.filter((day) => ticked.has(day)).length;
      if (!weekMet(ticks, target)) break;
      streak += 1;
      cursor = shiftDay(cursor, -7);
    }

    const allTicks = [...ticked].sort();
    const last = allTicks[allTicks.length - 1] ?? null;
    const from = last ?? goal.createdAt.toISOString().slice(0, 10);
    const [ay, am, ad] = from.split('-').map(Number);
    const [by, bm, bd] = today.split('-').map(Number);
    const daysSince = Math.max(
      0,
      Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / (24 * 60 * 60 * 1000)),
    );

    return {
      goal_id: goal.id,
      title: goal.title,
      weekly_habit: (goal.weeklyHabit ?? '').trim(),
      weekly_target_count: target,
      days: days.map((date, i) => ({
        date,
        label: WEEK_DAYS[i],
        done: ticked.has(date),
        is_today: date === today,
        is_future: date > today,
      })),
      done_this_week: doneThisWeek,
      streak_weeks: streak,
      days_since_last: daysSince,
      nudge: nudgeFor(daysSince, goal.title),
    };
  });
}

/**
 * Ticks or unticks one day of one habit.
 *
 * Refuses a day in the future, because a habit is a record of what was done and
 * letting somebody tick Friday on Tuesday turns the row into a plan. Refuses a
 * day outside the last five weeks for the same reason in reverse: catching up
 * yesterday is honest, filling in a month is not.
 */
export async function toggleHabitDay(
  personId: string,
  goal: Goal,
  day: string,
  now: Date = new Date(),
): Promise<{ ok: true; done: boolean } | { ok: false; error: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { ok: false, error: 'That is not a day.' };
  const today = todayLabel(now);
  if (day > today) return { ok: false, error: 'That day has not happened yet.' };
  if (day < shiftDay(today, -35)) return { ok: false, error: 'That is too far back to fill in.' };

  const existing = await db
    .select({ id: habitLogs.id })
    .from(habitLogs)
    .where(and(eq(habitLogs.goalId, goal.id), eq(habitLogs.logDate, day)))
    .limit(1);

  if (existing[0]) {
    await db.delete(habitLogs).where(eq(habitLogs.id, existing[0].id));
    return { ok: true, done: false };
  }
  await db.insert(habitLogs).values({ goalId: goal.id, personId, logDate: day });
  return { ok: true, done: true };
}
