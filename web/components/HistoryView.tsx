'use client';

import { useEffect, useState } from 'react';
import { fetchHistory, NeedsCodeError, type History } from '@/lib/api';
import { areaIcon } from '@/lib/guide';
import { shortMonthName } from '@/lib/month';
import { WORKSHEETS } from '@/lib/worksheets';
import { Icon } from './icons';

/**
 * Their own history, and only ever their own.
 *
 * Three things, all of them about one person: how each part of life has scored
 * over the months, every goal they have ever set and how it ended, and their
 * own run of months.
 *
 * There is no comparison anywhere in it and that is deliberate rather than
 * unbuilt. Nothing here is put next to anybody else's number, because the point
 * of a score is to tell you something about your own last few months and it
 * stops doing that the moment it becomes a position in a league.
 */

/** The scored areas this person's own worksheet asks about, in its own order. */
function areasFor(history: History): { id: string; label: string }[] {
  const worksheet = WORKSHEETS[history.template_type];
  const found: { id: string; label: string }[] = [];
  for (const section of worksheet.sections) {
    for (const field of section.fields) {
      if (field.kind === 'area') found.push({ id: field.id, label: field.label });
    }
  }
  return found;
}

function scoreMaxFor(history: History): number {
  const worksheet = WORKSHEETS[history.template_type];
  for (const section of worksheet.sections) {
    if (section.scoreMax) return section.scoreMax;
  }
  return 10;
}

