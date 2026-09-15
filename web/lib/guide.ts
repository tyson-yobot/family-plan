/**
 * The look-and-feel layer over the worksheets: which icon belongs to which
 * section and which life area, and the one-line description of each section
 * shown on the "what this is" screen.
 *
 * Deliberately separate from web/lib/worksheets.ts. That file is the content,
 * decided on purpose and not to be reworded here. This file is the container:
 * pictures and signposting. Nothing in here changes a single question.
 *
 * Sections are keyed by position rather than by title, so that a title can
 * never be edited into a missing icon.
 */

import type { IconName } from '@/components/icons';
import type { TemplateName } from './worksheets';

export interface SectionGuide {
  icon: IconName;
  /** One plain line saying what this section asks for. Signposting, not content. */
  blurb: string;
}

const ADULT_GUIDE: SectionGuide[] = [
  { icon: 'compass', blurb: 'Eleven parts of your life, scored honestly, a line each on why.' },
  { icon: 'flag', blurb: 'Ten years out, three years, one year, written as if it already happened.' },
  { icon: 'target', blurb: 'Three goals for the next ninety days, and the first step on each one.' },
  { icon: 'wallet', blurb: 'The real figures. Anything you do not know is allowed to say so.' },
  { icon: 'shield', blurb: 'How you decide, and what you protect when a week turns ordinary.' },
  { icon: 'calendar', blurb: 'When you next sit down and look at all of this again.' },
];

const TEEN_GUIDE: SectionGuide[] = [
  { icon: 'compass', blurb: 'Your own thing to look after, and five parts of life, scored honestly.' },
  { icon: 'flag', blurb: 'One goal for the month, one thing you want more of, one thing less.' },
  { icon: 'house', blurb: 'How your zone actually went this month, in a tap and a line.' },
  { icon: 'message', blurb: 'Room to say anything that did not fit anywhere above.' },
];

const YOUNG_ADULT_GUIDE: SectionGuide[] = [
  { icon: 'compass', blurb: 'Your own thing to look after, and six parts of life, scored honestly.' },
  { icon: 'flag', blurb: 'One goal for the month, one thing you want more of, one thing less.' },
  { icon: 'house', blurb: 'How your zone actually went this month, in a tap and a line.' },
  { icon: 'message', blurb: 'Room to say anything that did not fit anywhere above.' },
];

export const SECTION_GUIDES: Record<TemplateName, SectionGuide[]> = {
  adult: ADULT_GUIDE,
  teen: TEEN_GUIDE,
  young_adult: YOUNG_ADULT_GUIDE,
};

export function sectionGuide(template: TemplateName, index: number): SectionGuide {
  // A section with no entry still gets a picture rather than a hole in the row.
  return SECTION_GUIDES[template][index] ?? { icon: 'compass', blurb: '' };
}

/**
 * One icon per scored life area, across all three worksheets. Ids are unique
 * within a worksheet but `self_feeling` is deliberately shared by the teen and
 * young-adult ones, and means the same thing on both.
 */
const AREA_ICONS: Record<string, IconName> = {
  // adult
  health_energy: 'heart',
  fitness_movement: 'activity',
  money_security: 'wallet',
  work_business: 'briefcase',
  growth_learning: 'book',
  mind_emotional: 'cloud',
  home: 'house',
  fun_travel_rest: 'sun',
  faith_meaning: 'star',
  friendships_community: 'users',
  creative_work: 'pen',
  // teen
  school: 'book',
  friendships: 'users',
  chores_responsibility: 'house',
  self_feeling: 'heart',
  fun_free_time: 'sun',
  // young adult
  direction_purpose: 'compass',
  work_income: 'briefcase',
  responsibility_home: 'house',
  money: 'wallet',
  relationships: 'users',
};

export function areaIcon(id: string): IconName {
  return AREA_ICONS[id] ?? 'compass';
}

/** The one thing around the house that is theirs, on the teen and young-adult sheets. */
export const MY_AREA_ICON: IconName = 'star';

/** The three ninety-day goals on the adult sheet. */
export const GOAL_ICON: IconName = 'target';

/** Looking back at last month's goals, before this month starts. */
export const LOOP_ICON: IconName = 'flag';

/** Their own note from last time, read back before anything else. */
export const NOTE_ICON: IconName = 'message';
