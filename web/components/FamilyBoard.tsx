'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fetchBoard, type Board, type BoardPerson } from '@/lib/api';
import { rememberLink } from '@/lib/link';
import { accentFor, initialsFor } from '@/lib/theme';
import { FamilyGoalsView } from './FamilyGoals';
import { Icon } from './icons';
import { monthName } from '@/lib/month';

/**
 * The family board. One link, shared by all five, and this is what it opens.
 *
 * What is on it is the whole point of it, so it is worth saying here rather
 * than leaving it to be inferred: a name, whether that person has finished this
 * month, and the date they did. Nothing else about anybody. No score, no goal,
 * no answer, not a word of what anybody wrote, and nothing counted out of it.
 * The server sends nothing else either, so this is not a screen hiding things
 * it was given.
 *
 * The streak is the one shared number in the tool. It only moves when all five
 * show up, which is what makes it safe: there is nothing in it that belongs to
 * one person, so it cannot be used to put anybody above or below anybody else.
 */

function StatusRing({ status, accent }: { status: BoardPerson['status']; accent: string }) {
  if (status === 'done') {
    return (
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-[2.5px]"
        style={{ borderColor: accent, color: accent }}
        aria-hidden="true"
      >
        <Icon name="check" size={14} strokeWidth={3} />
      </span>
    );
  }
  if (status === 'started') {
    return (
      <span
        className="h-7 w-7 shrink-0 rounded-full border-[2.5px] border-dashed opacity-80"
        style={{ borderColor: accent }}
        aria-hidden="true"
      />
    );
  }
  // Not started. Drawn in the quiet grey rather than in --line: --line is 1.45
  // against the page, which is below the 3:1 that a non-text thing carrying
  // meaning needs, and this is the status that matters most on this screen. It
  // was invisible and the contrast check was not measuring it.
  return (
    <span
      className="h-7 w-7 shrink-0 rounded-full border-[2.5px]"
      style={{ borderColor: 'var(--ink-soft)' }}
      aria-hidden="true"
    />
  );
}

function statusWords(person: BoardPerson): string {
  if (person.status === 'done' && person.finished_on) {
    const [year, month, day] = person.finished_on.split('-').map(Number);
    const when = new Intl.DateTimeFormat('en-US', {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(year, month - 1, day)));
    return `Done, ${when}`;
  }
  if (person.status === 'done') return 'Done';
  if (person.status === 'started') return 'Started';
  return 'Not started';
}

