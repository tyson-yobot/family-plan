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
import { accentFor, initialsFor } from '@/lib/theme';
import {
  NOTE_TO_SELF_LABEL,
  VOICE_TYPING_HINT,
  WORKSHEETS,
  type Field,
  type Section,
} from '@/lib/worksheets';
import { Card, ChoicePicker, Framing, ScorePicker, TextAnswer, needsNudge } from './fields';

const GOAL_STATUSES = ['Done', 'Partly', 'Not yet'] as const;

type Payload = Record<string, any>;

interface Step {
  kind: 'note' | 'intro' | 'loop' | 'section' | 'review';
  /** Index into the worksheet's sections, for section steps only. */
  index?: number;
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
          // Same month, so pick up exactly where they left off.
          setPayload(draft.payload ?? {});
          setStartedAt(draft.started_at);
          setStepIndex(Number((draft.payload as Payload)?.[UI_KEY]?.step ?? 0));
        } else if (draft) {
          // A draft from a previous month. Never resumed and never discarded
          // without asking.
          setStaleDraft(draft);
        } else {
          setStartedAt(new Date().toISOString());
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
  const resuming = startedAt !== '' && Boolean((payload as Payload)?.[UI_KEY]);

  const steps: Step[] = useMemo(() => {
    if (!info || !worksheet) return [];
    const list: Step[] = [];
    // Their own note from last time comes before anything else, but only when
    // they are opening a new worksheet rather than returning to this one.
    if (info.note_to_self && !resuming) list.push({ kind: 'note' });
    list.push({ kind: 'intro' });
    list.push({ kind: 'loop' });
    worksheet.sections.forEach((_, index) => list.push({ kind: 'section', index }));
    list.push({ kind: 'review' });
    return list;
  }, [info, worksheet, resuming]);

  const step = steps[Math.min(stepIndex, Math.max(steps.length - 1, 0))];

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
      return changed ? next : current;
    });
  }, [info, staleDraft]);

  /**
   * Once someone answers a field that was flagged as missing, the message has
   * to go. Leaving it up tells them something is still wrong when it is not,
   * and it also hides the short-answer nudge behind it.
   */
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
    },
    [clearProblem],
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
    },
    [clearProblem],
  );

  const setMyArea = useCallback(
    (part: 'name' | 'score' | 'reason', value: unknown) => {
      setPayload((current) => ({
        ...current,
        my_area: { ...(current.my_area ?? {}), [part]: value },
      }));
      clearProblem(`my_area.${part}`);
    },
    [clearProblem],
  );

  const setGoal = useCallback((row: number, part: string, value: string) => {
    setPayload((current) => {
      const goals = Array.isArray(current.goals) ? [...current.goals] : [{}, {}, {}];
      while (goals.length < 3) goals.push({});
      goals[row] = { ...goals[row], [part]: value };
      return { ...current, goals };
    });
    clearProblem(`goal.${row}.${part}`);
  }, [clearProblem]);

  const setGoalStatus = useCallback((row: number, part: 'status' | 'reflection', value: string) => {
    setPayload((current) => {
      const list: GoalStatusEntry[] = Array.isArray(current.goal_status)
        ? [...current.goal_status]
        : [];
      list[row] = { ...list[row], [part]: value } as GoalStatusEntry;
      return { ...current, goal_status: list };
    });
    if (part === 'status') clearProblem(`status.${row}`);
  }, [clearProblem]);

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
        const section = worksheet.sections[current.index ?? 0];
        for (const field of section.fields) {
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
    [payload, worksheet],
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
        const section = worksheet.sections[current.index ?? 0];
        for (const field of section.fields) {
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
          if (field.kind === 'goals3') {
            const goals = payload.goals ?? [];
            for (let i = 0; i < 3; i++) {
              const row = goals[i] ?? {};
              if (!(row.goal ?? '').trim()) found[`goal.${i}.goal`] = 'This goal needs writing down.';
              if (!(row.owner ?? '').trim()) found[`goal.${i}.owner`] = 'Who owns this one?';
              if (!(row.due_date ?? '').trim()) found[`goal.${i}.due_date`] = 'Give it a date.';
              if (!(row.first_action ?? '').trim()) {
                found[`goal.${i}.first_action`] = 'What is the first action this week?';
              }
            }
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
    [info, payload, worksheet],
  );

  const persist = useCallback(
    async (nextPayload: Payload, nextStep: number) => {
      if (!info || !startedAt) return;
      const toSave = { ...nextPayload, [UI_KEY]: { step: nextStep } };
      try {
        await saveDraft(token, {
          cycle_label: info.current_cycle_label,
          payload: toSave,
          started_at: startedAt,
        });
        setSaveProblem('');
      } catch {
        setSaveProblem(
          'Your answers are on this screen but could not be saved just now. Try continuing again in a moment.',
        );
      }
    },
    [info, startedAt, token],
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
    const nextPayload = { ...payload, [UI_KEY]: { step: nextStep } };
    setPayload(nextPayload);
    await persist(payload, nextStep);
    setBusy(false);
    goTo(nextStep);
  }, [checkStep, goTo, nudgeKeysFor, payload, persist, step, stepIndex, steps.length]);

  const onBack = useCallback(() => {
    goTo(Math.max(stepIndex - 1, 0));
  }, [goTo, stepIndex]);

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
      <Shell info={info} accent={accent} progress={null}>
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
              setStartedAt(new Date().toISOString());
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
    const doneGoal = (info.last_cycle_status ?? []).find((entry) => entry.status === 'Done');
    return (
      <Shell info={info} accent={accent} progress={null}>
        <h1 className="text-[22px] font-semibold leading-tight">Submitted. Thank you.</h1>
        {doneGoal ? (
          <p className="mt-4 text-[15px] leading-relaxed text-[var(--ink-soft)]">
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

  const progress =
    step?.kind === 'section'
      ? { current: (step.index ?? 0) + 1, total: sectionCount }
      : null;

  return (
    <Shell info={info} accent={accent} progress={progress} topRef={topRef}>
      {step?.kind === 'note' ? (
        <div>
          <h1 className="text-[22px] font-semibold leading-tight">
            You left yourself a note last time
          </h1>
          <div className="mt-4">
            <Card>
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
                <h1 className="text-[22px] font-semibold leading-tight">Closing the loop</h1>
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
              <h1 className="text-[22px] font-semibold leading-tight">Before you start</h1>
              <p className="mt-3 text-[15px] leading-relaxed text-[var(--ink-soft)]">
                This is your first one, so there is nothing to look back on yet. Next time there
                will be.
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
          onEdit={(target) => goTo(target)}
          steps={steps}
          onNoteChange={(value) => setValue('note_to_self', value)}
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

function Shell({
  info,
  accent,
  progress,
  topRef,
  children,
}: {
  info: FormInfo;
  accent: string;
  progress: { current: number; total: number } | null;
  topRef?: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}) {
  return (
    <main
      className="mx-auto w-full max-w-md px-5 pb-10 pt-6"
      style={{ ['--accent' as string]: accent }}
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
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold">{info.name}</p>
          <p className="truncate text-[13px] text-[var(--ink-soft)]">
            This month, {monthName(info.current_cycle_label)}
          </p>
        </div>
      </header>

      {progress ? (
        <div className="mt-5">
          <p className="text-[13px] font-medium text-[var(--ink-soft)]">
            Section {progress.current} of {progress.total}
          </p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--line)]">
            <div
              className="h-full rounded-full transition-[width]"
              style={{
                background: accent,
                width: `${(progress.current / progress.total) * 100}%`,
              }}
            />
          </div>
        </div>
      ) : null}

      <div className="mt-6">{children}</div>
    </main>
  );
}

function SectionView({
  section,
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

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-semibold leading-tight">{section.title}</h1>
        {isFirstSection ? (
          <p className="mt-3 text-[14px] leading-relaxed text-[var(--ink-soft)]">
            {VOICE_TYPING_HINT}
          </p>
        ) : null}
        {section.framing ? (
          <div className="mt-3">
            <Framing>{section.framing}</Framing>
          </div>
        ) : null}
      </div>

      {section.fields.map((field: Field, fieldIndex) => {
        if (field.kind === 'my_area') {
          const knownName = info.my_area;
          const showPicker = !knownName || changingArea;
          return (
            <Card key="my_area">
              <p className="text-[13px] font-semibold uppercase tracking-wide text-[var(--ink-soft)]">
                Your area
              </p>
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
            <Card key={field.id}>
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

        if (field.kind === 'goals3') {
          return (
            <div key="goals3" className="flex flex-col gap-4">
              {[0, 1, 2].map((row) => {
                const goal = payload.goals?.[row] ?? {};
                return (
                  <Card key={row}>
                    <p className="text-[13px] font-semibold uppercase tracking-wide text-[var(--ink-soft)]">
                      Goal {row + 1}
                    </p>
                    <div className="mt-3 flex flex-col gap-4">
                      <TextAnswer
                        label="The goal"
                        value={goal.goal ?? ''}
                        onChange={(value) => setGoal(row, 'goal', value)}
                        problem={problems[`goal.${row}.goal`]}
                        long
                      />
                      <TextAnswer
                        label="Owner"
                        value={goal.owner ?? info.name}
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
              })}
            </div>
          );
        }

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
}: {
  info: FormInfo;
  payload: Payload;
  accent: string;
  onEdit: (stepIndex: number) => void;
  steps: Step[];
  onNoteChange: (value: string) => void;
}) {
  const worksheet = WORKSHEETS[info.template_type];
  const loopStepIndex = steps.findIndex((step) => step.kind === 'loop');

  const EditLink = ({ target }: { target: number }) => (
    <button
      type="button"
      onClick={() => onEdit(target)}
      className="text-[14px] font-semibold underline"
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

      <Card>
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
          <Card key={section.title}>
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

      <Card>
        <TextAnswer
          label={NOTE_TO_SELF_LABEL}
          value={payload.note_to_self ?? ''}
          onChange={onNoteChange}
          long
        />
      </Card>
    </div>
  );
}
