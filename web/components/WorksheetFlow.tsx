'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  editGoal,
  fetchDraft,
  fetchForm,
  NeedsCodeError,
  saveDraft,
  submitCheckIn,
  type FormInfo,
  type GoalStatusEntry,
  type StoredDraft,
} from '@/lib/api';
import { monthName } from '@/lib/month';
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

/**
 * What a check-in can say about a goal that is still open on the board.
 *
 * These replaced Done / Partly / Not yet when the goal board arrived. Those
 * three could only describe a goal that had just ended, and a goal now lives
 * across months until its owner closes it, so the list has to carry both the
 * answer that keeps it and the three that end it.
 *
 * "Still working on it" is first because it is the commonest true answer to a
 * ninety-day goal three weeks in, and putting it anywhere else would push
 * people towards calling something missed when it is simply not finished.
 *
 * The same four live in api/src/lib/templates.ts, which is what actually
 * enforces them. If these drift, a submission is refused over an answer the
 * screen offered.
 */
const LOOP_ANSWERS = ['Still working on it', 'Hit it', 'Missed it', 'Changed my mind'] as const;

/** The answers that mean it is not finished, which is what asks for more. */
const UNFINISHED: readonly string[] = ['Still working on it', 'Missed it'];

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

/** The keys the page uses to remember where someone was. Never submitted. */
const UI_KEY = '_ui';

/**
 * Where somebody was, written down as the screen itself rather than as its
 * position in a list.
 *
 * A bare index was safe while a step was a whole section, because only adding
 * or removing a section could move one. It is not safe now. How many screens a
 * section is asked over depends on the fields inside it, so removing a single
 * scored life area can change the number of screens and shift every index after
 * it. Anybody holding a half-finished check-in across that deploy would come
 * back to a different screen than the one they left, silently.
 *
 * So the place is stored as what it is, and looked up again on the way back in.
 * A place that no longer exists is not guessed at: it falls back to the start,
 * where all the answers are still on screen and nothing is lost.
 */
function placeOf(step: Step | undefined): Step | null {
  if (!step) return null;
  return { kind: step.kind, index: step.index, part: step.part };
}

function indexOfPlace(steps: Step[], place: unknown): number | null {
  if (typeof place !== 'object' || place === null) return null;
  const want = place as Step;
  const found = steps.findIndex(
    (step) =>
      step.kind === want.kind &&
      (step.index ?? null) === (want.index ?? null) &&
      (step.part ?? null) === (want.part ?? null),
  );
  return found >= 0 ? found : null;
}

function stripUiState(payload: Payload): Payload {
  const copy = { ...payload };
  delete copy[UI_KEY];
  return copy;
}

/**
 * The check-in itself, now one tab inside somebody's own space rather than a
 * page of its own.
 *
 * Two things changed about it and nothing else did. It is reached through the
 * person's own code rather than through a link, so every request it makes
 * carries a session the server checks. And the screen at the start that used to
 * read last month's answers back now reads the goal board instead, so a goal
 * set in September is still being asked about in November rather than having
 * quietly vanished at the next check-in.
 *
 * The six sections, their questions, their order and their rules are untouched.
 */