export function FamilyBoard({ token }: { token: string }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [state, setState] = useState<'loading' | 'invalid' | 'failed' | 'ready'>('loading');
  const [problem, setProblem] = useState('');
  const [explaining, setExplaining] = useState(false);
  /**
   * Bumped when the shared goals say the session has gone, so that part of the
   * screen remounts and comes back with its "put your code in" state rather
   * than sitting on a stale list. The board itself needs no code and is
   * unaffected.
   */
  const [boardKey, setBoardKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await fetchBoard(token);
        if (cancelled) return;
        if (!loaded) {
          setState('invalid');
          return;
        }
        setBoard(loaded);
        setState('ready');
        // So the home-screen icon, which opens "/", has somewhere to send
        // somebody back to. See lib/link.ts for why this is not access control.
        rememberLink(token);
      } catch (error) {
        if (cancelled) return;
        setProblem(error instanceof Error ? error.message : 'Something went wrong.');
        setState('failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state === 'loading') {
    return (
      <main className="mx-auto max-w-md px-5 py-16">
        <p className="text-[15px] text-[var(--ink-soft)]">Opening the board.</p>
      </main>
    );
  }
  if (state === 'invalid') {
    return (
      <main className="mx-auto max-w-md px-5 py-16">
        <p className="text-[17px]">This link isn&apos;t valid.</p>
        <p className="mt-2 text-[15px] text-[var(--ink-soft)]">Ask Tyson for the one for the house.</p>
      </main>
    );
  }
  if (state === 'failed' || !board) {
    return (
      <main className="mx-auto max-w-md px-5 py-16">
        <p className="text-[17px]">The board could not be opened just now.</p>
        <p className="mt-2 text-[15px] text-[var(--ink-soft)]">{problem}</p>
      </main>
    );
  }

  const month = monthName(board.current_cycle_label);
  const left = board.people_count - board.finished_count;

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-12 pt-6">
      <header className="flex items-center gap-3" inert={explaining ? true : undefined}>
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface-2)] text-[var(--silver)]"
          aria-hidden="true"
        >
          <Icon name="compass" size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">Our family</p>
          <p className="truncate text-[13px] text-[var(--ink-soft)]">{month}</p>
        </div>
        <button
          type="button"
          onClick={() => setExplaining(true)}
          className="-mr-2 flex min-w-[44px] items-center justify-center gap-1.5 rounded-xl border border-[var(--line)] px-3 text-[12px] font-semibold text-[var(--silver)]"
        >
          What is this?
        </button>
      </header>

      <div inert={explaining ? true : undefined}>
        <p className="kicker steel mt-6 text-[15px]">To a bigger life</p>
        <h1 className="display mt-1 text-[44px] uppercase leading-none">
          {month.split(' ')[0]}
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-[var(--ink-soft)]">
          {board.finished_count} of {board.people_count} checked in.{' '}
          {board.days_left === 1 ? '1 day' : `${board.days_left} days`} left in the month.
        </p>

        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-4">
          <span className="display text-[30px] leading-none" style={{ color: 'var(--good)' }}>
            {board.family_streak}
          </span>
          {/*
            The streak explained in one sentence, and which sentence depends on
            where the house actually is.

            Two drafts got this wrong in ways only real numbers showed. The
            first ran every clause together and read "0 months running so far.
            It starts the first month all of us finish. 5 more people and
            September makes 1," which is three ways of saying nobody has done
            anything. The second said "0 months running, everyone showed up,"
            which is a sentence congratulating a house on a streak it has not
            got. So the two halves are chosen separately: what the count means,
            then what would move it.
          */}
          <p className="text-[13px] leading-snug text-[var(--ink-soft)]">
            {board.family_streak === 0
              ? 'months running. It starts the first month every one of us finishes.'
              : `${board.family_streak === 1 ? 'month' : 'months'} running, everyone showed up.`}{' '}
            {left === 0
              ? `${month.split(' ')[0]} is in the bag.`
              : `${left === 1 ? 'One more person' : `${left} more people`} and ${month.split(' ')[0]} makes ${
                  board.family_streak + 1
                }.`}
          </p>
        </div>

        <p className="kicker mt-6 text-[11.5px] text-[var(--ink-soft)]">Tap your name to go in</p>

        <ul className="mt-3 flex flex-col gap-2.5">
          {board.people.map((person) => {
            const accent = accentFor(person.slug);
            return (
              <li key={person.slug}>
                <Link
                  href={`/h/${encodeURIComponent(token)}/${encodeURIComponent(person.slug)}`}
                  className="flex min-h-[56px] items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-3"
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[14px] font-bold"
                    style={{ background: accent, color: 'var(--on-accent)' }}
                    aria-hidden="true"
                  >
                    {initialsFor(person.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14.5px] font-semibold">{person.name}</span>
                    <span className="mt-0.5 block text-[12px] text-[var(--ink-soft)]">
                      {statusWords(person)}
                      {person.has_code ? '' : ' · code not set yet'}
                    </span>
                  </span>
                  <StatusRing status={person.status} accent={accent} />
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mt-8">
          <p className="kicker text-[11.5px] text-[var(--ink-soft)]">
            What everyone is working on
          </p>
          <div className="mt-3">
            <FamilyGoalsView key={boardKey} onNeedsCode={() => setBoardKey((n) => n + 1)} />
          </div>
        </div>
      </div>

      {explaining ? <WhatTheBoardIs onClose={() => setExplaining(false)} /> : null}
    </main>
  );
}

/**
 * The panel behind "What is this?".
 *
 * It says the privacy rule in the place a child would go looking for it, in
 * words an eleven year old can read, because a promise nobody can find is not
 * one. It behaves like a dialog for somebody not using a finger: it takes the
 * focus, gives it back, and closes on Escape.
 */
function WhatTheBoardIs({ onClose }: { onClose: () => void }) {
  const [closeEl, setCloseEl] = useState<HTMLButtonElement | null>(null);

  useEffect(() => {
    const opener = document.activeElement;
    closeEl?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, [closeEl, onClose]);

  return (
    <div
      className="fixed inset-0 z-20 overflow-y-auto bg-[var(--page)] px-5 pb-10 pt-6"
      role="dialog"
      aria-modal="true"
      aria-label="What this board is"
    >
      <div className="mx-auto w-full max-w-md">
        <p className="kicker steel text-[13px]">To a bigger life</p>
        <h1 className="display mt-2 text-[28px] uppercase leading-tight">What this board is</h1>
        <p className="mt-4 text-[15px] leading-relaxed">
          Once a month each of us sits down on our own and says honestly how things are actually
          going, and what we want to be different. Then we work on it, rather than filing it away.
        </p>
        <p className="mt-4 text-[15px] leading-relaxed text-[var(--ink-soft)]">
          This screen shows who has finished this month and when, the streak, which only goes up
          when every single one of us has done it, and the goals everyone is working on.
        </p>
        <p className="mt-4 text-[15px] leading-relaxed">
          <span className="font-semibold">The family can see your goals</span> and how they are
          going, so we can push each other on. You can send somebody a cheer. Nobody can change,
          close or comment on anybody else&apos;s goal.
        </p>
        <p className="mt-4 text-[15px] leading-relaxed">
          <span className="font-semibold">Nobody can see what you wrote or the scores you gave.</span>{' '}
          Not your brother, not your sister, not your mum, not your dad. Your answers and your scores
          are behind your own code and there is no setting that changes that.
        </p>
        <p className="mt-4 text-[15px] leading-relaxed">
          <span className="font-semibold">Any goal you mark just yours is yours alone.</span> It does
          not show up here at all, not even as a number. Everybody can do that, whatever their age.
        </p>
        <p className="mt-4 text-[15px] leading-relaxed text-[var(--ink-soft)]">
          Nothing here puts anybody above anybody else. There is no score for a person and no order
          of who has done the most. The streak is the only shared number and it only moves when all
          five of us show up.
        </p>
        <p className="mt-4 text-[15px] leading-relaxed text-[var(--ink-soft)]">
          Tap your own name, put your code in, and you are in your own space.
        </p>
        <button
          ref={setCloseEl}
          type="button"
          onClick={onClose}
          className="mt-8 w-full rounded-xl px-5 py-3 text-[15px] font-semibold"
          style={{ background: 'var(--silver)', color: 'var(--on-accent)' }}
        >
          Back to the board
        </button>
      </div>
    </div>
  );
}
