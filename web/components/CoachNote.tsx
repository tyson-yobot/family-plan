'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  acceptCoachStep,
  dismissCoachStep,
  fetchCoachNote,
  NeedsCodeError,
  type CoachNote as Note,
} from '@/lib/api';
import { monthName } from '@/lib/month';
import { Icon } from './icons';

/**
 * The private note.
 *
 * A few sentences written back to one person about what they just wrote. It is
 * the only thing in this app that says anything back, and it is the most
 * private thing on any screen: it is derived from somebody's scores and the
 * sentences behind them, which are the two things this whole app promises to
 * keep.
 *
 * So it is labelled as private in words an eleven year old can read, and it is
 * labelled every time rather than once in an onboarding screen somebody forgets.
 *
 * It fails quietly. There is no error state on this component that blames
 * anything: if there is no note, the screen says there is no note and why, and
 * the person's check-in is already saved regardless. See `writeNoteFor` in the
 * api for the other half of that promise.
 */
export function CoachNote({
  slug,
  /** Set just after a check-in, when a note is probably still being written. */
  expectSoon = false,
  onNeedsCode,
  onAccepted,
}: {
  slug: string;
  expectSoon?: boolean;
  onNeedsCode: () => void;
  onAccepted?: () => void;
}) {
  const [note, setNote] = useState<Note | null>(null);
  const [configured, setConfigured] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  const load = useCallback(async () => {
    try {
      const result = await fetchCoachNote(slug);
      setNote(result.note);
      setConfigured(result.configured);
      setLoaded(true);
      return Boolean(result.note);
    } catch (error) {
      if (error instanceof NeedsCodeError) {
        onNeedsCode();
        return true;
      }
      // Not surfaced. A note that cannot be fetched is the same to the reader
      // as a note that was never written, and neither is their problem.
      setLoaded(true);
      return true;
    }
  }, [slug, onNeedsCode]);

  useEffect(() => {
    void load();
  }, [load]);

  /*
   * Just after a check-in the note is usually still being written, so the
   * screen looks once more a few seconds later rather than making somebody
   * reload. Bounded at four tries: a note that has not arrived in half a minute
   * is not coming, and an open-ended poll would sit there forever on a phone.
   */
  useEffect(() => {
    if (!expectSoon || note || !configured) return;
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      void load().then((found) => {
        if (found || tries >= 4) clearInterval(timer);
      });
    }, 7000);
    return () => clearInterval(timer);
  }, [expectSoon, note, configured, load]);

  if (!loaded) return null;

  if (!note) {
    // Nothing to show, said honestly. Never dressed up as an error, and never
    // pretending something is coming when it is not.
    if (!configured) return null;
    if (!expectSoon) return null;
    return (
      <div className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-4">
        <p className="text-[14px] leading-relaxed text-[var(--ink-soft)]">
          Writing you something. It will be here in a moment, and your check-in is already
          saved either way.
        </p>
      </div>
    );
  }

  const accept = async () => {
    setBusy(true);
    setProblem('');
    try {
      await acceptCoachStep(slug, note.id);
      setNote({ ...note, suggested_step: null, accepted: true });
      onAccepted?.();
    } catch (error) {
      if (error instanceof NeedsCodeError) {
        onNeedsCode();
        return;
      }
      setProblem(error instanceof Error ? error.message : 'That did not save.');
    } finally {
      setBusy(false);
    }
  };

  const dismiss = async () => {
    setBusy(true);
    try {
      await dismissCoachStep(slug, note.id);
      setNote({ ...note, suggested_step: null });
    } catch (error) {
      if (error instanceof NeedsCodeError) onNeedsCode();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="mt-6 rounded-2xl border p-4"
      style={{ borderColor: 'var(--accent)', background: 'var(--accent-tint)' }}
    >
      <div className="flex items-center gap-2">
        <Icon name="lock" size={15} />
        {/*
          The privacy label, in words an eleven year old reads without help.
          Not "private" on its own, which a child can read as "special": it says
          who can see it, which is the fact that matters.
        */}
        <p className="kicker text-[11.5px]">Just for you. Nobody else can see this.</p>
      </div>

      <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed">{note.body}</p>

      <p className="mt-3 text-[12px] text-[var(--ink-soft)]">
        Written after your {monthName(note.cycle_label)} check-in.
      </p>

      {note.suggested_step ? (
        <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
          <p className="kicker text-[11px] text-[var(--ink-soft)]">One small thing to start with</p>
          <p className="mt-1.5 text-[14px] leading-snug">{note.suggested_step}</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void accept()}
              className="min-h-[44px] flex-1 rounded-xl px-4 text-[14px] font-bold disabled:opacity-60"
              style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
            >
              Add it to my board
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void dismiss()}
              className="min-h-[44px] rounded-xl border border-[var(--line)] px-4 text-[14px] font-semibold text-[var(--ink-soft)] disabled:opacity-60"
            >
              No thanks
            </button>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-[var(--ink-soft)]">
            Nothing goes on your board unless you tap it.
          </p>
        </div>
      ) : null}

      {note.accepted ? (
        <p className="mt-3 text-[13px]" style={{ color: 'var(--good)' }}>
          That is on your board now.
        </p>
      ) : null}

      {problem ? <p className="mt-2 text-[13px] text-[var(--bad)]">{problem}</p> : null}
    </div>
  );
}
