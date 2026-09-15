'use client';

import { useEffect, useState } from 'react';

/**
 * The moments that mark finishing something.
 *
 * Two rules hold everywhere in this file. The first is that every word here is
 * about the act of showing up and finishing, never about what was written: the
 * same line appears whether somebody scored a two or a nine, because the tool
 * is pleased that they told the truth, not with the truth they told. The second
 * is that it is drawn in that person's own colour.
 *
 * Motion is honoured rather than removed when somebody has turned it off. The
 * ring and the tick are still there, already finished, instead of nothing.
 */

/** A ring drawn round a tick, in the person's own accent. */
export function FinishMark({ size = 64 }: { size?: number }) {
  // r=28 on a 64 grid, so the circumference is 176, which is the dash length
  // the ring-draw animation in globals.css counts down from.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="32" cy="32" r="28" stroke="var(--accent-tint)" strokeWidth="5" />
      <circle
        className="ring-draw"
        cx="32"
        cy="32"
        r="28"
        stroke="var(--accent)"
        strokeWidth="5"
        strokeLinecap="round"
        transform="rotate(-90 32 32)"
      />
      <path
        className="tick-draw"
        d="m21 33 7.5 7.5L43 25"
        stroke="var(--accent)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * One line per section, keyed by position so it is the same every time rather
 * than a different one on each render. None of them refers to an answer.
 */
const SECTION_LINES = [
  'Done. Nice work being honest about that one.',
  'That part is finished. You are doing the hard bit, which is showing up.',
  'Done. Thank you for taking this seriously.',
  'Finished. Saying how things actually are is not easy.',
  'Done. Steady going.',
  'That one is behind you. Keep going at your own pace.',
];

export function lineForSection(index: number): string {
  return SECTION_LINES[index % SECTION_LINES.length];
}

/**
 * Shown at the top of the next screen when a section has just been finished, so
 * that finishing is felt without costing anybody an extra tap. It takes itself
 * away after a few seconds.
 */
export function SectionDone({
  title,
  index,
  onDone,
}: {
  title: string;
  index: number;
  onDone: () => void;
}) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const fade = window.setTimeout(() => setLeaving(true), 5200);
    const clear = window.setTimeout(onDone, 5800);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(clear);
    };
  }, [onDone]);

  return (
    <div
      // Announced politely, because the banner is real information for somebody
      // who cannot see it, and rudely interrupting a form is worse than late.
      role="status"
      className={`lift-in mb-5 flex items-center gap-3 rounded-2xl p-4 transition-opacity duration-500 ${
        leaving ? 'opacity-0' : 'opacity-100'
      }`}
      style={{ background: 'var(--accent-tint)' }}
    >
      <FinishMark size={40} />
      <div className="min-w-0">
        <p className="text-[15px] font-semibold leading-snug">{title} is done</p>
        <p className="mt-0.5 text-[14px] leading-snug text-[var(--ink-soft)]">
          {lineForSection(index)}
        </p>
      </div>
    </div>
  );
}
