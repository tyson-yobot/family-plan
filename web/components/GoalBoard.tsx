'use client';

import { useState } from 'react';
import { addGoal, addStep, editGoal, editStep, type Goal } from '@/lib/api';
import { shortMonthName } from '@/lib/month';
import { Icon } from './icons';

/**
 * Somebody's own goal board: what they are actually working on, between
 * check-ins.
 *
 * This is the thing that was missing. A goal used to be a sentence inside a
 * submission, saved once a month and never touched again. Here it is a living
 * item: it has steps that get ticked, wording and a date that can change on any
 * ordinary Tuesday, and an end that its owner chooses rather than one that
 * arrives because the month did.
 *
 * Only the person whose board this is can touch any of it, and that is not this
 * component's doing. Every call below goes to a route that proves who is asking
 * before it answers, so this screen hiding a button is a convenience and never
 * the protection.
 *
 * Who else sees what, said plainly on every card because a promise nobody can
 * find is not one:
 *
 *   The GOAL is shared with the house by default. A goal is a commitment you
 *   are willing to be held to, so the family seeing it is the point of it.
 *
 *   Anything you WROTE is yours. The scores, the sentence behind each score,
 *   the note to yourself, the line about how a goal went. Nobody sees any of it.
 *
 *   Any single goal can be made yours alone, by anybody, adult or child, when
 *   they make it or at any time afterwards. A private goal is on nobody else's
 *   screen at all, not even as a number.
 */

const STATUS_WORDS: Record<Goal['status'], string> = {
  open: 'Working on it',
  hit: 'Hit it',
  missed: 'Missed it',
  dropped: 'Changed my mind',
};

function statusColour(status: Goal['status']): string {
  if (status === 'hit') return 'var(--good)';
  if (status === 'missed') return 'var(--warn)';
  if (status === 'dropped') return 'var(--ink-soft)';
  return 'var(--accent)';
}

/** How far along a goal is, from its steps. Nothing is invented where there are none. */
function stepProgress(goal: Goal): { done: number; total: number } | null {
  if (goal.steps.length === 0) return null;
  return { done: goal.steps.filter((step) => step.done).length, total: goal.steps.length };
}

/**
 * The four timeframes, shortest first, and the words for each.
 *
 * The order is load-bearing rather than decorative: a goal may only hang off
 * one that is longer than itself, and the board reads that off this array.
 */
export const HORIZONS: { id: Goal['horizon']; label: string; blurb: string }[] = [
  { id: 'ninety_day', label: 'Next 90 days', blurb: 'What you are actually working on now.' },
  { id: 'one_year', label: 'This year', blurb: 'Where this year has to get to.' },
  { id: 'three_year', label: '3 years', blurb: 'The medium game.' },
  { id: 'ten_year', label: '10 years', blurb: 'The long one. It is allowed to be big.' },
];

export function horizonLabel(horizon: Goal['horizon']): string {
  return HORIZONS.find((entry) => entry.id === horizon)?.label ?? 'Next 90 days';
}

