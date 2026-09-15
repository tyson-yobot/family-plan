'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  clearSession,
  fetchGate,
  fetchSpace,
  NeedsCodeError,
  readSession,
  resetSomebodysCode,
  signOut,
  type Gate,
  type Goal,
  type Space,
} from '@/lib/api';
import { rememberLink } from '@/lib/link';
import { monthName, shortMonthName } from '@/lib/month';
import { accentFor, accentStyle, initialsFor } from '@/lib/theme';
import { CodeGate } from './CodeGate';
import { GoalBoard } from './GoalBoard';
import { HistoryView } from './HistoryView';
import { Icon } from './icons';
import { WorksheetFlow } from './WorksheetFlow';

/**
 * Somebody's own space: the door, and the three places behind it.
 *
 * This is where a person now lives between check-ins, which is the thing that
 * did not exist before. Finishing a check-in used to be the end of the month's
 * involvement; now it puts goals on a board that is here every day, with steps
 * to tick and wording to change whenever the goal changes.
 *
 * The Week screen from the mockup is not here. That is the next release and
 * building half of it now would mean a tab that looks finished and is not.
 */

type Tab = 'goals' | 'history' | 'checkin';

export function PersonSpace({ token, slug }: { token: string; slug: string }) {
  const [gate, setGate] = useState<Gate | null>(null);
  const [space, setSpace] = useState<Space | null>(null);
  const [state, setState] = useState<'loading' | 'locked' | 'invalid' | 'failed' | 'ready'>(
    'loading',
  );
  const [problem, setProblem] = useState('');
  const [tab, setTab] = useState<Tab>('goals');
  /**
   * Whether the check-in has ever been opened on this visit.
   *
   * Once it has, it stays mounted and is hidden rather than unmounted when
   * somebody moves to another tab. Unmounting it threw away whatever had been
   * typed in the last couple of seconds, because the check-in saves on a debounce
   * and the component went away before the timer fired. Somebody writing an
   * answer and then tapping Goals to check something lost the sentence they were
   * part way through, and nothing said so.
   *
   * It is not mounted until it is wanted, so opening a space is still one
   * request rather than three.
   */
  const [checkInOpened, setCheckInOpened] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const accent = accentFor(slug);

  const load = useCallback(async () => {
    try {
      const session = readSession();
      // A session belonging to somebody else on this phone is not this person's
      // way in, so it is not even tried. The server would refuse it anyway;
      // this only saves a pointless round trip and an error nobody can act on.
      if (session && session.slug === slug) {
        try {
          const loaded = await fetchSpace(slug);
          setSpace(loaded);
          setState('ready');
          return;
        } catch (error) {
          if (!(error instanceof NeedsCodeError)) throw error;
        }
      }
      const found = await fetchGate(token, slug);
      if (!found) {
        setState('invalid');
        return;
      }
      setGate(found);
      setState('locked');
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Something went wrong.');
      setState('failed');
    }
  }, [slug, token]);

  useEffect(() => {
    void load();
  }, [load]);

  // Somebody who only ever opens their own old link still gets the way back
  // from the home-screen icon. See lib/link.ts.
  useEffect(() => {
    rememberLink(token);
  }, [token]);

  const onNeedsCode = useCallback(() => {
    clearSession();
    setSpace(null);
    void load();
  }, [load]);

  if (state === 'loading') {
    return (
      <main className="mx-auto max-w-md px-5 py-16">
        <p className="text-[15px] text-[var(--ink-soft)]">One moment.</p>
      </main>
    );
  }

  if (state === 'invalid') {
    return (
      <main className="mx-auto max-w-md px-5 py-16">
        <p className="text-[17px]">There is nobody here by that name.</p>
        <Link
          href={`/h/${encodeURIComponent(token)}`}
          className="mt-4 inline-block text-[15px] font-semibold underline"
        >
          Back to the family board
        </Link>
      </main>
    );
  }

  if (state === 'failed') {
    return (
      <main className="mx-auto max-w-md px-5 py-16">
        <p className="text-[17px]">This could not be opened just now.</p>
        <p className="mt-2 text-[15px] text-[var(--ink-soft)]">{problem}</p>
      </main>
    );
  }

  if (state === 'locked' && gate) {
    return <CodeGate gate={gate} token={token} onIn={() => void load()} />;
  }

  if (!space) return null;

  const tabs: { id: Tab; label: string }[] = [
    { id: 'goals', label: 'Goals' },
    { id: 'history', label: 'History' },
    { id: 'checkin', label: 'Check-in' },
  ];

  return (
    <main
      className="mx-auto w-full max-w-md px-5 pb-12 pt-6"
      style={accentStyle(accent) as React.CSSProperties}
    >
      <header className="flex items-center gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[16px] font-bold"
          style={{ background: accent, color: 'var(--on-accent)' }}
          aria-hidden="true"
        >
          {initialsFor(space.name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">{space.name}</p>
          <p className="truncate text-[13px] text-[var(--ink-soft)]">
            {monthName(space.current_cycle_label)}
            {space.days_left > 0
              ? `, ${space.days_left === 1 ? '1 day' : `${space.days_left} days`} left`
              : ''}
          </p>
        </div>
        <Link
          href={`/h/${encodeURIComponent(token)}`}
          className="-mr-2 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-[var(--line)] px-3 text-[12px] font-semibold text-[var(--silver)]"
        >
          Family
        </Link>
      </header>

      <nav className="mt-5 flex gap-1.5" aria-label="Your space">
        {tabs.map((entry) => {
          const on = tab === entry.id;
          return (
            <button
              key={entry.id}
              type="button"
              aria-current={on ? 'page' : undefined}
              onClick={() => {
                if (entry.id === 'checkin') setCheckInOpened(true);
                setTab(entry.id);
              }}
              className="flex-1 rounded-xl border py-2.5 text-[12.5px] font-semibold"
              style={
                on
                  ? { background: accent, color: 'var(--on-accent)', borderColor: 'transparent' }
                  : { borderColor: 'var(--line)', color: 'var(--ink-soft)' }
              }
            >
              {entry.label}
            </button>
          );
        })}
      </nav>

      <div className="mt-6">
        {tab === 'goals' ? (
          <>
            <ThisMonth
              space={space}
              onGo={() => {
                setCheckInOpened(true);
                setTab('checkin');
              }}
            />
            <div className="mt-6">
              <GoalBoard
                slug={slug}
                goals={space.goals}
                onGoals={(goals: Goal[]) => setSpace({ ...space, goals })}
              />
            </div>
          </>
        ) : null}

        {tab === 'history' ? <HistoryView slug={slug} onNeedsCode={onNeedsCode} /> : null}

        {/*
          Hidden rather than removed. See checkInOpened above: taking it out of
          the tree loses the last couple of seconds of typing.
        */}
        {checkInOpened ? (
          <div hidden={tab !== 'checkin'}>
            <WorksheetFlow
              slug={slug}
              onNeedsCode={onNeedsCode}
              onFinished={() => {
                // The board is what a finished check-in changes, so it is read
                // again rather than patched here. A check-in closes goals, opens
                // new ones and can do both at once, and reproducing that in the
                // browser would be a second implementation of the same rules.
                void load();
              }}
            />
          </div>
        ) : null}
      </div>

      {tab !== 'checkin' ? (
        <div className="mt-10 border-t border-[var(--line)] pt-5">
          {space.slug === 'tyson' ? <ResetSomebodysCode slug={slug} /> : null}

          <button
            type="button"
            onClick={async () => {
              setSigningOut(true);
              await signOut();
              setSpace(null);
              await load();
              setSigningOut(false);
            }}
            className="mt-4 flex items-center gap-2 text-[13px] font-semibold text-[var(--ink-soft)]"
          >
            <Icon name="signout" size={16} />
            {signingOut ? 'Signing out' : 'Not you? Sign out'}
          </button>
          <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--ink-soft)]">
            This phone stays signed in as you for a month unless you sign out. On a phone somebody
            else uses too, sign out when you are done.
          </p>
        </div>
      ) : null}
    </main>
  );
}

