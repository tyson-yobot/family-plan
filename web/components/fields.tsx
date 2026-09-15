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
    <p data-problem className="mt-1.5 text-[13px] font-medium leading-snug text-[#B3261E]">
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
    'mt-2 w-full rounded-xl border bg-[var(--card)] px-3.5 py-3 text-[16px] leading-relaxed outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/25';
  const border = problem ? 'border-[#B3261E]' : 'border-[var(--line)]';

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
              className={`rounded-xl border py-2.5 text-[15px] font-semibold transition-colors ${
                selected
                  ? 'border-transparent text-white'
                  : 'border-[var(--line)] bg-[var(--card)] text-[var(--ink)]'
              }`}
              style={selected ? { background: 'var(--accent)' } : undefined}
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
                  ? 'border-transparent text-white'
                  : 'border-[var(--line)] bg-[var(--card)] text-[var(--ink)]'
              }`}
              style={selected ? { background: 'var(--accent)' } : undefined}
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
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-[0_1px_2px_rgba(28,25,23,0.04)]">
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