export function GoalBoard({
  slug,
  goals,
  goalAreas,
  horizonProgress,
  onGoals,
}: {
  slug: string;
  goals: Goal[];
  /** Everywhere a goal can be filed. NOT the list the check-in scores. */
  goalAreas: { id: string; label: string }[];
  /** Keyed by a longer goal's id. Absent where nothing hangs off it yet. */
  horizonProgress: Record<string, { done: number; total: number }>;
  /** Hands the whole new list back up, so the space and the board never disagree. */
  onGoals: (goals: Goal[]) => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [problem, setProblem] = useState('');
  const [adding, setAdding] = useState(false);
  const [showClosed, setShowClosed] = useState(false);

  const open = goals.filter((goal) => goal.status === 'open');
  const closed = goals.filter((goal) => goal.status !== 'open');

  function replace(updated: Goal | null) {
    if (!updated) return;
    onGoals(goals.map((goal) => (goal.id === updated.id ? updated : goal)));
  }

  async function run(id: string, work: () => Promise<{ goal: Goal | null }>) {
    setBusyId(id);
    setProblem('');
    try {
      const result = await work();
      replace(result.goal);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'That did not save just now.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      {open.length === 0 && closed.length === 0 ? (
        <EmptyBoard />
      ) : null}

      {/*
        Grouped by timeframe, shortest first.
        A flat list stopped working the moment ten-year goals existed: the thing
        somebody does this week and the thing they want by 2036 read as equals,
        and the ninety-day work is what actually needs doing. A heading per
        timeframe is only shown when something is in it, so a board with nothing
        but ninety-day goals looks exactly as it did before.
      */}
      {HORIZONS.map((horizon) => {
        const mine = open.filter((goal) => goal.horizon === horizon.id);
        if (mine.length === 0) return null;
        return (
          <section key={horizon.id} className="mb-6">
            {open.some((goal) => goal.horizon !== 'ninety_day') ? (
              <h3 className="kicker mb-2 text-[11.5px] text-[var(--ink-soft)]">{horizon.label}</h3>
            ) : null}
            <ul className="flex flex-col gap-3">
              {mine.map((goal) => (
                <li key={goal.id}>
                  <GoalCard
                    goal={goal}
                    slug={slug}
                    goalAreas={goalAreas}
                    allGoals={goals}
                    progress={horizonProgress[goal.id] ?? null}
                    busy={busyId === goal.id}
                    onRun={(work) => run(goal.id, work)}
                  />
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {adding ? (
        <AddGoal
          slug={slug}
          goalAreas={goalAreas}
          allGoals={goals}
          onCancel={() => setAdding(false)}
          onAdded={(goal) => {
            onGoals([...goals, goal]);
            setAdding(false);
          }}
          onProblem={setProblem}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--line)] px-4 py-3.5 text-[14px] font-semibold text-[var(--ink-soft)]"
        >
          <Icon name="plus" size={17} />
          Add a goal
        </button>
      )}

      {problem ? (
        <p className="mt-3 text-[14px] font-medium" style={{ color: 'var(--bad)' }}>
          {problem}
        </p>
      ) : null}

      {closed.length > 0 ? (
        <div className="mt-8">
          <button
            type="button"
            onClick={() => setShowClosed((open) => !open)}
            className="flex w-full items-center justify-between rounded-xl border border-[var(--line)] px-4 py-3 text-left text-[13.5px] font-semibold text-[var(--ink-soft)]"
          >
            <span>
              {closed.length} finished {closed.length === 1 ? 'goal' : 'goals'}
            </span>
            <span aria-hidden="true">{showClosed ? 'Hide' : 'Show'}</span>
          </button>
          {showClosed ? (
            <ul className="mt-3 flex flex-col gap-3">
              {closed.map((goal) => (
                <li key={goal.id}>
                  <ClosedGoalCard
                    goal={goal}
                    busy={busyId === goal.id}
                    onReopen={() =>
                      run(goal.id, () => editGoal(slug, goal.id, { status: 'open' }))
                    }
                  />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Who can see this one goal, said on the card itself, and the way to change it.
 *
 * Written for the youngest person who will read it. It is one line and a
 * button rather than a settings screen, because a privacy control somebody has
 * to go looking for is one they will not find on the day it matters.
 */
function Visibility({
  isPrivate,
  busy,
  onToggle,
}: {
  isPrivate: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="mt-2.5 flex items-center gap-2">
      <span
        className="shrink-0"
        style={{ color: isPrivate ? 'var(--ink-soft)' : 'var(--accent-ink)' }}
        aria-hidden="true"
      >
        <Icon name={isPrivate ? 'lock' : 'users'} size={14} />
      </span>
      <span className="min-w-0 flex-1 text-[12px] leading-snug text-[var(--ink-soft)]">
        {isPrivate ? 'Only you can see this one.' : 'The family can see this one.'}
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={onToggle}
        className="shrink-0 rounded-lg px-2 text-[12px] font-semibold underline disabled:opacity-60"
        style={{ color: 'var(--accent-ink)' }}
      >
        {isPrivate ? 'Let them see it' : 'Make it just mine'}
      </button>
    </div>
  );
}

/**
 * The same choice while a goal is being written, before it exists.
 *
 * Shared is the default and the screen says why in one line, because a default
 * nobody understands is a default nobody trusts.
 */
function PrivateChoice({
  isPrivate,
  onChange,
}: {
  isPrivate: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="mt-4 rounded-xl border border-[var(--line)] p-3.5">
      <p className="text-[13px] font-medium">Who sees this one?</p>
      <div className="mt-2 flex flex-col gap-2">
        {[
          {
            value: false,
            label: 'The family',
            why: 'They see the goal and how it is going, so they can cheer you on.',
          },
          {
            value: true,
            label: 'Just me',
            why: 'It does not show up anywhere for anyone else, at all.',
          },
        ].map((option) => {
          const on = isPrivate === option.value;
          return (
            <button
              key={option.label}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(option.value)}
              className="rounded-xl border px-3.5 py-2.5 text-left"
              style={
                on
                  ? { background: 'var(--accent)', color: 'var(--on-accent)', borderColor: 'transparent' }
                  : { borderColor: 'var(--line)' }
              }
            >
              <span className="block text-[13.5px] font-semibold">{option.label}</span>
              <span
                className="mt-0.5 block text-[12px] leading-snug"
                style={{ color: on ? 'var(--on-accent)' : 'var(--ink-soft)' }}
              >
                {option.why}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2.5 text-[12px] leading-snug text-[var(--ink-soft)]">
        Either way, nobody ever sees what you wrote in your check-in or the scores you gave. You can
        change this whenever you like.
      </p>
    </div>
  );
}

/**
 * The empty state, which teaches rather than apologises. Somebody looking at
 * this has just finished their first check-in or has closed everything off, and
 * either way the useful thing is to say what a goal here actually is.
 */
function EmptyBoard() {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-5">
      <span
        className="flex h-11 w-11 items-center justify-center rounded-xl"
        style={{ background: 'var(--accent-tint)', color: 'var(--accent-ink)' }}
        aria-hidden="true"
      >
        <Icon name="target" size={22} />
      </span>
      <p className="mt-4 text-[15.5px] font-semibold leading-snug">Nothing on your board yet</p>
      <p className="mt-2 text-[14px] leading-relaxed text-[var(--ink-soft)]">
        A goal here is not a wish. It is something a stranger could look at in ninety days and tell
        you yes or no about, with a first step small enough to do this week.
      </p>
      <p className="mt-2 text-[14px] leading-relaxed text-[var(--ink-soft)]">
        Your check-in puts goals here on its own. You can also add one yourself, right now, and
        change it whenever you want.
      </p>
      <p className="mt-3 text-[13px] leading-relaxed text-[var(--ink-soft)]">
        The family can see the goals you set and how they are going, so they can cheer you on.
        Nobody can see what you wrote or the scores you gave. Any goal you mark just yours is yours
        alone.
      </p>
    </div>
  );
}

function GoalCard({
  goal,
  slug,
  goalAreas,
  allGoals,
  progress: derived,
  busy,
  onRun,
}: {
  goal: Goal;
  slug: string;
  goalAreas: { id: string; label: string }[];
  allGoals: Goal[];
  /** Counted from the shorter goals hanging off this one, or null if none are. */
  progress: { done: number; total: number } | null;
  busy: boolean;
  onRun: (work: () => Promise<{ goal: Goal | null }>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [addingStep, setAddingStep] = useState(false);
  const [closing, setClosing] = useState(false);
  const progress = stepProgress(goal);
  const parent = goal.parent_goal_id
    ? (allGoals.find((item) => item.id === goal.parent_goal_id) ?? null)
    : null;
  const areaLabel = goal.life_area
    ? (goalAreas.find((area) => area.id === goal.life_area)?.label ?? goal.life_area)
    : null;

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-4">
      <div className="flex items-start gap-3">
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] font-semibold leading-snug">{goal.title}</span>
          <span className="mt-1 block text-[12px] leading-snug text-[var(--ink-soft)]">
            {[
              goal.due_date ? `Due ${goal.due_date}` : null,
              `Set in ${shortMonthName(goal.created_cycle_label)}`,
              progress ? `${progress.done} of ${progress.total} steps` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
        <button
          type="button"
          onClick={() => setEditing((open) => !open)}
          aria-label={`Change "${goal.title}"`}
          className="-mr-1 -mt-1 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-[var(--ink-soft)]"
        >
          <Icon name="pencil" size={17} />
        </button>
      </div>

      {/*
        What this goal is part of, where it hangs off a longer one.
        The point of the horizons is that a ninety-day win visibly moves a
        three-year number, and this is the half of that a person sees on the
        short goal: it is not floating, it is a piece of something.
      */}
      {parent ? (
        <p className="mt-2 text-[12px] leading-snug text-[var(--ink-soft)]">
          Part of: {parent.title}
        </p>
      ) : null}

      {areaLabel ? (
        <p className="mt-1 text-[12px] leading-snug text-[var(--ink-soft)]">{areaLabel}</p>
      ) : null}

      {/*
        The other half: on a LONGER goal, how far the shorter ones under it have
        come. Absent rather than zero when nothing is attached, because a bar at
        nought says 'no progress' when the truth is 'nothing hangs off this yet'.
      */}
      {derived ? (
        <div className="mt-3">
          <div className="h-[5px] w-full overflow-hidden rounded-full bg-[var(--line)]">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{
                background: 'var(--accent)',
                width: `${Math.round((derived.done / derived.total) * 100)}%`,
              }}
            />
          </div>
          <p className="mt-1.5 text-[12px] text-[var(--ink-soft)]">
            {derived.done} of {derived.total} goals under this one done
          </p>
        </div>
      ) : null}

      {goal.weekly_habit ? (
        <p className="mt-2 text-[12px] leading-snug" style={{ color: 'var(--accent-ink)' }}>
          Weekly: {goal.weekly_habit}
          {goal.weekly_target_count ? `, ${goal.weekly_target_count} times a week` : ''}
        </p>
      ) : null}

      <Visibility
        isPrivate={goal.is_private}
        busy={busy}
        onToggle={() => onRun(() => editGoal(slug, goal.id, { is_private: !goal.is_private }))}
      />

      {progress ? (
        <div className="mt-3 h-[5px] w-full overflow-hidden rounded-full bg-[var(--line)]">
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{
              background: 'var(--accent)',
              width: `${Math.round((progress.done / progress.total) * 100)}%`,
            }}
          />
        </div>
      ) : null}

      {goal.steps.length > 0 ? (
        <ul className="mt-3 border-t border-[var(--line)] pt-2">
          {goal.steps.map((step) => (
            <li key={step.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  onRun(() => editStep(slug, goal.id, step.id, { done: !step.done }))
                }
                aria-pressed={step.done}
                className="flex w-full items-center gap-2.5 py-1.5 text-left text-[13px] leading-snug disabled:opacity-60"
              >
                <span
                  className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px]"
                  style={
                    step.done
                      ? { background: 'var(--good)', borderColor: 'transparent', color: 'var(--on-accent)' }
                      : { borderColor: 'var(--line)' }
                  }
                  aria-hidden="true"
                >
                  {step.done ? <Icon name="check" size={11} strokeWidth={3.5} /> : null}
                </span>
                <span className={step.done ? 'text-[var(--ink-soft)] line-through' : ''}>
                  {step.title}
                  {step.due_date ? (
                    <span className="text-[var(--ink-soft)]"> · {step.due_date}</span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {addingStep ? (
        <AddStep
          onCancel={() => setAddingStep(false)}
          onAdd={(title, dueDate) => {
            setAddingStep(false);
            onRun(() => addStep(slug, goal.id, { title, due_date: dueDate }));
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAddingStep(true)}
          className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold"
          style={{ color: 'var(--accent-ink)' }}
        >
          <Icon name="plus" size={14} />
          Add a step
        </button>
      )}

      {editing ? (
        <EditGoal
          goal={goal}
          goalAreas={goalAreas}
          allGoals={allGoals}
          onCancel={() => setEditing(false)}
          onSave={(patch) => {
            setEditing(false);
            onRun(() => editGoal(slug, goal.id, patch));
          }}
        />
      ) : null}

      <div className="mt-4 border-t border-[var(--line)] pt-3">
        {closing ? (
          <CloseGoal
            onCancel={() => setClosing(false)}
            onClose={(status, note) => {
              setClosing(false);
              onRun(() => editGoal(slug, goal.id, { status, closed_note: note }));
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setClosing(true)}
            className="text-[13px] font-semibold text-[var(--ink-soft)]"
          >
            Finish this one off
          </button>
        )}
      </div>
    </div>
  );
}

function ClosedGoalCard({
  goal,
  busy,
  onReopen,
}: {
  goal: Goal;
  busy: boolean;
  onReopen: () => void;
}) {
  return (
    <div className="rounded-2xl border border-[var(--line)] p-4">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 shrink-0" style={{ color: statusColour(goal.status) }} aria-hidden="true">
          <Icon name={goal.status === 'hit' ? 'trophy' : 'flag'} size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] leading-snug text-[var(--ink-soft)]">{goal.title}</span>
          <span className="mt-1 block text-[12px] leading-snug" style={{ color: statusColour(goal.status) }}>
            {STATUS_WORDS[goal.status]}
            {goal.closed_cycle_label ? ` · ${shortMonthName(goal.closed_cycle_label)}` : ''}
          </span>
          {goal.closed_note ? (
            <span className="mt-1.5 block text-[12.5px] leading-snug text-[var(--ink-soft)]">
              {goal.closed_note}
            </span>
          ) : null}
        </span>
      </div>
      <p className="mt-2 text-[12px] leading-snug text-[var(--ink-soft)]">
        {goal.is_private ? 'Only you ever saw this one.' : 'The family could see this one.'}
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={onReopen}
        className="mt-2 text-[12.5px] font-semibold text-[var(--ink-soft)] underline disabled:opacity-60"
      >
        Put it back on my board
      </button>
    </div>
  );
}

const fieldClass =
  'mt-1.5 w-full rounded-xl border border-[var(--line)] bg-[var(--page)] px-3.5 py-3 text-[16px] leading-relaxed outline-none focus:border-[var(--accent)]';

function AddGoal({
  slug,
  goalAreas,
  allGoals,
  onAdded,
  onCancel,
  onProblem,
}: {
  slug: string;
  goalAreas: { id: string; label: string }[];
  allGoals: Goal[];
  onAdded: (goal: Goal) => void;
  onCancel: () => void;
  onProblem: (message: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [firstStep, setFirstStep] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [horizon, setHorizon] = useState<Goal['horizon']>('ninety_day');
  const [lifeArea, setLifeArea] = useState('');
  const [parentId, setParentId] = useState('');
  const [habit, setHabit] = useState('');
  const [habitCount, setHabitCount] = useState('');
  const [busy, setBusy] = useState(false);

  /*
   * Which longer goals this one could hang off.
   *
   * Only goals that are genuinely longer, and only open ones. The server checks
   * this too and is the thing that actually enforces it; offering an impossible
   * choice and then refusing it would just be a worse way of saying the same
   * thing.
   */
  const longerGoals = allGoals.filter(
    (goal) =>
      goal.status === 'open' &&
      HORIZONS.findIndex((entry) => entry.id === goal.horizon) >
        HORIZONS.findIndex((entry) => entry.id === horizon),
  );

  async function save() {
    if (title.trim() === '' || busy) return;
    setBusy(true);
    try {
      const result = await addGoal(slug, {
        title: title.trim(),
        due_date: dueDate.trim() || null,
        first_step: firstStep.trim() || null,
        is_private: isPrivate,
        horizon,
        life_area: lifeArea || null,
        parent_goal_id: parentId || null,
        weekly_habit: habit.trim() || null,
        weekly_target_count: habitCount === '' ? null : Number(habitCount),
      });
      onAdded(result.goal);
    } catch (error) {
      onProblem(error instanceof Error ? error.message : 'That did not save just now.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-4">
      <p className="text-[14.5px] font-semibold">A new goal</p>
      <label className="mt-3 block text-[13.5px] font-medium">
        What is it?
        <textarea
          rows={2}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Something someone could tell you yes or no about"
          className={fieldClass}
        />
      </label>
      <label className="mt-3 block text-[13.5px] font-medium">
        By when (optional)
        <input
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
          placeholder="30 Nov, or before Christmas"
          className={fieldClass}
        />
      </label>
      <label className="mt-3 block text-[13.5px] font-medium">
        First step this week (optional)
        <input
          value={firstStep}
          onChange={(event) => setFirstStep(event.target.value)}
          className={fieldClass}
        />
      </label>

      {/*
        The timeframe. Four buttons rather than a dropdown, because a dropdown
        on a phone hides three of the four choices behind a tap, and the point
        of this control is that somebody notices the long ones exist at all.
      */}
      <fieldset className="mt-4">
        <legend className="text-[13.5px] font-medium">When is this for?</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {HORIZONS.map((entry) => {
            const on = horizon === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => {
                  setHorizon(entry.id);
                  // A parent chosen for the old timeframe may no longer be
                  // longer than this one, so it is cleared rather than left to
                  // be refused on save.
                  setParentId('');
                }}
                aria-pressed={on}
                className="min-h-[44px] rounded-xl border px-3 text-[13px] font-semibold"
                style={
                  on
                    ? { background: 'var(--accent)', color: 'var(--on-accent)', borderColor: 'transparent' }
                    : { borderColor: 'var(--line)', color: 'var(--ink-soft)' }
                }
              >
                {entry.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/*
        Attaching to a longer goal is OFFERED and never forced.
        Nothing should float loose, but a goal somebody cannot place yet is
        still a goal worth writing down, and refusing to save it until they
        pick a parent would lose it.
      */}
      {longerGoals.length > 0 ? (
        <label className="mt-4 block text-[13.5px] font-medium">
          Part of a bigger goal? (optional)
          <select
            value={parentId}
            onChange={(event) => setParentId(event.target.value)}
            className={fieldClass}
          >
            <option value="">On its own</option>
            {longerGoals.map((goal) => (
              <option key={goal.id} value={goal.id}>
                {goal.title}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[12px] font-normal leading-relaxed text-[var(--ink-soft)]">
            Hanging it off a longer goal means finishing this one visibly moves that one along.
          </span>
        </label>
      ) : null}

      <label className="mt-4 block text-[13.5px] font-medium">
        Which part of life? (optional)
        <select
          value={lifeArea}
          onChange={(event) => setLifeArea(event.target.value)}
          className={fieldClass}
        >
          <option value="">Not sure yet</option>
          {goalAreas.map((area) => (
            <option key={area.id} value={area.id}>
              {area.label}
            </option>
          ))}
        </select>
      </label>

      {/*
        The weekly habit. Optional, and explained rather than labelled, because
        "weekly habit" means nothing on its own to an eleven year old.
      */}
      <label className="mt-4 block text-[13.5px] font-medium">
        Something you do every week towards it? (optional)
        <input
          value={habit}
          onChange={(event) => setHabit(event.target.value)}
          placeholder="Go for a run, read before bed"
          className={fieldClass}
        />
      </label>
      {habit.trim() !== '' ? (
        <label className="mt-3 block text-[13.5px] font-medium">
          How many times a week?
          <select
            value={habitCount}
            onChange={(event) => setHabitCount(event.target.value)}
            className={fieldClass}
          >
            <option value="">However many I can</option>
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? 'time' : 'times'}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[12px] font-normal leading-relaxed text-[var(--ink-soft)]">
            This gives you seven boxes to tick on the Week tab. Only you can see them.
          </span>
        </label>
      ) : null}

      <PrivateChoice isPrivate={isPrivate} onChange={setIsPrivate} />

      <div className="mt-4 flex gap-2.5">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-[var(--line)] px-4 py-3 text-[14px] font-semibold"
        >
          Not now
        </button>
        <button
          type="button"
          onClick={save}
          disabled={busy || title.trim() === ''}
          className="flex-1 rounded-xl px-4 py-3 text-[14px] font-bold disabled:opacity-50"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          {busy ? 'Saving' : 'Put it on my board'}
        </button>
      </div>
    </div>
  );
}

interface GoalPatch {
  title: string;
  due_date: string | null;
  life_area: string | null;
  parent_goal_id: string | null;
  weekly_habit: string | null;
  weekly_target_count: number | null;
}

/**
 * Changing a goal that is already on the board.
 *
 * This is where a weekly habit gets added to a goal that did not have one, and
 * that is not a detail: the Week tab's empty state sends people here by name,
 * so a habit that could only be set when a goal was first written would make
 * that instruction a dead end.
 *
 * The timeframe itself is deliberately NOT editable here. Moving a goal between
 * horizons can orphan or invert a parent link, the server refuses the invalid
 * cases, and an error somebody cannot act on is worse than not offering it. A
 * goal in the wrong timeframe is closed and rewritten, which is one extra tap
 * and leaves an honest record of the change.
 */
function EditGoal({
  goal,
  goalAreas,
  allGoals,
  onSave,
  onCancel,
}: {
  goal: Goal;
  goalAreas: { id: string; label: string }[];
  allGoals: Goal[];
  onSave: (patch: GoalPatch) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(goal.title);
  const [dueDate, setDueDate] = useState(goal.due_date ?? '');
  const [lifeArea, setLifeArea] = useState(goal.life_area ?? '');
  const [parentId, setParentId] = useState(goal.parent_goal_id ?? '');
  const [habit, setHabit] = useState(goal.weekly_habit ?? '');
  const [habitCount, setHabitCount] = useState(
    goal.weekly_target_count === null ? '' : String(goal.weekly_target_count),
  );

  const longerGoals = allGoals.filter(
    (other) =>
      other.status === 'open' &&
      other.id !== goal.id &&
      HORIZONS.findIndex((entry) => entry.id === other.horizon) >
        HORIZONS.findIndex((entry) => entry.id === goal.horizon),
  );

  return (
    <div className="mt-4 rounded-xl border border-[var(--line)] p-3.5">
      <p className="text-[13.5px] font-semibold">Change this goal</p>
      <label className="mt-2.5 block text-[13px] font-medium">
        The goal
        <textarea
          rows={2}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className={fieldClass}
        />
      </label>
      <label className="mt-2.5 block text-[13px] font-medium">
        By when
        <input
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
          className={fieldClass}
        />
      </label>

      <label className="mt-2.5 block text-[13px] font-medium">
        Which part of life
        <select
          value={lifeArea}
          onChange={(event) => setLifeArea(event.target.value)}
          className={fieldClass}
        >
          <option value="">Not sure yet</option>
          {goalAreas.map((area) => (
            <option key={area.id} value={area.id}>
              {area.label}
            </option>
          ))}
        </select>
      </label>

      {longerGoals.length > 0 ? (
        <label className="mt-2.5 block text-[13px] font-medium">
          Part of a bigger goal
          <select
            value={parentId}
            onChange={(event) => setParentId(event.target.value)}
            className={fieldClass}
          >
            <option value="">On its own</option>
            {longerGoals.map((other) => (
              <option key={other.id} value={other.id}>
                {other.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="mt-2.5 block text-[13px] font-medium">
        Something you do every week towards it
        <input
          value={habit}
          onChange={(event) => setHabit(event.target.value)}
          placeholder="Go for a run, read before bed"
          className={fieldClass}
        />
      </label>
      {habit.trim() !== '' ? (
        <label className="mt-2.5 block text-[13px] font-medium">
          How many times a week
          <select
            value={habitCount}
            onChange={(event) => setHabitCount(event.target.value)}
            className={fieldClass}
          >
            <option value="">However many I can</option>
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? 'time' : 'times'}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[12px] font-normal leading-relaxed text-[var(--ink-soft)]">
            Gives you seven boxes on the Week tab. Only you can see them.
          </span>
        </label>
      ) : null}

      <div className="mt-3 flex gap-2.5">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-[var(--line)] px-4 py-2.5 text-[13.5px] font-semibold"
        >
          Leave it
        </button>
        <button
          type="button"
          disabled={title.trim() === ''}
          onClick={() =>
            onSave({
              title: title.trim(),
              due_date: dueDate.trim() || null,
              life_area: lifeArea || null,
              parent_goal_id: parentId || null,
              weekly_habit: habit.trim() || null,
              // Clearing the habit clears its count too, so a goal cannot be
              // left with "three times a week" and nothing to do three times.
              weekly_target_count:
                habit.trim() === '' || habitCount === '' ? null : Number(habitCount),
            })
          }
          className="flex-1 rounded-xl px-4 py-2.5 text-[13.5px] font-bold disabled:opacity-50"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          Save the change
        </button>
      </div>
    </div>
  );
}

function AddStep({
  onAdd,
  onCancel,
}: {
  onAdd: (title: string, dueDate: string | null) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');

  return (
    <div className="mt-3 rounded-xl border border-[var(--line)] p-3.5">
      <label className="block text-[13px] font-medium">
        The next step
        <input
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className={fieldClass}
        />
      </label>
      <label className="mt-2.5 block text-[13px] font-medium">
        By when (optional)
        <input
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
          className={fieldClass}
        />
      </label>
      <div className="mt-3 flex gap-2.5">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-[var(--line)] px-4 py-2.5 text-[13.5px] font-semibold"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={title.trim() === ''}
          onClick={() => onAdd(title.trim(), dueDate.trim() || null)}
          className="flex-1 rounded-xl px-4 py-2.5 text-[13.5px] font-bold disabled:opacity-50"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          Add it
        </button>
      </div>
    </div>
  );
}

/**
 * Ending a goal.
 *
 * Three ways out, and "changed my mind" is one of them on purpose. A board that
 * only lets you hit or miss turns every abandoned goal into a failure, which is
 * how somebody ends up quietly not opening the app. Deciding a goal was the
 * wrong goal is a real answer and it is offered in those words.
 */
function CloseGoal({
  onClose,
  onCancel,
}: {
  onClose: (status: 'hit' | 'missed' | 'dropped', note: string | null) => void;
  onCancel: () => void;
}) {
  const [status, setStatus] = useState<'hit' | 'missed' | 'dropped' | null>(null);
  const [note, setNote] = useState('');

  const options: { value: 'hit' | 'missed' | 'dropped'; label: string }[] = [
    { value: 'hit', label: 'Hit it' },
    { value: 'missed', label: 'Missed it' },
    { value: 'dropped', label: 'Changed my mind' },
  ];

  return (
    <div>
      <p className="text-[13.5px] font-semibold">How did this one end?</p>
      <div className="mt-2 flex flex-col gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={status === option.value}
            onClick={() => setStatus(option.value)}
            className="rounded-xl border px-4 py-2.5 text-left text-[13.5px] font-semibold"
            style={
              status === option.value
                ? { background: 'var(--accent)', color: 'var(--on-accent)', borderColor: 'transparent' }
                : { borderColor: 'var(--line)' }
            }
          >
            {option.label}
          </button>
        ))}
      </div>
      <label className="mt-3 block text-[13px] font-medium">
        One line about it, if you want (optional)
        <input value={note} onChange={(event) => setNote(event.target.value)} className={fieldClass} />
      </label>
      <div className="mt-3 flex gap-2.5">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-[var(--line)] px-4 py-2.5 text-[13.5px] font-semibold"
        >
          Keep it open
        </button>
        <button
          type="button"
          disabled={!status}
          onClick={() => status && onClose(status, note.trim() || null)}
          className="flex-1 rounded-xl px-4 py-2.5 text-[13.5px] font-bold disabled:opacity-50"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          Finish it
        </button>
      </div>
    </div>
  );
}