export function HistoryView({ slug, onNeedsCode }: { slug: string; onNeedsCode: () => void }) {
  const [history, setHistory] = useState<History | null>(null);
  const [state, setState] = useState<'loading' | 'failed' | 'ready'>('loading');
  const [problem, setProblem] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await fetchHistory(slug);
        if (cancelled) return;
        setHistory(loaded);
        setState('ready');
      } catch (error) {
        if (cancelled) return;
        if (error instanceof NeedsCodeError) {
          onNeedsCode();
          return;
        }
        setProblem(error instanceof Error ? error.message : 'Something went wrong.');
        setState('failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onNeedsCode, slug]);

  if (state === 'loading') {
    return <p className="text-[15px] text-[var(--ink-soft)]">Opening your history.</p>;
  }
  if (state === 'failed' || !history) {
    return (
      <div>
        <p className="text-[15px]">Your history could not be opened just now.</p>
        <p className="mt-2 text-[14px] text-[var(--ink-soft)]">{problem}</p>
      </div>
    );
  }

  const months = history.months;
  const areas = areasFor(history);
  const scoreMax = scoreMaxFor(history);
  const closed = history.goals.filter((goal) => goal.status !== 'open');
  const hit = closed.filter((goal) => goal.status === 'hit').length;

  if (months.length === 0 && history.goals.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-5">
        <span
          className="flex h-11 w-11 items-center justify-center rounded-xl"
          style={{ background: 'var(--accent-tint)', color: 'var(--accent-ink)' }}
          aria-hidden="true"
        >
          <Icon name="history" size={22} />
        </span>
        <p className="mt-4 text-[15.5px] font-semibold leading-snug">Nothing to look back on yet</p>
        <p className="mt-2 text-[14px] leading-relaxed text-[var(--ink-soft)]">
          Once you have finished a check-in, this is where your own scores over time and every goal
          you have set will live. It is yours and only yours, and it is never put next to anybody
          else&apos;s.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-4">
        <p className="kicker text-[11.5px] text-[var(--ink-soft)]">Yours so far</p>
        <div className="mt-3 flex gap-6">
          <span>
            <span className="display block text-[30px] leading-none" style={{ color: 'var(--accent)' }}>
              {months.length}
            </span>
            <span className="mt-1 block text-[12px] text-[var(--ink-soft)]">
              {months.length === 1 ? 'check-in' : 'check-ins'}
            </span>
          </span>
          <span>
            <span className="display block text-[30px] leading-none" style={{ color: 'var(--good)' }}>
              {hit}
            </span>
            <span className="mt-1 block text-[12px] text-[var(--ink-soft)]">
              {hit === 1 ? 'goal hit' : 'goals hit'}
            </span>
          </span>
          <span>
            <span className="display block text-[30px] leading-none">{history.goals.length}</span>
            <span className="mt-1 block text-[12px] text-[var(--ink-soft)]">
              {history.goals.length === 1 ? 'goal set' : 'goals set'}
            </span>
          </span>
        </div>
      </div>

      {months.length > 0 ? (
        <div>
          <p className="kicker text-[11.5px] text-[var(--ink-soft)]">Your scores, month by month</p>
          <p className="mt-2 text-[13px] leading-relaxed text-[var(--ink-soft)]">
            {months.length < 2
              ? `Out of ${scoreMax}. One month on its own is a starting point, not a trend. From next month these become lines you can read.`
              : `Out of ${scoreMax}, newest on the right. A line that climbs is worth noticing, and so is one that does not: a score that has sat still for three months is usually the one worth a goal.`}
          </p>
          <ul className="mt-3 flex flex-col gap-2.5">
            {areas.map((area) => (
              <li
                key={area.id}
                className="rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-3.5"
              >
                <div className="flex items-center gap-2.5">
                  <span style={{ color: 'var(--accent-ink)' }} aria-hidden="true">
                    <Icon name={areaIcon(area.id)} size={17} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">
                    {area.label}
                  </span>
                  <span className="shrink-0 text-[13px] tabular-nums text-[var(--ink-soft)]">
                    {months[months.length - 1]?.scores?.[area.id] ?? '—'} / {scoreMax}
                  </span>
                </div>
                <Sparkline
                  values={months.map((month) => month.scores?.[area.id] ?? null)}
                  labels={months.map((month) => shortMonthName(month.cycle_label))}
                  max={scoreMax}
                  label={area.label}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {history.goals.length > 0 ? (
        <div>
          <p className="kicker text-[11.5px] text-[var(--ink-soft)]">Every goal you have set</p>
          <ul className="mt-3 flex flex-col gap-2">
            {history.goals.map((goal) => (
              <li
                key={goal.id}
                className="flex items-start gap-2.5 rounded-xl border border-[var(--line)] px-3.5 py-3"
              >
                <span
                  className="mt-0.5 shrink-0"
                  style={{
                    color:
                      goal.status === 'hit'
                        ? 'var(--good)'
                        : goal.status === 'missed'
                          ? 'var(--warn)'
                          : goal.status === 'dropped'
                            ? 'var(--ink-soft)'
                            : 'var(--accent)',
                  }}
                  aria-hidden="true"
                >
                  <Icon name={goal.status === 'hit' ? 'trophy' : 'target'} size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] leading-snug">{goal.title}</span>
                  <span className="mt-1 block text-[12px] text-[var(--ink-soft)]">
                    {shortMonthName(goal.created_cycle_label)}
                    {' · '}
                    {goal.status === 'open'
                      ? 'still going'
                      : goal.status === 'hit'
                        ? 'hit it'
                        : goal.status === 'missed'
                          ? 'missed it'
                          : 'changed your mind'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/**
 * One area's scores over time.
 *
 * Drawn as bars rather than a line because a month with no score has to be a
 * gap rather than a straight segment between the months either side of it, and
 * a line quietly invents the missing one. The months are named underneath for
 * anybody who cannot read the shape, and the whole thing carries a text
 * description as well, so it is never the only way to get the numbers.
 */
function Sparkline({
  values,
  labels,
  max,
  label,
}: {
  values: (number | null)[];
  labels: string[];
  max: number;
  label: string;
}) {
  // Only the last six fit legibly on a phone, and older than that is history
  // rather than a trend.
  const shown = values.slice(-6);
  const shownLabels = labels.slice(-6);
  const described = shown
    .map((value, i) => `${shownLabels[i]}: ${value ?? 'not scored'}`)
    .join(', ');

  return (
    <>
      {/*
        One month is not a shape. Drawn as a single bar it filled the whole
        width and read as a progress meter towards something, which is not what
        a score out of ten is. So the first month says so in words instead.
      */}
      {shown.length < 2 ? // Nothing drawn. The score is already on the row above it, and the
      // paragraph over the whole list says why there is no shape yet, so
      // repeating that under every single area is six copies of one sentence.
      null : (
        <div className="mt-3 flex h-12 items-end gap-1.5" aria-hidden="true">
          {shown.map((value, i) => (
            <span key={i} className="flex flex-1 flex-col items-center gap-1">
              <span
                className="w-full rounded-[3px]"
                style={{
                  height: value ? `${Math.max(6, (value / max) * 34)}px` : '3px',
                  background: value ? 'var(--accent)' : 'var(--line)',
                }}
              />
              <span className="text-[9.5px] text-[var(--ink-soft)]">{shownLabels[i]}</span>
            </span>
          ))}
        </div>
      )}
      <p className="sr-only">
        {label}, out of {max}. {described}.
      </p>
    </>
  );
}
