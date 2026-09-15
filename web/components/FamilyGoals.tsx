'use client';

import { useEffect, useState } from 'react';
import { fetchFamilyGoals, NeedsCodeError, sendCheer, type FamilyGoals } from '@/lib/api';
import { shortMonthName } from '@/lib/month';
import { accentFor, initialsFor } from '@/lib/theme';
import { Icon } from './icons';

/**
 * What everyone is working on.
 *
 * The one screen where the five of them see each other's goals, which is the
 * point of sharing them: a goal is a commitment somebody is willing to be held
 * to, and being able to see it is what lets the house push each other.
 *
 * Three rules hold every line of this file, and all three are enforced on the
 * server as well rather than here:
 *
 *   It shows the commitment and never the reflection. A title, a life area, a
 *   date, how many steps are done, and how it ended. No score, no sentence
 *   behind a score, no note, no figures.
 *
 *   A goal its owner marked private is not here at all. Not its title, not its
 *   status, not as a count. The server never sends it.
 *
 *   Nobody is ranked. The people come out in the order they were added and stay
 *   in it, there is no percentage and no total, and nothing is sorted by how
 *   much anybody has done. What you can see is what somebody is working on and
 *   how it is going, never who is ahead.
 */

const STATUS_WORDS: Record<string, string> = {
  open: 'Working on it',
  hit: 'Hit it',
  missed: 'Missed it',
  dropped: 'Changed their mind',
};

function statusColour(status: string): string {
  if (status === 'hit') return 'var(--good)';
  if (status === 'missed') return 'var(--warn)';
  if (status === 'dropped') return 'var(--ink-soft)';
  return 'var(--silver)';
}

