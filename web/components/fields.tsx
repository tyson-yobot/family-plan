'use client';

import { useId } from 'react';
import { IconBadge, type IconName } from './icons';

export const SHORT_ANSWER_NUDGE = 'A full sentence helps more than a word or two.';

/** Below this many characters, an open reflection field gets the quiet nudge. */
export const NUDGE_THRESHOLD = 15;

export function needsNudge(value: string | undefined): boolean {
  const text = (value ?? '').trim();
  return text.length > 0 && text.length < NUDGE_THRESHOLD;
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-[13px] leading-snug text-[var(--ink-soft)]">{children}</p>;
}

/**
 * Marked with data-problem so the page can scroll to the first one. Without
 * that, pressing continue at the bottom of a long section looks like the button
 * is broken when the missing answer is somewhere above the fold.
 */
function Problem({ children }: { children: React.ReactNode }) {
  return (
    <p data-problem className="mt-1.5 text-[13px] font-medium leading-snug text-[var(--bad)]">
      {children}
    </p>
  );
}

interface TextAnswerProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  long?: boolean;
  /** Set when the person tried to move on and left a required field empty. */
  problem?: string;
  /** Set when the answer is very short. Never blocks anything. */
  nudge?: boolean;
  onBlur?: () => void;
}

export function TextAnswer({
  label,
  value,
  onChange,
  placeholder,
  long,
  problem,
  nudge,
  onBlur,
}: TextAnswerProps) {
  const id = useId();
  const shared =
    'mt-2 w-full rounded-xl border bg-[var(--page)] px-3.5 py-3 text-[16px] leading-relaxed outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/30';
  const border = problem ? 'border-[var(--bad)]' : 'border-[var(--line)]';

  return (
    <div>
      <label htmlFor={id} className="block text-[15px] font-medium leading-snug">
        {label}
      </label>
      {long ? (
        <textarea
          id={id}
          rows={4}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          className={`${shared} ${border} resize-y`}
        />
      ) : (
        <input
          id={id}
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          className={`${shared} ${border}`}
        />
      )}
      {problem ? <Problem>{problem}</Problem> : null}
      {!problem && nudge ? <Hint>{SHORT_ANSWER_NUDGE}</Hint> : null}
    </div>
  );
}

interface ScorePickerProps {
  label: string;
  min: number;
  max: number;
  value: number | undefined;
  onChange: (value: number) => void;
  problem?: string;
}

/**
 * The words on the ends of the scale.
 *
 * The pickers used to be bare numbers, which asks an eleven year old to guess
 * which end is the good one. These are the only two labels, at the bottom and
 * the top, because putting a word on all ten turns a quick judgement into ten
 * things to read.
 *
 * They are the same words on the one-to-five scale as on the one-to-ten one on
 * purpose: the ends mean the same thing on both, and giving the teen worksheet
 * gentler words would be telling two people the scale means two things.
 */
export const SCALE_LOW = 'Rough';
export const SCALE_HIGH = 'As good as it gets';

export function ScorePicker({ label, min, max, value, onChange, problem }: ScorePickerProps) {
  const options: number[] = [];
  for (let i = min; i <= max; i++) options.push(i);

  return (
    <div>
      <p className="text-[15px] font-medium leading-snug">{label}</p>
      <div
        className="mt-2 grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${max > 5 ? 5 : max}, minmax(0, 1fr))` }}
        role="group"
        aria-label={label}
      >
        {options.map((option) => {
          const selected = value === option;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option)}
              // The number is what the picker is for, so the low and high
              // words below are labelled on the buttons themselves as well.
              // Otherwise the only thing telling somebody using a screen
              // reader which end is which is a caption they have already
              // passed.
              aria-label={
                option === min
                  ? `${option}, ${SCALE_LOW}`
                  : option === max
                    ? `${option}, ${SCALE_HIGH}`
                    : String(option)
              }
              className={`rounded-xl border py-2.5 text-[15px] font-semibold transition-colors ${
                selected
                  ? 'border-transparent'
                  : 'border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)]'
              }`}
              style={selected ? { background: 'var(--accent)', color: 'var(--on-accent)' } : undefined}
            >
              {option}
            </button>
          );
        })}
      </div>
      <div className="mt-1.5 flex items-baseline justify-between gap-3" aria-hidden="true">
        <span className="text-[12px] text-[var(--ink-soft)]">
          {min} · {SCALE_LOW}
        </span>
        <span className="text-right text-[12px] text-[var(--ink-soft)]">
          {max} · {SCALE_HIGH}
        </span>
      </div>
      {problem ? <Problem>{problem}</Problem> : null}
    </div>
  );
}

interface ChoicePickerProps {
  label: string;
  options: string[];
  value: string | undefined;
  onChange: (value: string) => void;
  problem?: string;
}

export function ChoicePicker({ label, options, value, onChange, problem }: ChoicePickerProps) {
  return (
    <div>
      <p className="text-[15px] font-medium leading-snug">{label}</p>
      <div className="mt-2 flex flex-col gap-2" role="group" aria-label={label}>
        {options.map((option) => {
          const selected = value === option;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option)}
              className={`rounded-xl border px-4 py-3 text-left text-[15px] font-medium transition-colors ${
                selected
                  ? 'border-transparent'
                  : 'border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)]'
              }`}
              style={selected ? { background: 'var(--accent)', color: 'var(--on-accent)' } : undefined}
            >
              {option}
            </button>
          );
        })}
      </div>
      {problem ? <Problem>{problem}</Problem> : null}
    </div>
  );
}

/**
 * A question, or a small group of them.
 *
 * The optional icon and heading are what break up the wall of text. They are
 * signposting only: the icon is decorative and the question's own label is
 * still the thing a screen reader reads out, so nothing here is the only way to
 * know what is being asked.
 */
export function Card({
  children,
  icon,
  heading,
}: {
  children: React.ReactNode;
  icon?: IconName;
  heading?: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-4">
      {icon ? (
        <div className={`flex items-center gap-3 ${heading ? 'mb-3' : 'mb-1'}`}>
          <IconBadge name={icon} size={36} />
          {heading ? (
            <p className="min-w-0 text-[13px] font-semibold uppercase tracking-wide text-[var(--ink-soft)]">
              {heading}
            </p>
          ) : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

export function Framing({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[15px] leading-relaxed text-[var(--ink-soft)]">{children}</p>
  );
}