/**
 * Where this month stands, at the top of the goal board.
 *
 * It is the one place that sends somebody into the check-in, and it says why
 * rather than just offering a button: what a check-in does to the board is the
 * thing that makes the board worth having.
 */
function ThisMonth({ space, onGo }: { space: Space; onGo: () => void }) {
  const month = shortMonthName(space.current_cycle_label);
  const open = space.goals.filter((goal) => goal.status === 'open').length;

  if (space.submitted_this_cycle) {
    return (
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-4">
        <p className="kicker text-[11.5px]" style={{ color: 'var(--good)' }}>
          {month} is done
        </p>
        <p className="mt-2 text-[14px] leading-relaxed text-[var(--ink-soft)]">
          {space.own_streak > 1
            ? `${space.own_streak} months in a row now. `
            : 'Sitting down and telling yourself the truth is the hard part. '}
          {open > 0
            ? `${open === 1 ? 'One goal is' : `${open} goals are`} open below. That is the work between now and next month.`
            : 'Nothing is open on your board. Adding one below is how next month has something to check against.'}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-4">
      <p className="kicker text-[11.5px] text-[var(--ink-soft)]">
        {space.started_this_cycle ? `${month}, part way through` : `${month} is waiting`}
      </p>
      <p className="mt-2 text-[14px] leading-relaxed text-[var(--ink-soft)]">
        {space.started_this_cycle
          ? 'You started this month and stopped part way. Everything you wrote is still there.'
          : open > 0
            ? `Your check-in starts by asking how ${open === 1 ? 'the goal' : `the ${open} goals`} below went, then asks how things actually are.`
            : 'Your check-in asks how things actually are, then puts what you decide on this board.'}
      </p>
      <button
        type="button"
        onClick={onGo}
        className="mt-4 w-full rounded-xl px-4 py-3 text-[14px] font-bold"
        style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
      >
        {space.started_this_cycle ? 'Pick it back up' : `Start ${month}`}
      </button>
    </div>
  );
}

/**
 * Tyson clearing somebody's forgotten code.
 *
 * It is here rather than anywhere else because he has no separate admin screen
 * and building one would be a second way in to guard. What it does is narrow on
 * purpose and the screen says so in the words a child would need to read: it
 * lets that person pick a new code, it does not show anybody the old one, and
 * it does not open any of their answers to him.
 */
function ResetSomebodysCode({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState('');
  const [done, setDone] = useState('');
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[13px] font-semibold text-[var(--ink-soft)]"
      >
        Somebody forgotten their code?
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--line)] p-4">
      <p className="text-[14px] font-semibold">Clear somebody&apos;s code</p>
      <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--ink-soft)]">
        This lets them pick a new one next time they open their name. It does not show you their old
        code, and it does not let you read anything they have written. Nothing can.
      </p>
      <label className="mt-3 block text-[13px] font-medium">
        Whose
        <input
          value={target}
          onChange={(event) => setTarget(event.target.value.toLowerCase().trim())}
          placeholder="aidan"
          className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-[var(--page)] px-3.5 py-3 text-[16px] outline-none focus:border-[var(--accent)]"
        />
      </label>
      {problem ? (
        <p className="mt-2 text-[13px] font-medium" style={{ color: 'var(--bad)' }}>
          {problem}
        </p>
      ) : null}
      {done ? (
        <p className="mt-2 text-[13px] font-medium" style={{ color: 'var(--good)' }}>
          {done} can pick a new code now. Tell them to open their own name.
        </p>
      ) : null}
      <div className="mt-3 flex gap-2.5">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setDone('');
            setProblem('');
          }}
          className="rounded-xl border border-[var(--line)] px-4 py-2.5 text-[13.5px] font-semibold"
        >
          Close
        </button>
        <button
          type="button"
          disabled={busy || target === ''}
          onClick={async () => {
            setBusy(true);
            setProblem('');
            setDone('');
            try {
              const result = await resetSomebodysCode(slug, target);
              setDone(result.name);
              setTarget('');
            } catch (error) {
              setProblem(error instanceof Error ? error.message : 'That did not work just now.');
            } finally {
              setBusy(false);
            }
          }}
          className="flex-1 rounded-xl px-4 py-2.5 text-[13.5px] font-bold disabled:opacity-50"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          {busy ? 'Clearing' : 'Clear it'}
        </button>
      </div>
    </div>
  );
}
