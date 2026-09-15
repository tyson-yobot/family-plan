'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { setCode, signIn, type Gate } from '@/lib/api';
import { accentFor, accentStyle, initialsFor } from '@/lib/theme';
import { Icon } from './icons';

/**
 * The door into somebody's own space.
 *
 * Two screens in one component, because they are the same screen in two states
 * and splitting them means two places to keep the explanation of what a code is
 * for. Which one somebody gets depends on whether they have a code yet, and
 * that answer comes from the server rather than from anything this page could
 * decide for itself.
 *
 * Everything written on it is aimed at the youngest person who will read it.
 * The promise it makes is one the server actually keeps: nothing behind this
 * door is readable by anybody else, and a reset gives somebody a new code
 * rather than giving anybody a way in.
 */
export function CodeGate({
  gate,
  token,
  onIn,
}: {
  gate: Gate;
  token: string;
  /** Called once a session is stored, so the space can open. */
  onIn: () => void;
}) {
  const accent = accentFor(gate.slug);
  const settingUp = !gate.has_code;

  const [code, setCodeValue] = useState('');
  const [confirm, setConfirm] = useState('');
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const [lockedFor, setLockedFor] = useState(gate.locked_for_seconds);
  const firstField = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    firstField.current?.focus();
  }, []);

  /** Counts the lockout down on screen, so nobody is left guessing how long. */
  useEffect(() => {
    if (lockedFor <= 0) return;
    const timer = window.setInterval(() => setLockedFor((left) => Math.max(0, left - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [lockedFor]);

  const onlyDigits = (value: string) => value.replace(/\D/g, '').slice(0, 4);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || lockedFor > 0) return;
    setProblem('');

    if (code.length !== 4) {
      setProblem('A code is four numbers.');
      return;
    }
    if (settingUp && confirm !== code) {
      setProblem('Those two do not match. Put the same four numbers in both.');
      return;
    }

    setBusy(true);
    try {
      if (settingUp) {
        await setCode(token, gate.slug, code);
      } else {
        await signIn(token, gate.slug, code);
      }
      onIn();
    } catch (error) {
      const locked = (error as { lockedForSeconds?: number }).lockedForSeconds ?? 0;
      if (locked > 0) setLockedFor(locked);
      setProblem(error instanceof Error ? error.message : 'That did not work just now.');
      setCodeValue('');
      setConfirm('');
      firstField.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  const field =
    'mt-2 w-full rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-4 py-3.5 text-center text-[24px] tracking-[0.6em] outline-none focus:border-[var(--accent)]';

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
          {initialsFor(gate.name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">{gate.name}</p>
          <p className="truncate text-[13px] text-[var(--ink-soft)]">Your own space</p>
        </div>
        <Link
          href={`/h/${encodeURIComponent(token)}`}
          className="-mr-2 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-[var(--line)] px-3 text-[12px] font-semibold text-[var(--silver)]"
        >
          Family
        </Link>
      </header>

      <div className="mt-10 flex flex-col items-center text-center">
        <span
          className="flex h-16 w-16 items-center justify-center rounded-2xl"
          style={{ background: 'var(--accent-tint)', color: accent }}
          aria-hidden="true"
        >
          <Icon name="lock" size={30} />
        </span>
        <h1 className="display mt-5 text-[30px] uppercase leading-none">
          {settingUp ? 'Pick your code' : `Hello, ${gate.name}`}
        </h1>
        <p className="mt-3 max-w-[300px] text-[14.5px] leading-relaxed text-[var(--ink-soft)]">
          {settingUp
            ? 'Four numbers, and they are yours. Nobody else gets to know them, and nobody else can open your space without them. Pick something you will remember but somebody watching you would not guess.'
            : 'Put your four numbers in. What you write and the scores you give are yours alone.'}
        </p>
      </div>

      <form onSubmit={onSubmit} className="mt-8">
        <label htmlFor="code" className="block text-[14px] font-medium">
          {settingUp ? 'Your new code' : 'Your code'}
        </label>
        <input
          id="code"
          ref={firstField}
          value={code}
          onChange={(event) => setCodeValue(onlyDigits(event.target.value))}
          inputMode="numeric"
          autoComplete="off"
          type="password"
          // A code is four digits and nothing else. Keeping the field itself to
          // four stops most of the ways somebody mistypes one.
          maxLength={4}
          className={field}
          disabled={lockedFor > 0}
        />

        {settingUp ? (
          <div className="mt-5">
            <label htmlFor="confirm" className="block text-[14px] font-medium">
              And again, so a typo does not lock you out
            </label>
            <input
              id="confirm"
              value={confirm}
              onChange={(event) => setConfirm(onlyDigits(event.target.value))}
              inputMode="numeric"
              autoComplete="off"
              type="password"
              maxLength={4}
              className={field}
            />
          </div>
        ) : null}

        {problem ? (
          <p className="mt-4 text-[14px] font-medium leading-snug" style={{ color: 'var(--bad)' }}>
            {problem}
          </p>
        ) : null}

        {lockedFor > 0 ? (
          <p className="mt-2 text-[13.5px] leading-snug text-[var(--ink-soft)]">
            Try again in {lockedFor < 60 ? `${lockedFor} seconds` : `${Math.ceil(lockedFor / 60)} minutes`}.
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy || lockedFor > 0}
          className="mt-7 w-full rounded-xl px-5 py-3.5 text-[15px] font-bold disabled:opacity-50"
          style={{ background: accent, color: 'var(--on-accent)' }}
        >
          {busy ? 'One moment' : settingUp ? 'Save my code and go in' : 'Go in'}
        </button>
      </form>

      {/*
        Who to ask when a code is forgotten, and it cannot be the same sentence
        for everybody: telling Tyson to ask Tyson is the kind of line that makes
        somebody stop trusting the rest of the screen. He has a way in from the
        laptop instead, named here so it is findable rather than folklore.
      */}
      <p className="mt-6 text-[13px] leading-relaxed text-[var(--ink-soft)]">
        {gate.slug === 'tyson'
          ? 'Nobody can clear this one for you. If you forget it, run reset-code.ts in the api folder on the laptop and pick a new one. It does not reveal the old one either.'
          : settingUp
            ? 'If you ever forget it, ask Tyson. He can clear it so you can pick a new one. He cannot see the old one and clearing it does not let him read anything of yours.'
            : 'Forgotten it? Ask Tyson to clear it and you can pick a new one. He cannot see your old code, and clearing it does not let him read your answers.'}
      </p>
    </main>
  );
}
