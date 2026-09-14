'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  dayAndMonth,
  fetchOverview,
  fetchPerson,
  fetchSubmission,
  monthName,
  type DashboardOverview,
  type DashboardPerson,
  type FullSubmission,
  type PersonHistory,
} from '@/lib/dashboard';
import { accentFor, initialsFor } from '@/lib/theme';
import { WORKSHEETS, type Field, type Section } from '@/lib/worksheets';

type View =
  | { kind: 'overview' }
  | { kind: 'person'; slug: string }
  | { kind: 'submission'; id: string };

export function ParentView({ token }: { token: string }) {
  const [state, setState] = useState<'loading' | 'invalid' | 'failed' | 'ready'>('loading');
  const [error, setError] = useState('');
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [view, setView] = useState<View>({ kind: 'overview' });
  const [person, setPerson] = useState<PersonHistory | null>(null);
  const [submission, setSubmission] = useState<FullSubmission | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await fetchOverview(token);
        if (cancelled) return;
        if (!loaded) {
          setState('invalid');
          return;
        }
        setOverview(loaded);
        setState('ready');
      } catch (problem) {
        if (cancelled) return;
        setError(problem instanceof Error ? problem.message : 'Something went wrong.');
        setState('failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const openPerson = useCallback(
    async (slug: string) => {
      setView({ kind: 'person', slug });
      setPerson(null);
      window.scrollTo({ top: 0 });
      setPerson(await fetchPerson(token, slug));
    },
    [token],
  );

  const openSubmission = useCallback(
    async (id: string) => {
      setView({ kind: 'submission', id });
      setSubmission(null);
      window.scrollTo({ top: 0 });
      setSubmission(await fetchSubmission(token, id));
    },
    [token],
  );

  if (state === 'loading') {
    return <Frame>{<p className="text-[15px] text-[var(--ink-soft)]">Opening.</p>}</Frame>;
  }
  if (state === 'invalid') {
    return <Frame>{<p className="text-[17px]">This link isn&apos;t valid.</p>}</Frame>;
  }
  if (state === 'failed' || !overview) {
    return (
      <Frame>
        <p className="text-[17px]">This could not be opened just now.</p>
        <p className="mt-2 text-[15px] text-[var(--ink-soft)]">{error}</p>
      </Frame>
    );
  }

  if (view.kind === 'submission') {
    return (
      <Frame>
        <BackLink onClick={() => (person ? openPerson(person.slug) : setView({ kind: 'overview' }))} />
        {submission ? <SubmissionView submission={submission} /> : <Loading />}
      </Frame>
    );
  }

  if (view.kind === 'person') {
    return (
      <Frame>
        <BackLink onClick={() => setView({ kind: 'overview' })} />
        {person ? (
          <PersonView person={person} onOpen={openSubmission} />
        ) : (
          <Loading />
        )}
      </Frame>
    );
  }

  return (
    <Frame>
      <Overview overview={overview} onOpen={openPerson} />
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto w-full max-w-md px-5 pb-12 pt-6">{children}</main>;
}

function Loading() {
  return <p className="text-[15px] text-[var(--ink-soft)]">Opening.</p>;
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-5 text-[15px] font-semibold text-[var(--ink-soft)] underline"
    >
      Back
    </button>
  );
}

