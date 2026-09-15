'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchWeek, NeedsCodeError, toggleHabit, type HabitWeek } from '@/lib/api';
import { Icon } from './icons';

/**
 * The week.
 *
 * A month is too slow a heartbeat to hit a goal, so this is the thirty seconds
 * a day version: the habits on your own goals, seven boxes each, and how many
 * weeks you have kept it going.
 *
 * PRIVATE TO ITS OWNER. Nothing on this screen reaches the family board. The
 * household sees a goal and whether it was hit; it does not see which days
 * anybody ticked, and there is no route that would let it.
 *
 * Two things are deliberately absent, and both are absent on purpose rather
 * than unbuilt. There is no percentage, and there is no comparison to anybody.
 * The moment a number like that exists somebody will read it as a mark, and
 * three of the five people here are children.
 */
export function WeekView({
  slug,
  onNeedsCode,
  onChanged,
}: {
  slug: string;
  onNeedsCode: () => void;
  onChanged: () => void;
}) {
  const [habits, setHabits] = useState<HabitWeek[] | null>(null);
  const [problem, setProblem] = useState('');
  /** Which day is mid-flight, so a double tap cannot fire twice. */
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await fetchWeek(slug);
      setHabits(result.habits);
    } catch (error) {
      if (error instanceof NeedsCodeError) {
        onNeedsCode();
        return;
      }
      setProblem(error instanceof Error ? error.message : 'That did not load.');
    }
  }, [slug, onNeedsCode]);

  useEffect(() => {
    void load();
  }, [load]);

  const tick = async (goalId: string, date: string) => {
    const key = `${goalId}:${date}`;
    if (busy) return;
    setBusy(key);
    setProblem('');
    try {
      const result = await toggleHabit(slug, goalId, date);
      setHabits(result.habits);
      // The board shows the same goals, and a tick is progress on one of them.
      onChanged();
    } catch (error) {
      if (error instanceof NeedsCodeError) {
        onNeedsCode();
        return;
      }
      setProblem(error instanceof Error ? error.message : 'That did not save.');
    } finally {
      setBusy(null);
    }
  };

  if (problem && !habits) {
    return <p className="mt-6 text-[14px] text-[var(--ink-soft)]">{problem}</p>;
  }

  if (!habits) {
    return <p className="mt-6 text-[15px] text-[var(--ink-soft)]">One moment.</p>;
  }

  if (habits.length === 0) {
    /*
     * The empty state teaches rather than apologises. Somebody arriving here
     * with no habits has not done anything wrong and does not need an error
     * face; they need to know what this screen is for and exactly how to get
     * one, which is a specific place on a specific other screen.
     */
    return (
      <div className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-4">
        <p className="text-[15px] font-bold">Nothing to tick yet</p>
        <p className="mt-2 text-[14px] leading-relaxed text-[var(--ink-soft)]">
          A goal is easier to hit when there is something small you do every week towards it,
          like three runs or reading four nights. Open a goal on the Goals tab and add a weekly
          habit to it, and it will show up here with seven boxes to tick.
        </p>
        <p className="mt-3 text-[13px] leading-relaxed text-[var(--ink-soft)]">
          Only you ever sees this. Nobody in the house can see which days you ticked.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      <p className="text-[13px] leading-relaxed text-[var(--ink-soft)]">
        Tap a day when you have done it. Only you can see this part.
      </p>

      {habits.map((habit) => (
        <HabitRow
          key={habit.goal_id}
          habit={habit}
          busy={busy}
          onTick={(date) => void tick(habit.goal_id, date)}
        />
      ))}

      {problem ? <p className="text-[13px] text-[var(--bad)]">{problem}</p> : null}
    </div>
  );
}

function HabitRow({
  habit,
  busy,
  onTick,
}: {
  habit: HabitWeek;
  busy: string | null;
  onTick: (date: string) => void;
}) {
  const target = habit.weekly_target_count;
  const met = target ? habit.done_this_week >= target : habit.done_this_week > 0;

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-4">
      <p className="text-[15px] font-bold leading-snug">{habit.weekly_habit}</p>
      <p className="mt-1 text-[12.5px] text-[var(--ink-soft)]">{habit.title}</p>

      {/*
        The strip reaches past the card's own padding, and the gap is tight.
        Seven days have to fit one phone row, and at the card's normal padding
        with a wider gap each box came out about 40 wide. Reclaiming the padding
        here is what gets them to a real 44, which is the size a finger needs.
        Measured at 390 wide rather than estimated.
      */}
      <div className="-mx-2 mt-3 flex justify-between gap-1">
        {habit.days.map((day) => {
          const key = `${habit.goal_id}:${day.date}`;
          return (
            <button
              key={day.date}
              type="button"
              disabled={day.is_future || busy === key}
              onClick={() => onTick(day.date)}
              /*
               * 44 by 44 is the accessible minimum for something a finger has to
               * hit, and these are the smallest targets in the app, so they are
               * built to it exactly rather than approximately. The label above
               * the box is inside the button so the whole column is tappable
               * rather than just the square.
               */
              className="flex min-h-[44px] flex-1 flex-col items-center justify-center gap-1 rounded-xl border transition-colors disabled:opacity-40"
              style={{
                borderColor: day.done ? 'var(--accent)' : 'var(--line)',
                background: day.done ? 'var(--accent)' : 'transparent',
                color: day.done ? 'var(--on-accent)' : 'var(--ink-soft)',
              }}
              aria-pressed={day.done}
              aria-label={`${day.label}${day.done ? ', done' : ', not done'}`}
            >
              <span className="text-[11px] font-semibold">{day.label}</span>
              {day.done ? <Icon name="check" size={14} /> : <span className="h-[14px]" />}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-3">
        <p className="text-[13px] text-[var(--ink-soft)]">
          {target
            ? `${habit.done_this_week} of ${target} this week`
            : `${habit.done_this_week} this week`}
        </p>
        {habit.streak_weeks > 0 ? (
          <p className="text-[13px] font-semibold" style={{ color: 'var(--accent-ink)' }}>
            {habit.streak_weeks} {habit.streak_weeks === 1 ? 'week' : 'weeks'} before this one
          </p>
        ) : null}
      </div>

      {met && target ? (
        <p className="mt-2 text-[13px]" style={{ color: 'var(--good)' }}>
          That is this week done.
        </p>
      ) : null}

      {/*
        The quiet nudge.
        Deliberately in the ordinary soft ink rather than a warning colour, with
        no icon and no border. A red flag on a child's screen for not running
        this week teaches them to avoid the app, which costs far more than the
        habit is worth. The server will not even produce one of these until a
        fortnight has gone by.
      */}
      {habit.nudge ? (
        <p className="mt-3 text-[13px] leading-relaxed text-[var(--ink-soft)]">{habit.nudge}</p>
      ) : null}
    </div>
  );
}