export function WorksheetFlow({
  slug,
  onNeedsCode,
  onFinished,
}: {
  slug: string;
  /** The session went away mid-check-in. The space puts the door back up. */
  onNeedsCode: () => void;
  /** A check-in landed, so the goal board above this has changed underneath it. */
  onFinished: () => void;
}) {
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
  /**
   * The screen a resumed draft said it was on, held until the list of steps has
   * been built and it can be looked up. Undefined once it has been used.
   */
  const [pendingPlace, setPendingPlace] = useState<
    { place: unknown; legacyStep: number } | undefined
  >(undefined);
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
  /** What just went onto the board, so the finish screen can say who can see it. */
  const [newGoals, setNewGoals] = useState<{ id: string; title: string }[]>([]);

  const topRef = useRef<HTMLDivElement | null>(null);

  // Load the worksheet and whatever was saved last time.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await fetchForm(slug);
        if (cancelled) return;
        const draft = await fetchDraft(slug);
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
          // Where they were is resolved once the steps exist, below.
          setPendingPlace({ place: ui?.place, legacyStep: Number(ui?.step ?? 0) });
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
        if (error instanceof NeedsCodeError) {
          onNeedsCode();
          return;
        }
        setLoadError(error instanceof Error ? error.message : 'Something went wrong.');
        setLoadState('failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onNeedsCode, slug]);

  const worksheet = info ? WORKSHEETS[info.template_type] : null;

  /*
   * The person's own colour, as the custom property rather than as a hex.
   *
   * The space around this check-in sets --accent, --accent-tint and --on-accent
   * on its own wrapper, so every screen in here inherits them. Reading the hex
   * again here would be a second copy of the same decision, and the two would
   * disagree the first time somebody changed one of them.
   */
  const accent = 'var(--accent)';

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

  /**
   * Puts a resumed draft back on the screen it named, now that the list of
   * steps exists. Runs once per resume and then forgets, so it can never fight
   * with somebody pressing continue.
   */
  useEffect(() => {
    if (!pendingPlace || steps.length === 0) return;
    const found = indexOfPlace(steps, pendingPlace.place);
    if (found !== null) {
      setStepIndex(found);
    } else {
      // Either a draft written before places were stored, or a screen that no
      // longer exists. The old number is still the best guess in the first case
      // and is clamped in the second; the answers are all there either way.
      setStepIndex(Math.min(Math.max(pendingPlace.legacyStep, 0), steps.length - 1));
    }
    setPendingPlace(undefined);
  }, [pendingPlace, steps]);

  /** What gets written into the draft to remember this screen. */
  const uiFor = useCallback(
    (index: number) => ({
      // Kept for a draft written by an older page, and as the fallback above.
      step: index,
      place: placeOf(steps[index]),
      showNote,
      showOverview,
    }),
    [showNote, showOverview, steps],
  );

  // Fill in what carries over from last time, once, when the worksheet opens.
  useEffect(() => {
    if (!info || staleDraft) return;
    setPayload((current) => {
      const next = { ...current };
      let changed = false;
      /*
       * The goals waiting to be answered about, seeded from the board.
       *
       * Reconciled rather than seeded once, because the board is not frozen
       * while a check-in is open: a goal can be added or closed from the goal
       * board on the same phone, or from another one, between starting this and
       * finishing it. A draft that remembered an older list would then ask about
       * a goal that is no longer open, or never ask about one that is, and the
       * server refuses both.
       *
       * Answers already given are kept, matched by goal id.
       */
      const openIds = info.open_goals.map((goal) => goal.id);
      const existing: GoalStatusEntry[] = Array.isArray(next.goal_status) ? next.goal_status : [];
      const sameShape =
        existing.length === openIds.length &&
        existing.every((entry, i) => entry?.goal_id === openIds[i]);
      if (!sameShape) {
        next.goal_status = info.open_goals.map((goal) => {
          const already = existing.find((entry) => entry?.goal_id === goal.id);
          return {
            goal_id: goal.id,
            goal: goal.title,
            status: already?.status ?? '',
            reflection: already?.reflection ?? '',
          };
        });
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

  const setGoalStatus = useCallback(
    (row: number, part: 'status' | 'reflection', value: string, goal?: { id: string; title: string }) => {
      setPayload((current) => {
        const list: GoalStatusEntry[] = Array.isArray(current.goal_status)
          ? [...current.goal_status]
          : [];
        /*
         * The goal this answer is about, filled in here as well as by the
         * reconcile effect.
         *
         * Without it, writing into a row the effect had not populated produced
         * an entry with no goal_id and no goal text, and the server refuses the
         * whole submission over "the goal being answered at position N". The
         * screen one level up already has exactly this fallback for exactly this
         * reason; the setter not having it was one refactor away from a real
         * defect nobody would have found until somebody pressed submit.
         */
        const base = list[row] ?? {
          goal_id: goal?.id ?? '',
          goal: goal?.title ?? '',
          status: '',
          reflection: '',
        };
        list[row] = { ...base, [part]: value } as GoalStatusEntry;
        return { ...current, goal_status: list };
      });
      if (part === 'status') clearProblem(`status.${row}`);
      markTouched();
    },
    [clearProblem, markTouched],
  );

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

      if (current.kind === 'loop' && info.open_goals.length > 0) {
        const list: GoalStatusEntry[] = payload.goal_status ?? [];
        info.open_goals.forEach((_, i) => {
          if (!list[i]?.status) found[`status.${i}`] = 'Pick one of the four.';
        });
        if (info.template_type !== 'adult') {
          // Across every open goal, not just the first. A teen can add goals of
          // their own now, so "the first answer" was an arbitrary one of
          // several. The same rule is in api/src/lib/validate.ts; if these two
          // disagree the screen asks for something the server does not want, or
          // refuses a submission over a question nobody was shown.
          const unfinished = list.some((entry) => UNFINISHED.includes(entry?.status ?? ''));
          if (unfinished && !(payload.try_differently ?? '').trim()) {
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
      const toSave = { ...nextPayload, [UI_KEY]: uiFor(nextStep) };
      try {
        await saveDraft(slug, { payload: toSave, started_at: startedAt });
        setSaveProblem('');
        return true;
      } catch (error) {
        if (error instanceof NeedsCodeError) {
          onNeedsCode();
          return false;
        }
        setSaveProblem(
          'Your answers could not be saved just now. They are still on this screen. ' +
            'Press continue again in a moment.',
        );
        return false;
      }
    },
    [info, onNeedsCode, slug, startedAt, uiFor],
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
    const nextPayload = { ...payload, [UI_KEY]: uiFor(nextStep) };
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
    step,
    stepIndex,
    steps.length,
    uiFor,
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
      const result = await submitCheckIn(slug, {
        payload: stripUiState(payload),
        started_at: startedAt,
      });
      setNewGoals(result.created_goals ?? []);
      setSubmitted(true);
      window.scrollTo({ top: 0 });
      // The board above this has just changed: goals closed, new ones opened.
      // Telling the space rather than working it out here keeps one set of
      // rules for what a check-in does to a board, on the server.
      onFinished();
    } catch (error) {
      if (error instanceof NeedsCodeError) {
        onNeedsCode();
        return;
      }
      /*
       * A refusal because the board moved underneath this check-in is
       * recoverable, and was not.
       *
       * The board can change from the goal board on another phone, or in
       * another tab, while this sits open. The answers then describe a goal that
       * is no longer open, or miss one that now is, and the server refuses
       * both. `info` was fetched once, so nothing re-ran the reconciliation and
       * pressing submit again failed in exactly the same way, forever, with a
       * message that gave nobody a reason to try reloading.
       *
       * So the form is read again and the reconciliation re-runs, which is what
       * the effect does whenever `info` changes. The person presses submit a
       * second time and it goes.
       */
      try {
        const fresh = await fetchForm(slug);
        setInfo(fresh);
        setSaveProblem(
          'Your goals changed somewhere else while this was open, so this has been brought up ' +
            'to date. Check the first screen, then send it again.',
        );
      } catch {
        setSaveProblem(error instanceof Error ? error.message : 'It could not be submitted.');
      }
    } finally {
      setBusy(false);
    }
  }, [info, onFinished, onNeedsCode, payload, slug, startedAt]);

  const nudgeFor = useCallback(
    (key: string, value: string | undefined) =>
      needsNudge(value) && !nudgeDone[key] && (Boolean(blurred[key]) || Boolean(nudgeShown[key])),
    [blurred, nudgeDone, nudgeShown],
  );

  const markBlurred = useCallback((key: string) => {
    setBlurred((current) => ({ ...current, [key]: true }));
  }, []);

  if (loadState === 'loading') {
    return <p className="text-[15px] text-[var(--ink-soft)]">Opening your check-in.</p>;
  }

  if (loadState === 'invalid' || loadState === 'failed' || !info || !worksheet) {
    return (
      <div>
        <p className="text-[17px]">Your check-in could not be opened just now.</p>
        <p className="mt-2 text-[15px] text-[var(--ink-soft)]">{loadError}</p>
      </div>
    );
  }

  const sectionCount = worksheet.sections.length;

  // A draft from an earlier month. Asked about before anything is rendered.
  if (staleDraft) {
    return (
      <Shell progress={null} template={info.template_type} accent="var(--accent)" screenCount={screenCount}>
        <h1 className="text-[22px] font-semibold leading-tight">You have an unfinished one</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-[var(--ink-soft)]">
          You started a check-in for {monthName(staleDraft.cycle_label)} and did not finish it.
          It is {monthName(info.current_cycle_label)} now. You can pick that one up, or start
          this month fresh.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            className="rounded-xl px-4 py-3 text-[15px] font-bold"
            style={{ background: accent, color: 'var(--on-accent)' }}
            onClick={() => {
              setPayload(staleDraft.payload ?? {});
              setStartedAt(staleDraft.started_at);
              // Restarted from the top, so their note from last time belongs
              // at the front of this run just as it would on a fresh one.
              setShowNote(Boolean(info.note_to_self));
              // Starting one is not the same as having finished one, and this
              // screen did not exist when they abandoned that draft. Somebody
              // who has still never sent a check-in gets it.
              setShowOverview(!info.has_earlier_submissions);
              setStepIndex(0);
              setStaleDraft(null);
            }}
          >
            Pick up the unfinished one
          </button>
          <button
            type="button"
            className="rounded-xl border border-[var(--line)] px-4 py-3 text-[15px] font-semibold"
            onClick={() => {
              setPayload({});
              setFreshStarts((n) => n + 1);
              setStartedAt(new Date().toISOString());
              setShowNote(Boolean(info.note_to_self));
              setShowOverview(!info.has_earlier_submissions);
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
    /*
     * The goals they just closed, out of what they answered on the way in. Read
     * from the payload rather than asked back from the server, because at this
     * moment it is the same thing and the phone already has it.
     */
    const answered: GoalStatusEntry[] = Array.isArray(payload.goal_status)
      ? payload.goal_status
      : [];
    const hit = answered.filter((entry) => entry.status === 'Hit it');
    const stillGoing = answered.filter((entry) => entry.status === 'Still working on it').length;

    return (
      <Shell progress={null} template={info.template_type} accent="var(--accent)" screenCount={screenCount}>
        {/*
          The one place in the whole check-in that is allowed to be a moment.
          It says the same thing to somebody who scored themselves low as to
          somebody who scored high, because what it is pleased about is that
          they sat down and finished it, not what they found when they did.
        */}
        <div className="lift-in flex flex-col items-center py-6 text-center">
          <FinishMark size={84} />
          <p className="kicker steel mt-6 text-[13px]">To a bigger life</p>
          <h1 className="display mt-2 text-[32px] uppercase leading-none">
            That is {monthName(info.current_cycle_label).split(' ')[0]},
            <br />
            {info.name}
          </h1>
          <p className="mt-4 max-w-[300px] text-[15px] leading-relaxed text-[var(--ink-soft)]">
            You sat down and told yourself the truth. That is the hard part, and you just did it.
          </p>
        </div>

        {hit.length > 0 ? (
          <div
            className="mt-2 rounded-2xl p-4"
            style={{ background: 'var(--accent-tint)' }}
          >
            <p className="text-[14px] font-semibold leading-snug">
              {hit.length === 1 ? 'You hit this one' : `You hit ${hit.length} of them`}
            </p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {hit.map((entry) => (
                <li key={entry.goal_id} className="text-[14px] leading-snug text-[var(--ink-soft)]">
                  {entry.goal}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="mt-5 text-[14.5px] leading-relaxed text-[var(--ink-soft)]">
          {stillGoing > 0
            ? `${stillGoing === 1 ? 'One goal is' : `${stillGoing} goals are`} still going, and whatever you just wrote down is on your board now. That is the bit between today and next month.`
            : 'Whatever you just wrote down is on your board now. That is the bit between today and next month.'}
        </p>

        {newGoals.length > 0 ? (
          <NewGoalVisibility slug={slug} goals={newGoals} onChanged={onFinished} />
        ) : null}

        <p className="mt-5 text-[13px] leading-relaxed text-[var(--ink-soft)]">
          Nobody can see what you wrote in here, or the scores you gave. That is yours and it stays
          yours.
        </p>
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
      <Shell progress={null} template={info.template_type} accent="var(--accent)" screenCount={screenCount}>
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
  /**
   * The bar runs from the first screen that asks for anything to the review,
   * and it is on every one of them, including the loop screen at the start and
   * the review at the end, where it is full. It used to appear only on section
   * screens, which meant the last thing it did was read ninety four per cent and
   * then vanish rather than close.
   *
   * The screens before the first question, the explanation and their own note,
   * have no bar, because nothing has been asked yet and a bar at zero on a
   * screen with no questions on it says nothing true.
   */
  const onAnsweringStep =
    step?.kind === 'loop' || step?.kind === 'section' || step?.kind === 'review';
  const progress = onAnsweringStep
    ? {
        section: step?.kind === 'section' ? (step.index ?? 0) + 1 : null,
        sectionTotal: sectionCount,
        part: step?.kind === 'section' ? (step.part ?? 0) + 1 : 1,
        partCount: step?.kind === 'section' ? (step.partCount ?? 1) : 1,
        fraction:
          reviewStep > firstAnsweringStep
            ? (stepIndex - firstAnsweringStep) / (reviewStep - firstAnsweringStep)
            : 0,
      }
    : null;

  return (
    <Shell
      progress={progress}
      template={info.template_type}
      accent="var(--accent)"
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

      {/*
        Closing the loop, rebuilt on the goal board.

        It used to read the goals out of last month's answers, which meant a
        ninety-day goal set in September was asked about once, in October, and
        then silently gone. It now asks about whatever is still open on the
        board, however many months ago it was written, and what somebody answers
        here is what closes it or leaves it open. There is one list of goals in
        this tool now rather than two that drift apart.
      */}
      {step?.kind === 'loop' ? (
        <div className="flex flex-col gap-5">
          {info.open_goals.length > 0 ? (
            <>
              <div>
                <div className="flex items-center gap-3">
                  <IconBadge name={LOOP_ICON} size={40} />
                  <h1 className="display text-[26px] uppercase leading-none">Your goals</h1>
                </div>
                <p className="mt-3 text-[15px] leading-relaxed text-[var(--ink-soft)]">
                  {info.open_goals.length === 1
                    ? 'One thing is still open on your board. Say where it got to.'
                    : `${info.open_goals.length} things are still open on your board. Say where each one got to.`}
                </p>
                <p className="mt-2 text-[15px] leading-relaxed text-[var(--ink-soft)]">
                  {worksheet.doneMeans}
                </p>
              </div>
              {info.open_goals.map((goal, i) => {
                const entry: GoalStatusEntry = payload.goal_status?.[i] ?? {
                  goal_id: goal.id,
                  goal: goal.title,
                  status: '',
                  reflection: '',
                };
                return (
                  <Card key={goal.id}>
                    <p className="text-[15px] font-medium leading-snug">{goal.title}</p>
                    <p className="mt-1 text-[12.5px] text-[var(--ink-soft)]">
                      Set in {monthName(goal.created_cycle_label)}
                      {goal.due_date ? ` · due ${goal.due_date}` : ''}
                    </p>
                    <div className="mt-3">
                      <ChoicePicker
                        label="Where did it get to?"
                        options={[...LOOP_ANSWERS]}
                        value={entry.status || undefined}
                        onChange={(value) =>
                          setGoalStatus(i, 'status', value, { id: goal.id, title: goal.title })
                        }
                        problem={problems[`status.${i}`]}
                      />
                    </div>
                    <div className="mt-4">
                      <TextAnswer
                        label="What happened, in one line (optional)"
                        value={entry.reflection ?? ''}
                        onChange={(value) =>
                          setGoalStatus(i, 'reflection', value, { id: goal.id, title: goal.title })
                        }
                        onBlur={() => markBlurred(`reflection.${i}`)}
                        nudge={nudgeFor(`reflection.${i}`, entry.reflection)}
                      />
                    </div>
                    {/*
                      What the answer is about to do, said before it happens. A
                      goal quietly disappearing off the board after a check-in is
                      exactly the thing this release exists to stop, so the
                      screen says which answers take it off and which keep it.
                    */}
                    {entry.status === 'Still working on it' ? (
                      <p className="mt-3 text-[12.5px] leading-snug text-[var(--ink-soft)]">
                        It stays on your board, and next month asks you again.
                      </p>
                    ) : entry.status ? (
                      <p className="mt-3 text-[12.5px] leading-snug text-[var(--ink-soft)]">
                        This one comes off your board when you send this.
                      </p>
                    ) : null}
                  </Card>
                );
              })}
              {info.template_type !== 'adult' &&
              (payload.goal_status ?? []).some((entry: GoalStatusEntry) =>
                UNFINISHED.includes(entry?.status ?? ''),
              ) ? (
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
                <h1 className="display text-[26px] uppercase leading-none">Before you start</h1>
              </div>
              <p className="mt-3 text-[15px] leading-relaxed text-[var(--ink-soft)]">
                {info.has_earlier_submissions
                  ? 'Nothing is open on your board, so there is nothing to look back on. What you write in this one lands there, and next month starts by asking how it went.'
                  : 'This is your first one, so there is nothing to look back on yet. What you decide in this one goes onto your board, and next month starts here by asking how it went.'}
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
        <p className="mt-5 text-[14px] font-medium leading-snug text-[var(--bad)]">{saveProblem}</p>
      ) : null}

      <div className="mt-8 flex items-center gap-3 pb-4">
        {stepIndex > 0 ? (
          <button
            type="button"
            onClick={onBack}
            className="rounded-xl border border-[var(--line)] px-5 py-3 text-[15px] font-semibold"
          >
            Back
          </button>
        ) : null}
        {step?.kind === 'review' ? (
          <button
            type="button"
            onClick={onSubmit}
            disabled={busy}
            className="flex-1 rounded-xl px-5 py-3 text-[15px] font-bold disabled:opacity-60"
            style={{ background: accent, color: 'var(--on-accent)' }}
          >
            {busy ? 'Submitting' : 'Submit worksheet'}
          </button>
        ) : (
          <button
            type="button"
            onClick={onContinue}
            disabled={busy}
            className="flex-1 rounded-xl px-5 py-3 text-[15px] font-bold disabled:opacity-60"
            style={{ background: accent, color: 'var(--on-accent)' }}
          >
            {busy ? 'Saving' : 'Continue'}
          </button>
        )}
      </div>
    </Shell>
  );
}

/**
 * Which of the goals that just landed the family can see, offered at the moment
 * somebody is actually thinking about them.
 *
 * A privacy control on a settings screen somewhere is one nobody finds on the
 * day it matters. This is the first time these goals have existed, so this is
 * where the question belongs. It is the same choice as the one on the goal
 * board and it writes the same field; it is just asked at the right time.
 */
function NewGoalVisibility({
  slug,
  goals,
  onChanged,
}: {
  slug: string;
  goals: { id: string; title: string }[];
  onChanged: () => void;
}) {
  const [privateIds, setPrivateIds] = useState<Record<string, true>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [problem, setProblem] = useState('');

  async function toggle(id: string) {
    const nowPrivate = !privateIds[id];
    setBusyId(id);
    setProblem('');
    try {
      await editGoal(slug, id, { is_private: nowPrivate });
      setPrivateIds((current) => {
        const next = { ...current };
        if (nowPrivate) next[id] = true;
        else delete next[id];
        return next;
      });
      onChanged();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'That did not save just now.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-4">
      <p className="text-[14.5px] font-semibold leading-snug">
        {goals.length === 1 ? 'This goal is on your board' : 'These goals are on your board'}
      </p>
      <p className="mt-2 text-[13px] leading-relaxed text-[var(--ink-soft)]">
        The family can see the goals you set and how they are going, so they can cheer you on. If
        you would rather keep one to yourself, say so here. You can change it any time.
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {goals.map((goal) => {
          const hidden = Boolean(privateIds[goal.id]);
          return (
            <li key={goal.id} className="rounded-xl border border-[var(--line)] p-3">
              <p className="text-[13.5px] leading-snug">{goal.title}</p>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="min-w-0 flex-1 text-[12px] text-[var(--ink-soft)]">
                  {hidden ? 'Only you can see this one.' : 'The family can see this one.'}
                </span>
                <button
                  type="button"
                  disabled={busyId === goal.id}
                  onClick={() => toggle(goal.id)}
                  className="shrink-0 rounded-lg px-2 text-[12px] font-semibold underline disabled:opacity-60"
                  style={{ color: 'var(--accent-ink)' }}
                >
                  {hidden ? 'Let them see it' : 'Make it just mine'}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {problem ? (
        <p className="mt-2 text-[13px] font-medium" style={{ color: 'var(--bad)' }}>
          {problem}
        </p>
      ) : null}
    </div>
  );
}

interface Progress {
  /** Null on the screens either side of the sections, which have no number. */
  section: number | null;
  sectionTotal: number;
  part: number;
  partCount: number;
  /** How far through the whole check-in, 0 to 1. */
  fraction: number;
}

/**
 * The frame round the check-in: where you are in it, and the way back to the
 * screen that says what it is.
 *
 * It used to be the whole page, with the person's name and colour on it. The
 * space around it carries all of that now, so what is left here is the progress
 * bar and the explanation panel. Rendering the name twice was the first thing
 * that looked wrong once this became a tab.
 */
function Shell({
  progress,
  topRef,
  screenCount,
  template,
  accent,
  overviewOpen,
  onOpenOverview,
  onCloseOverview,
  children,
}: {
  progress: Progress | null;
  topRef?: React.RefObject<HTMLDivElement | null>;
  screenCount?: number;
  template: FormInfo['template_type'];
  accent: string;
  overviewOpen?: boolean;
  onOpenOverview?: () => void;
  onCloseOverview?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div ref={topRef} />
      {onOpenOverview ? (
        // The explanation screen stays reachable for everybody, not only on
        // somebody's very first go. A first-timer sees it and then never finds
        // it again is the same as not having written it.
        //
        // Made inert alongside the check-in while the panel is open, so that
        // tabbing out of the panel's one button cannot land on the button
        // hidden behind it.
        <div className="flex justify-end" inert={overviewOpen ? true : undefined}>
          <button
            type="button"
            onClick={onOpenOverview}
            className="-mr-2 flex min-w-[44px] items-center justify-center gap-1.5 rounded-xl px-2 text-[13px] font-semibold"
            style={{ color: 'var(--accent-ink)' }}
          >
            <Icon name="message" size={18} />
            <span>What is this?</span>
          </button>
        </div>
      ) : null}

      {progress ? (
        <div className="mt-1">
          {/*
            The section's name is the heading immediately below this, so saying
            it here as well is the same words twice on a small screen. This says
            where you are instead: which section, and which screen of it.
          */}
          <div className="flex items-baseline justify-between gap-3">
            <p className="min-w-0 truncate text-[13px] font-medium text-[var(--ink-soft)]">
              {progress.section === null
                ? 'Your check-in'
                : `Section ${progress.section} of ${progress.sectionTotal}`}
            </p>
            {progress.partCount > 1 ? (
              <p className="shrink-0 text-[13px] text-[var(--ink-soft)]">
                Screen {progress.part} of {progress.partCount}
              </p>
            ) : null}
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[var(--line)]">
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

      {/*
        Everything behind the panel is made inert while it is open. Without it
        the panel says aria-modal and is not one: it is rendered after the
        worksheet, so tabbing from the header button walks straight into the
        worksheet nobody can see, and Enter on the continue button it lands on
        advances a step behind an opaque screen.
      */}
      <div className="mt-6" inert={overviewOpen ? true : undefined}>
        {children}
      </div>

      {overviewOpen && screenCount ? (
        <OverviewPanel
          template={template}
          screenCount={screenCount}
          accent={accent}
          onClose={onCloseOverview}
        />
      ) : null}
    </div>
  );
}

/**
 * The "what a check-in is" screen, opened from the header rather than reached
 * as a step. Takes the focus when it opens, gives it back when it closes, and
 * closes on Escape, because a panel that covers the whole screen has to behave
 * like one for somebody who is not using a finger.
 */
function OverviewPanel({
  template,
  screenCount,
  accent,
  onClose,
}: {
  template: FormInfo['template_type'];
  screenCount: number;
  accent: string;
  onClose?: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const openerRef = useRef<Element | null>(null);

  useEffect(() => {
    openerRef.current = document.activeElement;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      const opener = openerRef.current;
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-20 overflow-y-auto bg-[var(--page)] px-5 pb-10 pt-6"
      role="dialog"
      aria-modal="true"
      aria-label="What a check-in is"
    >
      <div className="mx-auto w-full max-w-md">
        <WhatThisIs template={template} screenCount={screenCount} />
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="mt-8 w-full rounded-xl px-5 py-3 text-[15px] font-bold"
          style={{ background: accent, color: 'var(--on-accent)' }}
        >
          Back to my check-in
        </button>
      </div>
    </div>
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
          <details className="mt-3 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] px-4 py-1">
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
            <Card key={`goal-${row}`} icon={GOAL_ICON} heading={`Goal ${row + 1}`}>
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
            {info.open_goals.length > 0 ? 'Your goals' : 'Before you start'}
          </p>
          <EditLink target={loopStepIndex} />
        </div>
        {(payload.goal_status ?? []).map((entry: GoalStatusEntry, i: number) => (
          <div key={entry.goal_id ?? i} className="mt-3">
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