function Overview({
  overview,
  onOpen,
}: {
  overview: DashboardOverview;
  onOpen: (slug: string) => void;
}) {
  const done = overview.people.filter((p) => p.submitted_at).length;
  return (
    <div>
      {/* The five people lead, not a brand. */}
      <h1 className="text-[22px] font-semibold leading-tight">
        {monthName(overview.current_cycle_label)}
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-[var(--ink-soft)]">
        {done === overview.people.length
          ? 'Everyone has done this month.'
          : `${done} of ${overview.people.length} done so far. Tap a name to read their answers.`}
      </p>

      <div className="mt-6 flex flex-col gap-3">
        {overview.people.map((entry) => (
          <PersonRow key={entry.slug} entry={entry} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

function PersonRow({
  entry,
  onOpen,
}: {
  entry: DashboardPerson;
  onOpen: (slug: string) => void;
}) {
  const accent = accentFor(entry.slug);
  let status: string;
  if (entry.submitted_at) status = `Done, ${dayAndMonth(entry.submitted_at)}`;
  else if (entry.started_at) status = 'Started, not finished yet';
  else if (entry.total_submissions === 0) status = 'Has not opened it yet';
  else status = 'Not started this month';

  return (
    <button
      type="button"
      onClick={() => onOpen(entry.slug)}
      className="flex w-full items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 text-left"
    >
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[17px] font-semibold text-white"
        style={{ background: accent }}
        aria-hidden="true"
      >
        {initialsFor(entry.name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-semibold">{entry.name}</span>
        <span className="block text-[14px] text-[var(--ink-soft)]">{status}</span>
      </span>
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: entry.submitted_at ? accent : 'var(--line)' }}
        aria-hidden="true"
      />
    </button>
  );
}

function PersonView({
  person,
  onOpen,
}: {
  person: PersonHistory;
  onOpen: (id: string) => void;
}) {
  const accent = accentFor(person.slug);
  return (
    <div>
      <div className="flex items-center gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[17px] font-semibold text-white"
          style={{ background: accent }}
          aria-hidden="true"
        >
          {initialsFor(person.name)}
        </span>
        <h1 className="text-[22px] font-semibold leading-tight">{person.name}</h1>
      </div>

      {person.submissions.length === 0 ? (
        <p className="mt-6 text-[15px] leading-relaxed text-[var(--ink-soft)]">
          {person.name} has not finished a check-in yet. Once they do, every month they have
          done will be listed here, newest first.
        </p>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {person.submissions.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => onOpen(entry.id)}
              className="w-full rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 text-left"
            >
              <span className="block text-[16px] font-semibold">
                {monthName(entry.cycle_label)}
              </span>
              <span className="block text-[14px] text-[var(--ink-soft)]">
                Submitted {dayAndMonth(entry.submitted_at)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SubmissionView({ submission }: { submission: FullSubmission }) {
  const worksheet = WORKSHEETS[submission.template_type];
  const payload = submission.payload as Record<string, any>;
  const accent = accentFor(submission.slug);

  const goalStatus = Array.isArray(payload.goal_status) ? payload.goal_status : [];

  return (
    <div style={{ ['--accent' as string]: accent }}>
      <h1 className="text-[22px] font-semibold leading-tight">
        {submission.name}, {monthName(submission.cycle_label)}
      </h1>
      <p className="mt-2 text-[14px] text-[var(--ink-soft)]">
        Submitted {dayAndMonth(submission.submitted_at)}
      </p>

      {goalStatus.length > 0 || payload.went_beyond || payload.try_differently ? (
        <Block title="Looking back">
          {goalStatus.map((entry: any, i: number) => (
            <div key={i} className="mt-3 first:mt-0">
              <p className="text-[15px] leading-snug">{entry.goal}</p>
              <p className="mt-0.5 text-[14px] font-medium" style={{ color: accent }}>
                {entry.status}
              </p>
              {entry.reflection ? (
                <p className="mt-0.5 text-[15px] leading-relaxed">{entry.reflection}</p>
              ) : null}
            </div>
          ))}
          {payload.try_differently ? (
            <Answer
              label={worksheet.tryDifferentlyLabel ?? 'One thing to try differently'}
              value={payload.try_differently}
            />
          ) : null}
          <Answer label={worksheet.initiativeLabel} value={payload.went_beyond ?? ''} />
        </Block>
      ) : null}

      {worksheet.sections.map((section) => (
        <Block key={section.title} title={section.title}>
          {section.fields.map((field, index) => (
            <SubmissionField key={index} field={field} section={section} payload={payload} />
          ))}
        </Block>
      ))}

      {payload.note_to_self ? (
        <Block title="Their note to themselves">
          <p className="text-[15px] leading-relaxed">{payload.note_to_self}</p>
          <p className="mt-3 text-[13px] leading-relaxed text-[var(--ink-soft)]">
            They wrote this for themselves, to read at the start of next month.
          </p>
        </Block>
      ) : null}
    </div>
  );
}

function SubmissionField({
  field,
  section,
  payload,
}: {
  field: Field;
  section: Section;
  payload: Record<string, any>;
}) {
  if (field.kind === 'my_area') {
    const area = payload.my_area ?? {};
    return (
      <div>
        <Answer label="The thing they picked as theirs" value={area.name ?? ''} />
        <Answer
          label={`${field.scoreLabel}, out of ${field.scoreMax}`}
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
        label={`${field.label}, ${entry.score ?? 'no score'} of ${section.scoreMax ?? 10}`}
        value={entry.reason ?? ''}
      />
    );
  }
  if (field.kind === 'goals3') {
    return (
      <div>
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
      <div>
        <Answer label={field.label} value={chosen} />
        {followup ? <Answer label={followup.label} value={payload[followup.id] ?? ''} /> : null}
      </div>
    );
  }
  return <Answer label={field.label} value={payload[field.id] ?? ''} />;
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--ink-soft)]">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Answer({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-3 first:mt-0">
      <p className="text-[13px] font-medium text-[var(--ink-soft)]">{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap text-[15px] leading-relaxed">
        {value.trim() === '' ? 'Left blank' : value}
      </p>
    </div>
  );
}
