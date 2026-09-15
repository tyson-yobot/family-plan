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
import { accentFor, accentStyle, initialsFor } from '@/lib/theme';
import { sectionGuide } from '@/lib/guide';
import { Icon, type IconName } from './icons';
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
  const total = overview.people.length;
  return (
    <div>
      {/* The five people lead, not a brand. */}
      <div className="flex items-center gap-4">
        <MonthRing done={done} total={total} />
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold leading-tight">
            {monthName(overview.current_cycle_label)}
          </h1>
          <p className="mt-1 text-[15px] leading-snug text-[var(--ink-soft)]">
            {done === total
              ? 'Everyone has done this month.'
              : `${done} of ${total} done so far.`}
          </p>
        </div>
      </div>

      {/*
        Why this page exists, said once, near the top where it is actually read.
        It is deliberately about what happens to a month after it is sent, and
        says nothing about who can see what: that wording lives on the check-in
        itself and is not restated or contradicted here.
      */}
      <p className="mt-5 text-[15px] leading-relaxed">
        Everything anyone sends lands here and stays, so a month can be read again a year from
        now. It is here to be read and talked about together, not to score anybody.
      </p>
      <p className="mt-3 text-[14px] leading-relaxed text-[var(--ink-soft)]">
        Tap a name to read their answers. Nothing on these pages can change or delete what
        somebody wrote.
      </p>

      <div className="mt-6 flex flex-col gap-3">
        {overview.people.map((entry) => (
          <PersonRow key={entry.slug} entry={entry} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

/**
 * How much of this month is in, as a ring rather than only a sentence.
 *
 * It counts finished check-ins and nothing else. There is deliberately no score
 * on it, no ordering and no comparison between people: who has finished is a
 * fact a parent needs, how well anybody did is not something this tool ranks.
 */
function MonthRing({ done, total }: { done: number; total: number }) {
  const fraction = total > 0 ? done / total : 0;
  // r=26 on a 64 grid, so the circumference is 163.4.
  const circumference = 2 * Math.PI * 26;
  return (
    <span className="relative flex h-16 w-16 shrink-0 items-center justify-center">
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <circle cx="32" cy="32" r="26" stroke="var(--line)" strokeWidth="5" />
        <circle
          cx="32"
          cy="32"
          r="26"
          stroke="#1c1917"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          transform="rotate(-90 32 32)"
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <span className="absolute text-[15px] font-semibold tabular-nums">
        {done}/{total}
      </span>
    </span>
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
  // Nothing here knows whether somebody opened their link, only whether they
  // have written anything, so the wording says what is actually known.
  if (entry.submitted_at) status = `Done, ${dayAndMonth(entry.submitted_at)}`;
  else if (entry.started_at) status = 'Started, not finished yet';
  else if (entry.total_submissions === 0) status = 'Nothing from them yet';
  else status = 'Nothing this month yet';

  const finished = Boolean(entry.submitted_at);
  const started = !finished && Boolean(entry.started_at);

  return (
    <button
      type="button"
      onClick={() => onOpen(entry.slug)}
      className="flex w-full items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 text-left"
      style={accentStyle(accent) as React.CSSProperties}
    >
      {/*
        Finishing shows as a ring closed round their own initial, and being part
        way through as the same ring half drawn. It replaces a two millimetre
        dot, and it is the same treatment for everybody: the only thing it ever
        says is whether this month is in.
      */}
      <span className="relative flex h-14 w-14 shrink-0 items-center justify-center">
        <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true">
          <circle cx="28" cy="28" r="25" stroke="var(--line)" strokeWidth="3" />
          {finished || started ? (
            <circle
              cx="28"
              cy="28"
              r="25"
              stroke={accent}
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 25}
              strokeDashoffset={finished ? 0 : 2 * Math.PI * 25 * 0.6}
              transform="rotate(-90 28 28)"
            />
          ) : null}
        </svg>
        <span
          className="absolute flex h-10 w-10 items-center justify-center rounded-full text-[16px] font-semibold text-white"
          style={{ background: accent }}
          aria-hidden="true"
        >
          {initialsFor(entry.name)}
        </span>
        {finished ? (
          <span
            className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full text-white"
            style={{ background: accent, boxShadow: '0 0 0 2px var(--card)' }}
            aria-hidden="true"
          >
            <Icon name="check" size={12} strokeWidth={2.6} />
          </span>
        ) : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-semibold">{entry.name}</span>
        <span className="block text-[14px] text-[var(--ink-soft)]">{status}</span>
      </span>
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
    <div style={accentStyle(accent) as React.CSSProperties}>
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

      {worksheet.sections.map((section, sectionIndex) => (
        <Block
          key={section.title}
          title={section.title}
          icon={sectionGuide(submission.template_type, sectionIndex).icon}
        >
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

function Block({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: IconName;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-5 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4">
      <div className="flex items-center gap-2.5">
        {icon ? (
          <span className="shrink-0" style={{ color: 'var(--accent-ink)' }} aria-hidden="true">
            <Icon name={icon} size={18} />
          </span>
        ) : null}
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--ink-soft)]">
          {title}
        </h2>
      </div>
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