export function FamilyGoalsView({ onNeedsCode }: { onNeedsCode: () => void }) {
  const [data, setData] = useState<FamilyGoals | null>(null);
  const [state, setState] = useState<'loading' | 'locked' | 'failed' | 'ready'>('loading');
  const [problem, setProblem] = useState('');
  const [busyGoal, setBusyGoal] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await fetchFamilyGoals();
        if (cancelled) return;
        setData(loaded);
        setState('ready');
      } catch (error) {
        if (cancelled) return;
        if (error instanceof NeedsCodeError) {
          setState('locked');
          return;
        }
        setProblem(error instanceof Error ? error.message : 'Something went wrong.');
        setState('failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function cheer(goalId: string, reaction: string) {
    if (!data) return;
    setBusyGoal(goalId);
    try {
      const result = await sendCheer(goalId, reaction);
      setData({
        ...data,
        people: data.people.map((person) => ({
          ...person,
          goals: person.goals.map((goal) => {
            if (goal.id !== goalId) return goal;
            const others = goal.cheers.filter((one) => one.from_slug !== data.viewer_slug);
            const mine = data.people.find((p) => p.slug === data.viewer_slug);
            return {
              ...goal,
              cheers: result.reaction
                ? [
                    ...others,
                    {
                      from_slug: data.viewer_slug,
                      from_name: mine?.name ?? 'You',
                      reaction: result.reaction,
                    },
                  ]
                : others,
            };
          }),
        })),
      });
    } catch (error) {
      if (error instanceof NeedsCodeError) {
        onNeedsCode();
        return;
      }
      setProblem(error instanceof Error ? error.message : 'That did not send just now.');
    } finally {
      setBusyGoal(null);
    }
  }

  if (state === 'loading') {
    return <p className="text-[14px] text-[var(--ink-soft)]">Opening what everyone is up to.</p>;
  }

  if (state === 'locked') {
    return (
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-4">
        <p className="text-[14.5px] font-semibold leading-snug">
          Tap your own name to see what everyone is working on
        </p>
        <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--ink-soft)]">
          Goals are shared with the five of us, so you put your own code in first. That way it is
          the family seeing them and not just whoever happens to have the link.
        </p>
      </div>
    );
  }

  if (state === 'failed' || !data) {
    return <p className="text-[14px] text-[var(--ink-soft)]">{problem}</p>;
  }

  const anyGoals = data.people.some((person) => person.goals.length > 0);
  if (!anyGoals) {
    return (
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-4">
        <p className="text-[14.5px] font-semibold leading-snug">Nothing up here yet</p>
        <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--ink-soft)]">
          Goals land here as people set them. What you will see is the goal itself and how it is
          going. What nobody ever sees is what anybody wrote in their check-in, or the scores they
          gave.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {data.people.map((person) => {
        const accent = accentFor(person.slug);
        const open = person.goals.filter((goal) => goal.status === 'open');
        const closed = person.goals.filter((goal) => goal.status !== 'open');
        // Open first for each person, so the live work reads first. This is an
        // ordering inside one person's own list, never a ranking of people.
        const ordered = [...open, ...closed];
        if (ordered.length === 0) return null;

        return (
          <div key={person.slug}>
            <div className="flex items-center gap-2.5">
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold"
                style={{ background: accent, color: 'var(--on-accent)' }}
                aria-hidden="true"
              >
                {initialsFor(person.name)}
              </span>
              <p className="text-[14px] font-semibold">{person.name}</p>
            </div>

            <ul className="mt-2.5 flex flex-col gap-2">
              {ordered.map((goal) => {
                const mine = goal.person_slug === data.viewer_slug;
                const myCheer = goal.cheers.find((one) => one.from_slug === data.viewer_slug);
                return (
                  <li
                    key={goal.id}
                    className="rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-3.5"
                  >
                    <p className="text-[14px] leading-snug">{goal.title}</p>
                    <p className="mt-1 text-[12px] leading-snug text-[var(--ink-soft)]">
                      {[
                        goal.life_area,
                        goal.due_date ? `due ${goal.due_date}` : null,
                        goal.steps_total > 0
                          ? `${goal.steps_done} of ${goal.steps_total} steps`
                          : null,
                        `set in ${shortMonthName(goal.created_cycle_label)}`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    <p
                      className="mt-1.5 text-[12px] font-semibold"
                      style={{ color: statusColour(goal.status) }}
                    >
                      {STATUS_WORDS[goal.status] ?? goal.status}
                      {goal.closed_cycle_label
                        ? ` · ${shortMonthName(goal.closed_cycle_label)}`
                        : ''}
                    </p>

                    {goal.cheers.length > 0 ? (
                      <p className="mt-2 text-[12px] leading-snug text-[var(--ink-soft)]">
                        {goal.cheers
                          .map((one) => `${one.from_name}: ${one.reaction}`)
                          .join(' · ')}
                      </p>
                    ) : null}

                    {mine ? null : (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {data.reactions.map((reaction) => {
                          const on = myCheer?.reaction === reaction;
                          return (
                            <button
                              key={reaction}
                              type="button"
                              disabled={busyGoal === goal.id}
                              aria-pressed={on}
                              onClick={() => cheer(goal.id, reaction)}
                              // No minHeight override here. The global rule in
                              // globals.css keeps every button at 44px, and a
                              // cheer is a thing a child taps with a thumb.
                              className="rounded-full border px-3.5 text-[12.5px] font-semibold disabled:opacity-60"
                              style={
                                on
                                  ? {
                                      background: accent,
                                      color: 'var(--on-accent)',
                                      borderColor: 'transparent',
                                    }
                                  : { borderColor: 'var(--line)', color: 'var(--silver)' }
                              }
                            >
                              {reaction}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      {problem ? (
        <p className="text-[13px] font-medium" style={{ color: 'var(--bad)' }}>
          {problem}
        </p>
      ) : null}

      <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-[var(--ink-soft)]">
        <span className="mt-0.5 shrink-0" aria-hidden="true">
          <Icon name="lock" size={15} />
        </span>
        Goals only. Nobody can see what anyone wrote in their check-in or the scores they gave, and
        a goal someone marked private is not here at all. You can cheer somebody on; you cannot
        change, close or comment on their goal.
      </p>
    </div>
  );
}
