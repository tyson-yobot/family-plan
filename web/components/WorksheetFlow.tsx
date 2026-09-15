'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchDraft,
  fetchForm,
  saveDraft,
  submitWorksheet,
  type FormInfo,
  type GoalStatusEntry,
  type StoredDraft,
} from '@/lib/api';
import { accentStyle, accentFor, initialsFor } from '@/lib/theme';
import { partsForSections, type Part, type Unit } from '@/lib/chunks';
import {
  areaIcon,
  GOAL_ICON,
  LOOP_ICON,
  MY_AREA_ICON,
  NOTE_ICON,
  sectionGuide,
} from '@/lib/guide';
import {
  NOTE_TO_SELF_LABEL,
  VOICE_TYPING_HINT,
  WORKSHEETS,
  type Section,
} from '@/lib/worksheets';
import { Card, ChoicePicker, Framing, ScorePicker, TextAnswer, needsNudge } from './fields';
import { Icon, IconBadge } from './icons';
import { FinishMark, SectionDone } from './Celebrate';
import { WhatThisIs } from './WhatThisIs';

const GOAL_STATUSES = ['Done', 'Partly', 'Not yet'] as const;

type Payload = Record<string, any>;

interface Step {
  kind: 'overview' | 'note' | 'intro' | 'loop' | 'section' | 'review';
  /** Index into the worksheet's sections, for section steps only. */
  index?: number;
  /** Which screen of that section this is, for section steps only. */
  part?: number;
  /** How many screens that section is asked over, for section steps only. */
  partCount?: number;
}

