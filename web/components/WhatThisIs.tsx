'use client';

import { SECTION_GUIDES } from '@/lib/guide';
import { WORKSHEETS, type TemplateName } from '@/lib/worksheets';
import { Icon, IconBadge } from './icons';

/**
 * The screen that says what a check-in actually is, before anybody is three
 * screens deep in one.
 *
 * It exists because the worksheet used to open on "Before you start" with no
 * idea of what came after it: plain text, no shape, no sense of how long or
 * what it would ask. Knowing the six things you are about to be asked about
 * costs one screen and removes the whole of that.
 *
 * Every word on it is signposting written for this screen. It does not repeat,
 * summarise or reword a single question from the worksheet itself.
 *
 * The same component is the first screen for a first-timer and the panel behind
 * the "What is this?" button for everybody else, so there is only ever one copy
 * of it to keep true.
 */
export function WhatThisIs({
  template,
  screenCount,
}: {
  template: TemplateName;
  /** How many screens this person's check-in actually is. Counted, not guessed. */
  screenCount: number;
}) {
  const worksheet = WORKSHEETS[template];
  const guides = SECTION_GUIDES[template];

  return (
    <div>
      <h1 className="text-[22px] font-semibold leading-tight">What a check-in is</h1>
      <p className="mt-3 text-[15px] leading-relaxed">
        Once a month you stop for a few minutes, say how things are actually going, and write
        down what you want to be different. That is the whole of it.
      </p>
      <p className="mt-3 text-[15px] leading-relaxed text-[var(--ink-soft)]">
        It is {screenCount} short screens, a few questions each. Every answer is kept as you
        write it, so you can put your phone down at any point and pick it up later exactly where
        you stopped.
      </p>

      <p className="mt-6 text-[13px] font-semibold uppercase tracking-wide text-[var(--ink-soft)]">
        What is inside
      </p>
      <ol className="mt-3 flex flex-col gap-3">
        {worksheet.sections.map((section, index) => (
          <li key={section.title} className="flex items-start gap-3">
            <IconBadge name={guides[index]?.icon ?? 'compass'} size={36} />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold leading-snug">
                {section.title}
              </span>
              <span className="mt-0.5 block text-[14px] leading-snug text-[var(--ink-soft)]">
                {guides[index]?.blurb}
              </span>
            </span>
          </li>
        ))}
      </ol>

      <div
        className="mt-6 flex items-start gap-3 rounded-2xl p-4"
        style={{ background: 'var(--accent-tint)' }}
      >
        <span className="mt-0.5 shrink-0" style={{ color: 'var(--accent-ink)' }}>
          <Icon name="heart" size={20} />
        </span>
        <p className="text-[14px] leading-relaxed">
          Nothing here is graded and there are no right answers. An honest low score is worth
          more than a tidy high one, and you can leave anything optional blank.
        </p>
      </div>
    </div>
  );
}