/** Turns 2026-09 into "September 2026", because nobody says "cycle label". */
function monthName(cycleLabel: string): string {
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

/** The keys the page uses to remember where someone was. Never submitted. */
const UI_KEY = '_ui';

function stripUiState(payload: Payload): Payload {
  const copy = { ...payload };
  delete copy[UI_KEY];
  return copy;
}

export function WorksheetFlow({ token }: { token: string }) {
  const [info, setInfo] = useState<FormInfo | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'invalid' | 'failed' | 'ready'>(
    'loading',
  );
  const [loadError, setLoadError] = useState<string>('');

  const [staleDraft, setStaleDraft] = useState<StoredDraft | null>(null);
  const [payload, setPayload] = useState<Payload>({});
  const [startedAt, setStartedAt] = useState<string>('');
  const [stepIndex, setStepIndex] = useState(0);
  /**
   * Whether their own note from last time is part of this run. Decided once,
   * when the worksheet opens, and then left alone. If this were recomputed from
   * the answers so far, the list of steps would change shape the moment the
   * first answer was saved and every step index after it would shift by one,
   * which silently skipped the intro screen.
   */
  const [showNote, setShowNote] = useState(false);
  /**
   * Whether the "what a check-in is" screen leads this run. Decided once, on
   * the same reasoning as showNote above: anything that changes the number of
   * steps has to be settled before the first one is shown, or every step index
   * after it shifts underneath somebody who is part way through.
   *
   * It is decided from whether this person has ever had a submission or a
   * draft, never from a flag that has to be remembered and set correctly. A
   * flag can be wrong; having written something before cannot.
   */
  const [showOverview, setShowOverview] = useState(false);
  /** Open when somebody asks to see that screen again from inside the check-in. */
  const [overviewOpen, setOverviewOpen] = useState(false);
  /**
   * The section just finished, if the previous continue was the last screen of
   * one. Cleared by the banner itself once it has had its few seconds.
   */
  const [justFinished, setJustFinished] = useState<{ title: string; index: number } | null>(null);
  /** Set only when someone deliberately redoes a month they have already sent. */
  const [startingAgain, setStartingAgain] = useState(false);
  /** True when this page picked up a half-finished worksheet for this month. */
  const [resumedThisMonth, setResumedThisMonth] = useState(false);
  /**
   * Whether the person has actually answered something. The worksheet fills in
   * what carries over from last time as soon as it opens, so without this the
   * autosave below would write a draft for anyone who merely opened their link,
   * and the parent view would report them as having started.
   */
  const [touched, setTouched] = useState(false);
  /**
   * Bumped whenever the answers are cleared and started again. Without it the
   * effect below runs once and never again, so clearing the answers also threw
   * away everything carried over from last time: the name of their own area,
   * the goals waiting to be closed, and the owner on each adult goal. The
   * worksheet then refused to move past a section over a field the person was
   * never shown.
   */
  const [freshStarts, setFreshStarts] = useState(0);

  const [problems, setProblems] = useState<Record<string, string>>({});
  const [blurred, setBlurred] = useState<Record<string, true>>({});
  const [nudgeShown, setNudgeShown] = useState<Record<string, true>>({});
  const [nudgeDone, setNudgeDone] = useState<Record<string, true>>({});

  const [saveProblem, setSaveProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const topRef = useRef<HTMLDivElement | null>(null);

  // Load the worksheet and whatever was saved last time.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await fetchForm(token);
        if (cancelled) return;
        if (!loaded) {
          setLoadState('invalid');
          return;
        }
        const draft = await fetchDraft(token);
        if (cancelled) return;

        setInfo(loaded);
        if (draft && draft.cycle_label === loaded.current_cycle_label) {
          // Same month, so pick up exactly where they left off, with the same
          // shape of worksheet they were part way through.
          const ui = (draft.payload as Payload)?.[UI_KEY];
          setPayload(draft.payload ?? {});
          setStartedAt(draft.started_at);
          setShowNote(Boolean(ui?.showNote));
          setShowOverview(Boolean(ui?.showOverview));
          setStepIndex(Number(ui?.step ?? 0));
          setResumedThisMonth(true);
        } else if (draft) {
          // A draft from a previous month. Never resumed and never discarded
          // without asking.
          setStaleDraft(draft);
        } else {
          setStartedAt(new Date().toISOString());
          setShowNote(Boolean(loaded.note_to_self));
          // Nothing finished and nothing started, so this is genuinely somebody
          // opening their first check-in. Anybody else goes straight to it and
          // reaches the same screen from the header when they want it.
          setShowOverview(!loaded.has_earlier_submissions && !loaded.submitted_this_cycle);
        }
        setLoadState('ready');
      } catch (error) {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : 'Something went wrong.');
        setLoadState('failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const worksheet = info ? WORKSHEETS[info.template_type] : null;
  const accent = info ? accentFor(info.slug) : '#334155';

  /**
   * Each section cut into the two or three question screens it should be asked
   * over. Worked out from the worksheet alone, never from the answers, so the
   * list of steps is the same shape on the way out as it was on the way in and
   * a half-finished check-in resumes in the right place.
   */
  const sectionParts: Part[][] = useMemo(
    () => (worksheet ? partsForSections(worksheet.sections) : []),
    [worksheet],
  );

  const steps: Step[] = useMemo(() => {
    if (!info || !worksheet) return [];
    const list: Step[] = [];
    // What this is comes first, and only for somebody who has never used it.
    if (showOverview) list.push({ kind: 'overview' });
    // Their own note from last time comes before anything else, on a worksheet
    // they are opening rather than returning to.
    if (showNote && info.note_to_self) list.push({ kind: 'note' });
    list.push({ kind: 'intro' });
    list.push({ kind: 'loop' });
    worksheet.sections.forEach((_, index) => {
      const partCount = sectionParts[index]?.length ?? 1;
      for (let part = 0; part < partCount; part++) {
        list.push({ kind: 'section', index, part, partCount });
      }
    });
    list.push({ kind: 'review' });
    return list;
  }, [info, worksheet, showNote, showOverview, sectionParts]);

  const step = steps[Math.min(stepIndex, Math.max(steps.length - 1, 0))];

  /**
   * How many screens the check-in itself is, which is what the "what this is"
   * screen promises. Counted from the real list rather than written down, so it
   * cannot drift, and it never counts the explanation screen as part of it.
   */
  const screenCount = Math.max(steps.filter((entry) => entry.kind !== 'overview').length, 1);

  // Fill in what carries over from last time, once, when the worksheet opens.
  useEffect(() => {
    if (!info || staleDraft) return;
    setPayload((current) => {
      const next = { ...current };
      let changed = false;
      if (info.previous_goals.length > 0 && !Array.isArray(next.goal_status)) {
        next.goal_status = info.previous_goals.map((goal) => ({
          goal,
          status: '',
          reflection: '',
        }));
        changed = true;
      }
      if (info.my_area && (!next.my_area || !next.my_area.name)) {
        next.my_area = { ...(next.my_area ?? {}), name: info.my_area };
        changed = true;
      }
      // Each goal is owned by the person writing it unless they change it. The
      // default has to be a real stored answer, not just something on screen:
      // showing a name in the box while the answer underneath was empty made
      // the worksheet refuse to move on over a field that looked filled in.
      if (info.template_type === 'adult' && !Array.isArray(next.goals)) {
        next.goals = [0, 1, 2].map(() => ({ owner: info.name }));
        changed = true;
      }
      return changed ? next : current;
    });
  }, [info, staleDraft, freshStarts]);

  /**
   * Once someone answers a field that was flagged as missing, the message has
   * to go. Leaving it up tells them something is still wrong when it is not,
   * and it also hides the short-answer nudge behind it.
   */
  const markTouched = useCallback(() => setTouched(true), []);

  const clearProblem = useCallback((key: string) => {
    setProblems((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }, []);

  const setValue = useCallback(
    (key: string, value: unknown) => {
      setPayload((current) => ({ ...current, [key]: value }));
      clearProblem(key);
      markTouched();
    },
    [clearProblem, markTouched],
  );

  const setArea = useCallback(
    (areaId: string, part: 'score' | 'reason', value: unknown) => {
      setPayload((current) => ({
        ...current,
        areas: {
          ...(current.areas ?? {}),
          [areaId]: { ...(current.areas?.[areaId] ?? {}), [part]: value },
        },
      }));
      clearProblem(`area.${areaId}.${part}`);
      markTouched();
    },
    [clearProblem, markTouched],
  );

  const setMyArea = useCallback(
    (part: 'name' | 'score' | 'reason', value: unknown) => {
      setPayload((current) => ({
        ...current,
        my_area: { ...(current.my_area ?? {}), [part]: value },
      }));
      clearProblem(`my_area.${part}`);
      markTouched();
    },
    [clearProblem, markTouched],
  );

  const setGoal = useCallback((row: number, part: string, value: string) => {
    setPayload((current) => {
      const goals = Array.isArray(current.goals) ? [...current.goals] : [{}, {}, {}];
      while (goals.length < 3) goals.push({});
      goals[row] = { ...goals[row], [part]: value };
      return { ...current, goals };
    });
    clearProblem(`goal.${row}.${part}`);
    markTouched();
  }, [clearProblem, markTouched]);

  const setGoalStatus = useCallback((row: number, part: 'status' | 'reflection', value: string) => {
    setPayload((current) => {
      const list: GoalStatusEntry[] = Array.isArray(current.goal_status)
        ? [...current.goal_status]
        : [];
      list[row] = { ...list[row], [part]: value } as GoalStatusEntry;
      return { ...current, goal_status: list };
    });
    if (part === 'status') clearProblem(`status.${row}`);
    markTouched();
  }, [clearProblem, markTouched]);

  /**
   * The questions actually on this screen, now that a section is asked over
   * several. Everything below checks and nudges against this rather than the
   * whole section, so nobody is told to answer something they have not been
   * shown yet.
   */
  const unitsOn = useCallback(
    (current: Step | undefined): Unit[] => {
      if (!current || current.kind !== 'section') return [];
      return sectionParts[current.index ?? 0]?.[current.part ?? 0] ?? [];
    },
    [sectionParts],
  );

  /** Every field on this step that gets the short-answer nudge. */
  const nudgeKeysFor = useCallback(
    (current: Step | undefined): { key: string; value: string }[] => {
      if (!current || !worksheet) return [];
      const keys: { key: string; value: string }[] = [];
      if (current.kind === 'loop') {
        const list: GoalStatusEntry[] = payload.goal_status ?? [];
        list.forEach((entry, i) =>
          keys.push({ key: `reflection.${i}`, value: entry?.reflection ?? '' }),
        );
        keys.push({ key: 'try_differently', value: payload.try_differently ?? '' });
      }
      if (current.kind === 'section') {
        for (const unit of unitsOn(current)) {
          if (unit.kind !== 'field') continue;
          const field = unit.field;
          if (field.kind === 'area') {
            keys.push({ key: `area.${field.id}.reason`, value: payload.areas?.[field.id]?.reason ?? '' });
          }
          if (field.kind === 'my_area') {
            keys.push({ key: 'my_area.reason', value: payload.my_area?.reason ?? '' });
          }
        }
      }
      return keys;
    },
    [payload, unitsOn, worksheet],
  );

  /** Required-field check for the step being left. Returns the problems found. */
  const checkStep = useCallback(
    (current: Step | undefined): Record<string, string> => {
      if (!current || !info || !worksheet) return {};
      const found: Record<string, string> = {};

      if (current.kind === 'loop' && info.previous_goals.length > 0) {
        const list: GoalStatusEntry[] = payload.goal_status ?? [];
        info.previous_goals.forEach((_, i) => {
          if (!list[i]?.status) found[`status.${i}`] = 'Pick one of the three.';
        });
        if (info.template_type !== 'adult') {
          const status = list[0]?.status;
          if ((status === 'Partly' || status === 'Not yet') && !(payload.try_differently ?? '').trim()) {
            found.try_differently = 'This one needs an answer.';
          }
        }
      }

      if (current.kind === 'section') {
        // Only what is on this screen. The same rules as before, asked a few at
        // a time: nothing became optional and nothing new became required.
        for (const unit of unitsOn(current)) {
          if (unit.kind === 'goal') {
            const row = payload.goals?.[unit.row] ?? {};
            const i = unit.row;
            if (!(row.goal ?? '').trim()) found[`goal.${i}.goal`] = 'This goal needs writing down.';
            if (!(row.owner ?? '').trim()) found[`goal.${i}.owner`] = 'Who owns this one?';
            if (!(row.due_date ?? '').trim()) found[`goal.${i}.due_date`] = 'Give it a date.';
            if (!(row.first_action ?? '').trim()) {
              found[`goal.${i}.first_action`] = 'What is the first action this week?';
            }
            continue;
          }
          const field = unit.field;
          if (field.kind === 'area') {
            const entry = payload.areas?.[field.id] ?? {};
            if (typeof entry.score !== 'number') found[`area.${field.id}.score`] = 'Pick a score.';
            if (!(entry.reason ?? '').trim()) {
              found[`area.${field.id}.reason`] = 'One sentence on why, please.';
            }
          }
          if (field.kind === 'my_area') {
            const area = payload.my_area ?? {};
            if (!(area.name ?? '').trim()) found['my_area.name'] = 'Name the one thing that is yours.';
            if (typeof area.score !== 'number') found['my_area.score'] = 'Pick a score.';
            if (!(area.reason ?? '').trim()) found['my_area.reason'] = 'A short reason, please.';
          }
          if (field.kind === 'choice') {
            if (!(payload[field.id] ?? '')) found[field.id] = 'Pick one of the three.';
          }
          if (field.kind === 'text' && field.required) {
            if (!(payload[field.id] ?? '').trim()) found[field.id] = 'This one needs an answer.';
          }
        }
      }

      return found;
    },
    [info, payload, unitsOn, worksheet],
  );

  /** Returns whether the answers actually reached the server. */
  const persist = useCallback(
    async (nextPayload: Payload, nextStep: number): Promise<boolean> => {
      if (!info || !startedAt) {
        // Not a silent no-op. Saying nothing here looks exactly like a save
        // that worked, and the answers would be gone with the tab.
        setSaveProblem(
          'Your answers could not be saved because this page did not open properly. ' +
            'Open your link again before writing any more.',
        );
        return false;
      }
      const toSave = { ...nextPayload, [UI_KEY]: { step: nextStep, showNote, showOverview } };
      try {
        await saveDraft(token, {
          cycle_label: info.current_cycle_label,
          payload: toSave,
          started_at: startedAt,
        });
        setSaveProblem('');
        return true;
      } catch {
        setSaveProblem(
          'Your answers could not be saved just now. They are still on this screen. ' +
            'Press continue again in a moment.',
        );
        return false;
      }
    },
    [info, showNote, showOverview, startedAt, token],
  );

  const goTo = useCallback((next: number) => {
    setStepIndex(next);
    setProblems({});
    topRef.current?.scrollIntoView({ block: 'start' });
    window.scrollTo({ top: 0 });
  }, []);

  const onContinue = useCallback(async () => {
    const found = checkStep(step);
    // The short-answer nudge is shown here too, but it never holds anyone up.
    const shortOnes = nudgeKeysFor(step).filter((entry) => needsNudge(entry.value));
    if (Object.keys(found).length > 0) {
      setProblems(found);
      setNudgeShown((current) => {
        const next = { ...current };
        for (const entry of shortOnes) next[entry.key] = true;
        return next;
      });
      // Take them to the first thing that still needs an answer, rather than
      // leaving them at the bottom of the page wondering why nothing happened.
      window.setTimeout(() => {
        document
          .querySelector('[data-problem]')
          ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, 50);
      return;
    }

    // Passed this step, so any nudge on it has had its one showing.
    setNudgeDone((current) => {
      const next = { ...current };
      for (const entry of shortOnes) next[entry.key] = true;
      return next;
    });

    const nextStep = Math.min(stepIndex + 1, steps.length - 1);
    setBusy(true);
    const nextPayload = { ...payload, [UI_KEY]: { step: nextStep, showNote, showOverview } };
    setPayload(nextPayload);
    const saved = await persist(nextPayload, nextStep);
    setBusy(false);
    // Only move on once the answers are safely stored. Advancing anyway turns
    // "press continue again" into a save of the next step rather than a retry
    // of the one that failed, and the failed step's answers are then lost with
    // the tab.
    if (!saved) return;

    // Leaving the last screen of a section is the moment a section is finished,
    // and it is worth marking. Marked on the way out rather than on arrival so
    // that stepping backwards through the check-in never congratulates anybody
    // for something they have not just done.
    const finishedSection =
      step?.kind === 'section' && (step.part ?? 0) === (step.partCount ?? 1) - 1
        ? {
            title: worksheet?.sections[step.index ?? 0]?.title ?? '',
            index: step.index ?? 0,
          }
        : null;
    setJustFinished(finishedSection);
    goTo(nextStep);
  }, [
    checkStep,
    goTo,
    nudgeKeysFor,
    payload,
    persist,
    showNote,
    showOverview,
    step,
    stepIndex,
    steps.length,
    worksheet,
  ]);

  const onBack = useCallback(async () => {
    // Going back saves too. Editing an earlier section and then leaving used to
    // discard the edit, while the page still showed it.
    const previousStep = Math.max(stepIndex - 1, 0);
    // Stepping backwards is not finishing anything, so the banner goes.
    setJustFinished(null);
    setBusy(true);
    await persist(payload, previousStep);
    setBusy(false);
    goTo(previousStep);
  }, [goTo, payload, persist, stepIndex]);

  /** Saves without moving, for answers written on the review screen. */
  const saveInPlace = useCallback(async () => {
    await persist(payload, stepIndex);
  }, [payload, persist, stepIndex]);

  /**
   * Saves a couple of seconds after the last thing anyone typed or tapped.
   *
   * Saving on continue alone is not enough on its own: going back to an earlier
   * section, changing an answer and then putting the phone down loses the
   * change, because the next save is the one that carries it and it never
   * happens. Nobody should have to press a button to keep what they wrote.
   */
  useEffect(() => {
    if (loadState !== 'ready' || staleDraft || submitted || !startedAt) return;
    if (!touched) return;
    const timer = window.setTimeout(() => {
      void persist(payload, stepIndex);
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [loadState, payload, persist, staleDraft, startedAt, stepIndex, submitted, touched]);

  const onSubmit = useCallback(async () => {
    if (!info) return;
    setBusy(true);
    setSaveProblem('');
    try {
      await submitWorksheet(token, {
        cycle_label: info.current_cycle_label,
        payload: stripUiState(payload),
        started_at: startedAt,
      });
      setSubmitted(true);
      window.scrollTo({ top: 0 });
    } catch (error) {
      setSaveProblem(error instanceof Error ? error.message : 'It could not be submitted.');
    } finally {
      setBusy(false);
    }
  }, [info, payload, startedAt, token]);

  const nudgeFor = useCallback(
    (key: string, value: string | undefined) =>
      needsNudge(value) && !nudgeDone[key] && (Boolean(blurred[key]) || Boolean(nudgeShown[key])),
    [blurred, nudgeDone, nudgeShown],
  );

  const markBlurred = useCallback((key: string) => {
    setBlurred((current) => ({ ...current, [key]: true }));
  }, []);

  if (loadState === 'loading') {
    return (
      <main className="mx-auto max-w-md px-5 py-16">
        <p className="text-[15px] text-[var(--ink-soft)]">Opening your check-in.</p>
      </main>
    );
  }

  if (loadState === 'invalid') {
    return (
      <main className="mx-auto max-w-md px-5 py-16">
        <p className="text-[17px]">This link isn&apos;t valid.</p>
      </main>
    );
  }

  if (loadState === 'failed' || !info || !worksheet) {
    return (
      <main className="mx-auto max-w-md px-5 py-16">
        <p className="text-[17px]">Your check-in could not be opened just now.</p>
        <p className="mt-2 text-[15px] text-[var(--ink-soft)]">{loadError}</p>
      </main>
    );
  }

  const sectionCount = worksheet.sections.length;

  // A draft from an earlier month. Asked about before anything is rendered.
  if (staleDraft) {
    return (
      <Shell info={info} accent={accent} progress={null} screenCount={screenCount}>
        <h1 className="text-[22px] font-semibold leading-tight">You have an unfinished one</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-[var(--ink-soft)]">
          You started a check-in for {monthName(staleDraft.cycle_label)} and did not finish it.
          It is {monthName(info.current_cycle_label)} now. You can pick that one up, or start
          this month fresh.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            className="rounded-xl px-4 py-3 text-[15px] font-semibold text-white"
            style={{ background: accent }}
            onClick={() => {
              setPayload(staleDraft.payload ?? {});
              setStartedAt(staleDraft.started_at);
              // Restarted from the top, so their note from last time belongs
              // at the front of this run just as it would on a fresh one.
              setShowNote(Boolean(info.note_to_self));
              // They have started one before, whatever month it was for, so
              // the explanation screen is not forced on them again.
              setShowOverview(false);
              setStepIndex(0);
              setStaleDraft(null);
            }}
          >
            Pick up the unfinished one
          </button>
          <button
            type="button"
            className="rounded-xl border border-[var(--line)] bg-[var(--card)] px-4 py-3 text-[15px] font-semibold"
            onClick={() => {
              setPayload({});
              setFreshStarts((n) => n + 1);
              setStartedAt(new Date().toISOString());
              setShowNote(Boolean(info.note_to_self));
              setShowOverview(false);
              setStepIndex(0);
              setStaleDraft(null);
            }}
          >
            Start {monthName(info.current_cycle_label)} fresh
          </button>
        </div>
      </Shell>
    );
  }

  if (submitted) {
    // The statuses they just filled in are the ones that describe last
    // cycle's goals, so they are what "last time" means here. info.last_cycle_status
    // is one cycle older again, and is only a fallback.
    const closedThisTime: GoalStatusEntry[] = Array.isArray(payload.goal_status)
      ? payload.goal_status
      : (info.last_cycle_status ?? []);
    const doneGoal = closedThisTime.find((entry) => entry.status === 'Done');
    return (
      <Shell info={info} accent={accent} progress={null} screenCount={screenCount}>
        {/*
          The one place in the whole check-in that is allowed to be a moment.
          It says the same thing to somebody who scored themselves low as to
          somebody who scored high, because what it is pleased about is that
          they sat down and finished it.
        */}
        <div className="lift-in flex flex-col items-center py-4 text-center">
          <FinishMark size={72} />
          <h1 className="mt-5 text-[24px] font-semibold leading-tight">
            That is {monthName(info.current_cycle_label)} done, {info.name}
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-[var(--ink-soft)]">
            Sitting down and answering all of that honestly is the hard part, and you just did
            it. See you next month.
          </p>
        </div>
        {doneGoal ? (
          <p className="mt-6 text-[15px] leading-relaxed text-[var(--ink-soft)]">
            Last time, you finished this: {doneGoal.goal}
          </p>
        ) : null}
        {info.last_initiative_note ? (
          <p className="mt-3 text-[15px] leading-relaxed text-[var(--ink-soft)]">
            Last time, you also did this on your own: {info.last_initiative_note}
          </p>
        ) : null}
      </Shell>
    );
  }

  // Already finished this month. Without this the worksheet reopens blank, with
  // nothing to say it is done, and filling it in again quietly files a second
  // set of answers for the same month.
  // Work in progress for this month wins over the "already done" screen. Someone
  // part way through redoing a month would otherwise be sent back to "there is
  // nothing to do" on every reload, with no sign of the answers they had
  // already rewritten.
  if (info.submitted_this_cycle && !startingAgain && !resumedThisMonth) {
    return (
      <Shell info={info} accent={accent} progress={null} screenCount={screenCount}>
        <div className="flex items-center gap-3">
          <FinishMark size={44} />
          <h1 className="text-[22px] font-semibold leading-tight">
            {monthName(info.current_cycle_label)} is done
          </h1>
        </div>
        <p className="mt-4 text-[15px] leading-relaxed text-[var(--ink-soft)]">
          You sent this month&apos;s check-in on{' '}
          {new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'long' }).format(
            new Date(info.submitted_this_cycle.submitted_at),
          )}
          . There is nothing else to do until next month.
        </p>
        <button
          type="button"
          onClick={() => {
            setStartingAgain(true);
            setPayload({});
            setFreshStarts((n) => n + 1);
            setStartedAt(new Date().toISOString());
            setShowNote(false);
            setShowOverview(false);
            setStepIndex(0);
          }}
          className="mt-6 text-[15px] font-semibold underline"
          style={{ color: accent }}
        >
          Fill this month in again
        </button>
        <p className="mt-2 text-[13px] leading-relaxed text-[var(--ink-soft)]">
          Only if you want to change what you sent. Your first answers are kept either way.
        </p>
      </Shell>
    );
  }

  /**
   * What the progress indicator shows.
   *
   * The bar is the whole check-in rather than the section, so it moves on every
   * screen instead of once per section. Section one used to be eleven questions
   * on one page with a bar that did not budge until all eleven were answered,
   * which made a long screen feel like a stalled one.
   *
   * The words under it still name the section, because that is what somebody
   * wants to know when they put the phone down and pick it up again.
   */
  const firstAnsweringStep = steps.findIndex((entry) => entry.kind === 'loop');
  const reviewStep = steps.findIndex((entry) => entry.kind === 'review');
  const progress =
    step?.kind === 'section'
      ? {
          section: (step.index ?? 0) + 1,
          sectionTotal: sectionCount,
          part: (step.part ?? 0) + 1,
          partCount: step.partCount ?? 1,
          // Counted from the first screen that asks for anything to the review.
          fraction:
            reviewStep > firstAnsweringStep
              ? (stepIndex - firstAnsweringStep) / (reviewStep - firstAnsweringStep)
              : 0,
        }
      : null;

  return (
    <Shell
      info={info}
      accent={accent}
      progress={progress}
      topRef={topRef}
      screenCount={screenCount}
      overviewOpen={overviewOpen}
      onOpenOverview={() => setOverviewOpen(true)}
      onCloseOverview={() => setOverviewOpen(false)}
    >
      {justFinished ? (
        <SectionDone
          title={justFinished.title}
          index={justFinished.index}
          onDone={() => setJustFinished(null)}
        />
      ) : null}

      {step?.kind === 'overview' ? (
        <WhatThisIs template={info.template_type} screenCount={screenCount} />
      ) : null}

      {step?.kind === 'note' ? (
        <div>
          <h1 className="text-[22px] font-semibold leading-tight">
            You left yourself a note last time
          </h1>
          <div className="mt-4">
            <Card icon={NOTE_ICON}>
              <p className="text-[15px] leading-relaxed">{info.note_to_self}</p>
            </Card>
          </div>
        </div>
      ) : null}

      {step?.kind === 'intro' ? (
        <div>
          <h1 className="text-[22px] font-semibold leading-tight">
            {monthName(info.current_cycle_label)}, {info.name}
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed">{worksheet.intro}</p>
          <p className="mt-4 text-[14px] leading-relaxed text-[var(--ink-soft)]">
            {VOICE_TYPING_HINT}
          </p>
        </div>
      ) : null}

      {step?.kind === 'loop' ? (
        <div className="flex flex-col gap-5">
          {info.previous_goals.length > 0 ? (
            <>
              <div>
                <div className="flex items-center gap-3">
                  <IconBadge name={LOOP_ICON} size={40} />
                  <h1 className="text-[22px] font-semibold leading-tight">Closing the loop</h1>
                </div>
                <p className="mt-3 text-[15px] leading-relaxed text-[var(--ink-soft)]">
                  {worksheet.doneMeans}
                </p>
              </div>
              {info.previous_goals.map((goal, i) => {
                const entry: GoalStatusEntry = payload.goal_status?.[i] ?? {
                  goal,
                  status: '',
                  reflection: '',
                };
                return (
                  <Card key={`${goal}-${i}`}>
                    <p className="text-[15px] font-medium leading-snug">{goal}</p>
                    <div className="mt-3">
                      <ChoicePicker
                        label="How did it go?"
                        options={[...GOAL_STATUSES]}
                        value={entry.status || undefined}
                        onChange={(value) => setGoalStatus(i, 'status', value)}
                        problem={problems[`status.${i}`]}
                      />
                    </div>
                    <div className="mt-4">
                      <TextAnswer
                        label="What happened, in one line (optional)"
                        value={entry.reflection ?? ''}
                        onChange={(value) => setGoalStatus(i, 'reflection', value)}
                        onBlur={() => markBlurred(`reflection.${i}`)}
                        nudge={nudgeFor(`reflection.${i}`, entry.reflection)}
                      />
                    </div>
                  </Card>
                );
              })}
              {info.template_type !== 'adult' &&
              (payload.goal_status?.[0]?.status === 'Partly' ||
                payload.goal_status?.[0]?.status === 'Not yet') ? (
                <Card>
                  <TextAnswer
                    label={worksheet.tryDifferentlyLabel ?? ''}
                    value={payload.try_differently ?? ''}
                    onChange={(value) => setValue('try_differently', value)}
                    onBlur={() => markBlurred('try_differently')}
                    problem={problems.try_differently}
                    nudge={nudgeFor('try_differently', payload.try_differently)}
                    long
                  />
                </Card>
              ) : null}
            </>
          ) : (
            <div>
              <div className="flex items-center gap-3">
                <IconBadge name={LOOP_ICON} size={40} />
                <h1 className="text-[22px] font-semibold leading-tight">Before you start</h1>
              </div>
              <p className="mt-3 text-[15px] leading-relaxed text-[var(--ink-soft)]">
                {info.has_earlier_submissions
                  ? 'There is no goal to look back on, because none was written down last time. Writing one down this month gives you something to check against next month.'
                  : 'This is your first one, so there is nothing to look back on yet. Next time there will be.'}
              </p>
            </div>
          )}
          <Card>
            <TextAnswer
              label={`${worksheet.initiativeLabel} (optional)`}
              value={payload.went_beyond ?? ''}
              onChange={(value) => setValue('went_beyond', value)}
              long
            />
          </Card>
        </div>
      ) : null}

      {step?.kind === 'section' ? (
        <SectionView
          section={worksheet.sections[step.index ?? 0]}
          sectionIndex={step.index ?? 0}
          units={unitsOn(step)}
          part={step.part ?? 0}
          partCount={step.partCount ?? 1}
          isFirstSection={(step.index ?? 0) === 0}
          info={info}
          payload={payload}
          problems={problems}
          nudgeFor={nudgeFor}
          markBlurred={markBlurred}
          setValue={setValue}
          setArea={setArea}
          setMyArea={setMyArea}
          setGoal={setGoal}
        />
      ) : null}

      {step?.kind === 'review' ? (
        <ReviewView
          info={info}
          payload={payload}
          accent={accent}
          onEdit={(target) => {
            setJustFinished(null);
            goTo(target);
          }}
          steps={steps}
          onNoteChange={(value) => setValue('note_to_self', value)}
          onNoteBlur={saveInPlace}
        />
      ) : null}

      {saveProblem ? (
        <p className="mt-5 text-[14px] font-medium leading-snug text-[#B3261E]">{saveProblem}</p>
      ) : null}

      <div className="mt-8 flex items-center gap-3 pb-4">
        {stepIndex > 0 ? (
          <button
            type="button"
            onClick={onBack}
            className="rounded-xl border border-[var(--line)] bg-[var(--card)] px-5 py-3 text-[15px] font-semibold"
          >
            Back
          </button>
        ) : null}
        {step?.kind === 'review' ? (
          <button
            type="button"
            onClick={onSubmit}
            disabled={busy}
            className="flex-1 rounded-xl px-5 py-3 text-[15px] font-semibold text-white disabled:opacity-60"
            style={{ background: accent }}
          >
            {busy ? 'Submitting' : 'Submit worksheet'}
          </button>
        ) : (
          <button
            type="button"
            onClick={onContinue}
            disabled={busy}
            className="flex-1 rounded-xl px-5 py-3 text-[15px] font-semibold text-white disabled:opacity-60"
            style={{ background: accent }}
          >
            {busy ? 'Saving' : 'Continue'}
          </button>
        )}
      </div>
    </Shell>
  );
}

interface Progress {
  section: number;
  sectionTotal: number;
  part: number;
  partCount: number;
  /** How far through the whole check-in, 0 to 1. */
  fraction: number;
}

function Shell({
  info,
  accent,
  progress,
  topRef,
  screenCount,
  overviewOpen,
  onOpenOverview,
  onCloseOverview,
  children,
}: {
  info: FormInfo;
  accent: string;
  progress: Progress | null;
  topRef?: React.RefObject<HTMLDivElement | null>;
  screenCount?: number;
  overviewOpen?: boolean;
  onOpenOverview?: () => void;
  onCloseOverview?: () => void;
  children: React.ReactNode;
}) {
  return (
    <main
      className="mx-auto w-full max-w-md px-5 pb-10 pt-6"
      // Their own colour, and everything derived from it, for this whole page.
      style={accentStyle(accent) as React.CSSProperties}
    >
      <div ref={topRef} />
      <header className="flex items-center gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[16px] font-semibold text-white"
          style={{ background: accent }}
          aria-hidden="true"
        >
          {initialsFor(info.name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">{info.name}</p>
          <p className="truncate text-[13px] text-[var(--ink-soft)]">
            This month, {monthName(info.current_cycle_label)}
          </p>
        </div>
        {onOpenOverview ? (
          // The explanation screen stays reachable for everybody, not only on
          // somebody's very first go. A first-timer sees it and then never
          // finds it again is the same as not having written it.
          <button
            type="button"
            onClick={onOpenOverview}
            className="-mr-2 flex min-w-[44px] items-center justify-center gap-1.5 rounded-xl px-2 text-[13px] font-semibold"
            style={{ color: 'var(--accent-ink)' }}
          >
            <Icon name="message" size={18} />
            <span>What is this?</span>
          </button>
        ) : null}
      </header>

      {progress ? (
        <div className="mt-5">
          {/*
            The section's name is the heading immediately below this, so saying
            it here as well is the same words twice on a small screen. This says
            where you are instead: which section, and which screen of it.
          */}
          <div className="flex items-baseline justify-between gap-3">
            <p className="min-w-0 truncate text-[13px] font-medium text-[var(--ink-soft)]">
              Section {progress.section} of {progress.sectionTotal}
            </p>
            {progress.partCount > 1 ? (
              <p className="shrink-0 text-[13px] text-[var(--ink-soft)]">
                Screen {progress.part} of {progress.partCount}
              </p>
            ) : null}
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--line)]">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{
                background: accent,
                width: `${Math.max(3, Math.min(100, progress.fraction * 100))}%`,
              }}
            />
          </div>
          {progress.partCount > 1 ? (
            // Small marks for the screens inside this one section, so the
            // movement inside a long section is visible as well as the bar.
            <div className="mt-2 flex gap-1.5" aria-hidden="true">
              {Array.from({ length: progress.partCount }).map((_, i) => (
                <span
                  key={i}
                  className="h-1 flex-1 rounded-full"
                  style={{
                    background: i < progress.part ? 'var(--accent)' : 'var(--line)',
                  }}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6">{children}</div>

      {overviewOpen && screenCount ? (
        <div
          className="fixed inset-0 z-20 overflow-y-auto bg-[var(--page)] px-5 pb-10 pt-6"
          role="dialog"
          aria-modal="true"
          aria-label="What a check-in is"
        >
          <div className="mx-auto w-full max-w-md">
            <WhatThisIs template={info.template_type} screenCount={screenCount} />
            <button
              type="button"
              onClick={onCloseOverview}
              className="mt-8 w-full rounded-xl px-5 py-3 text-[15px] font-semibold text-white"
              style={{ background: accent }}
            >
              Back to my check-in
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function SectionView({
  section,
  sectionIndex,
  units,
  part,
  partCount,
  isFirstSection,
  info,
  payload,
  problems,
  nudgeFor,
  markBlurred,
  setValue,
  setArea,
  setMyArea,
  setGoal,
}: {
  section: Section;
  sectionIndex: number;
  /** Only the questions belonging to this screen. */
  units: Unit[];
  part: number;
  partCount: number;
  isFirstSection: boolean;
  info: FormInfo;
  payload: Payload;
  problems: Record<string, string>;
  nudgeFor: (key: string, value: string | undefined) => boolean;
  markBlurred: (key: string) => void;
  setValue: (key: string, value: unknown) => void;
  setArea: (areaId: string, part: 'score' | 'reason', value: unknown) => void;
  setMyArea: (part: 'name' | 'score' | 'reason', value: unknown) => void;
  setGoal: (row: number, part: string, value: string) => void;
}) {
  const [changingArea, setChangingArea] = useState(false);
  const guide = sectionGuide(info.template_type, sectionIndex);
  const isFirstPart = part === 0;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="flex items-center gap-3">
          <IconBadge name={guide.icon} size={40} />
          <h1 className="min-w-0 text-[22px] font-semibold leading-tight">{section.title}</h1>
        </div>
        {isFirstSection && isFirstPart ? (
          <p className="mt-3 text-[14px] leading-relaxed text-[var(--ink-soft)]">
            {VOICE_TYPING_HINT}
          </p>
        ) : null}
        {section.framing && isFirstPart ? (
          <div className="mt-3">
            <Framing>{section.framing}</Framing>
          </div>
        ) : null}
        {section.framing && !isFirstPart ? (
          // The same words, folded away on the later screens of a section.
          // Repeating a long paragraph on all five screens of section one turns
          // it into something people scroll past, but somebody who has come
          // back a day later still needs it within reach.
          <details className="mt-3 rounded-2xl border border-[var(--line)] bg-[var(--card)] px-4 py-1">
            {/*
              py-3 here, not on the box, so the line somebody taps is a full
              44px tall. Measured at 390px wide: as a bare summary it was 21px,
              which is half a thumb.
            */}
            <summary className="cursor-pointer py-3 text-[14px] font-semibold">
              Remind me what this section is asking
            </summary>
            <div className="mt-2">
              <Framing>{section.framing}</Framing>
            </div>
          </details>
        ) : null}
      </div>

      {units.map((unit, unitIndex) => {
        if (unit.kind === 'goal') {
          const row = unit.row;
          const goal = payload.goals?.[row] ?? {};
          return (
            <Card key={`goal-${row}`} icon={GOAL_ICON} heading={`Goal ${row + 1} of 3`}>
              <div className="flex flex-col gap-4">
                <TextAnswer
                  label="The goal"
                  value={goal.goal ?? ''}
                  onChange={(value) => setGoal(row, 'goal', value)}
                  problem={problems[`goal.${row}.goal`]}
                  long
                />
                <TextAnswer
                  label="Owner"
                  value={goal.owner ?? ''}
                  onChange={(value) => setGoal(row, 'owner', value)}
                  problem={problems[`goal.${row}.owner`]}
                />
                <TextAnswer
                  label="Due date"
                  value={goal.due_date ?? ''}
                  onChange={(value) => setGoal(row, 'due_date', value)}
                  problem={problems[`goal.${row}.due_date`]}
                />
                <TextAnswer
                  label="First action this week"
                  value={goal.first_action ?? ''}
                  onChange={(value) => setGoal(row, 'first_action', value)}
                  problem={problems[`goal.${row}.first_action`]}
                />
              </div>
            </Card>
          );
        }

        const field = unit.field;
        const fieldIndex = unitIndex;
        if (field.kind === 'my_area') {
          const knownName = info.my_area;
          const showPicker = !knownName || changingArea;
          return (
            <Card key="my_area" icon={MY_AREA_ICON} heading="Your area">
              {showPicker ? (
                <div className="mt-3">
                  <TextAnswer
                    label={field.firstTimeLabel}
                    value={payload.my_area?.name ?? ''}
                    onChange={(value) => setMyArea('name', value)}
                    problem={problems['my_area.name']}
                  />
                </div>
              ) : (
                <div className="mt-3">
                  <p className="text-[15px] font-medium leading-snug">{payload.my_area?.name}</p>
                  <button
                    type="button"
                    className="mt-2 text-[14px] font-semibold underline"
                    style={{ color: 'var(--accent)' }}
                    onClick={() => setChangingArea(true)}
                  >
                    Pick something different
                  </button>
                </div>
              )}
              <div className="mt-4">
                <ScorePicker
                  label={field.scoreLabel}
                  min={1}
                  max={field.scoreMax}
                  value={payload.my_area?.score}
                  onChange={(value) => setMyArea('score', value)}
                  problem={problems['my_area.score']}
                />
              </div>
              <div className="mt-4">
                <TextAnswer
                  label={field.reasonLabel}
                  value={payload.my_area?.reason ?? ''}
                  onChange={(value) => setMyArea('reason', value)}
                  onBlur={() => markBlurred('my_area.reason')}
                  problem={problems['my_area.reason']}
                  nudge={nudgeFor('my_area.reason', payload.my_area?.reason)}
                />
              </div>
            </Card>
          );
        }

        if (field.kind === 'area') {
          const entry = payload.areas?.[field.id] ?? {};
          return (
            <Card key={field.id} icon={areaIcon(field.id)}>
              <ScorePicker
                label={field.label}
                min={section.scoreMin ?? 1}
                max={section.scoreMax ?? 10}
                value={entry.score}
                onChange={(value) => setArea(field.id, 'score', value)}
                problem={problems[`area.${field.id}.score`]}
              />
              <div className="mt-4">
                <TextAnswer
                  label="Why that score"
                  value={entry.reason ?? ''}
                  onChange={(value) => setArea(field.id, 'reason', value)}
                  onBlur={() => markBlurred(`area.${field.id}.reason`)}
                  problem={problems[`area.${field.id}.reason`]}
                  nudge={nudgeFor(`area.${field.id}.reason`, entry.reason)}
                />
              </div>
            </Card>
          );
        }

        // The three ninety-day goals are split into one unit per goal before
        // they get here, so the grouped field itself is never rendered.
        if (field.kind === 'goals3') return null;

        if (field.kind === 'choice') {
          const chosen = payload[field.id];
          const followup = chosen ? field.followups[chosen] : undefined;
          return (
            <Card key={field.id}>
              <ChoicePicker
                label={field.label}
                options={field.options}
                value={chosen}
                onChange={(value) => setValue(field.id, value)}
                problem={problems[field.id]}
              />
              {followup ? (
                <div className="mt-4">
                  <TextAnswer
                    label={`${followup.label} (optional)`}
                    value={payload[followup.id] ?? ''}
                    onChange={(value) => setValue(followup.id, value)}
                    long
                  />
                </div>
              ) : null}
            </Card>
          );
        }

        return (
          <Card key={`${field.id}-${fieldIndex}`}>
            <TextAnswer
              label={field.required ? field.label : `${field.label} (optional)`}
              value={payload[field.id] ?? ''}
              onChange={(value) => setValue(field.id, value)}
              placeholder={field.placeholder}
              problem={problems[field.id]}
              long={field.long}
            />
          </Card>
        );
      })}
    </div>
  );
}

function ReviewView({
  info,
  payload,
  accent,
  onEdit,
  steps,
  onNoteChange,
  onNoteBlur,
}: {
  info: FormInfo;
  payload: Payload;
  accent: string;
  onEdit: (stepIndex: number) => void;
  steps: Step[];
  onNoteChange: (value: string) => void;
  onNoteBlur: () => void;
}) {
  const worksheet = WORKSHEETS[info.template_type];
  const loopStepIndex = steps.findIndex((step) => step.kind === 'loop');

  const EditLink = ({ target }: { target: number }) => (
    <button
      type="button"
      onClick={() => onEdit(target)}
      // The padding is the tap target, not decoration. Measured at 390px wide,
      // the word on its own was 24px across against a 44px minimum.
      className="-mr-3 -my-2 min-w-[44px] px-3 py-2 text-[14px] font-semibold underline"
      style={{ color: accent }}
    >
      Edit
    </button>
  );

  const Answer = ({ label, value }: { label: string; value: string }) => (
    <div className="mt-3">
      <p className="text-[13px] font-medium text-[var(--ink-soft)]">{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap text-[15px] leading-relaxed">
        {value.trim() === '' ? 'Left blank' : value}
      </p>
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-semibold leading-tight">Check it over</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-[var(--ink-soft)]">
          This is everything you wrote. Change anything you want to, then submit it.
        </p>
      </div>

      <Card icon={LOOP_ICON}>
        <div className="flex items-start justify-between gap-3">
          <p className="text-[15px] font-semibold leading-snug">
            {info.previous_goals.length > 0 ? 'Closing the loop' : 'Before you start'}
          </p>
          <EditLink target={loopStepIndex} />
        </div>
        {(payload.goal_status ?? []).map((entry: GoalStatusEntry, i: number) => (
          <div key={i} className="mt-3">
            <p className="text-[15px] leading-snug">{entry.goal}</p>
            <p className="mt-0.5 text-[14px] text-[var(--ink-soft)]">
              {entry.status || 'No answer'}
              {entry.reflection?.trim() ? ` — ${entry.reflection}` : ''}
            </p>
          </div>
        ))}
        {payload.try_differently ? (
          <Answer
            label={worksheet.tryDifferentlyLabel ?? 'One thing to try differently'}
            value={payload.try_differently}
          />
        ) : null}
        <Answer label={worksheet.initiativeLabel} value={payload.went_beyond ?? ''} />
      </Card>

      {worksheet.sections.map((section, sectionIndex) => {
        const target = steps.findIndex(
          (step) => step.kind === 'section' && step.index === sectionIndex,
        );
        return (
          <Card key={section.title} icon={sectionGuide(info.template_type, sectionIndex).icon}>
            <div className="flex items-start justify-between gap-3">
              <p className="text-[15px] font-semibold leading-snug">{section.title}</p>
              <EditLink target={target} />
            </div>
            {section.fields.map((field, fieldIndex) => {
              if (field.kind === 'my_area') {
                const area = payload.my_area ?? {};
                return (
                  <div key="my_area">
                    <Answer label="Your area" value={area.name ?? ''} />
                    <Answer
                      label={`${field.scoreLabel} (out of ${field.scoreMax})`}
                      value={area.score ? String(area.score) : ''}
                    />
                    <Answer label={field.reasonLabel} value={area.reason ?? ''} />
                  </div>
                );
              }
              if (field.kind === 'area') {
                const entry = payload.areas?.[field.id] ?? {};
                return (
                  <Answer
                    key={field.id}
                    label={`${field.label} (${entry.score ?? 'no score'} of ${section.scoreMax ?? 10})`}
                    value={entry.reason ?? ''}
                  />
                );
              }
              if (field.kind === 'goals3') {
                return (
                  <div key="goals3">
                    {[0, 1, 2].map((row) => {
                      const goal = payload.goals?.[row] ?? {};
                      return (
                        <Answer
                          key={row}
                          label={`Goal ${row + 1}, owner ${goal.owner ?? 'not set'}, due ${
                            goal.due_date ?? 'not set'
                          }`}
                          value={`${goal.goal ?? ''}${
                            goal.first_action ? `\nFirst action: ${goal.first_action}` : ''
                          }`}
                        />
                      );
                    })}
                  </div>
                );
              }
              if (field.kind === 'choice') {
                const chosen = payload[field.id] ?? '';
                const followup = chosen ? field.followups[chosen] : undefined;
                return (
                  <div key={field.id}>
                    <Answer label={field.label} value={chosen} />
                    {followup ? (
                      <Answer label={followup.label} value={payload[followup.id] ?? ''} />
                    ) : null}
                  </div>
                );
              }
              return (
                <Answer
                  key={`${field.id}-${fieldIndex}`}
                  label={field.label}
                  value={payload[field.id] ?? ''}
                />
              );
            })}
          </Card>
        );
      })}

      <Card icon={NOTE_ICON}>
        <TextAnswer
          label={NOTE_TO_SELF_LABEL}
          value={payload.note_to_self ?? ''}
          onChange={onNoteChange}
          onBlur={onNoteBlur}
          long
        />
      </Card>
    </div>
  );
}
