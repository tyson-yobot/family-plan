/**
 * Every word shown on the three worksheets, and the shape of the answers.
 *
 * The field ids here must match the ones the API validates against, in
 * api/src/lib/templates.ts. The repo root script `npm run check:worksheet-ids`
 * compares the two, and runs as web's prebuild, so a drift fails this deploy
 * rather than producing a worksheet that can be filled in and then refuses to
 * submit. It does not gate the api deploy, which is still a gap.
 */

export type TemplateName = 'adult' | 'teen' | 'young_adult';

export interface AreaField {
  kind: 'area';
  id: string;
  label: string;
}

export interface TextField {
  kind: 'text';
  id: string;
  label: string;
  placeholder?: string;
  /** Long fields get a taller box. Everything is optional unless required is true. */
  long?: boolean;
  required?: boolean;
}

export interface ChoiceField {
  kind: 'choice';
  id: string;
  label: string;
  options: string[];
  /** The follow-up question depends on the answer, rather than a generic box. */
  followups: Record<string, { id: string; label: string }>;
}

export interface MyAreaField {
  kind: 'my_area';
  /** Asked the first time only. After that the previous answer is read back. */
  firstTimeLabel: string;
  scoreLabel: string;
  scoreMax: number;
  reasonLabel: string;
}

export interface GoalsField {
  kind: 'goals3';
}

export type Field = AreaField | TextField | ChoiceField | MyAreaField | GoalsField;

export interface Section {
  title: string;
  framing?: string;
  /** Score range for the area rows in this section. */
  scoreMin?: number;
  scoreMax?: number;
  fields: Field[];
}

export interface Worksheet {
  intro: string;
  /** Shown above the closing-the-loop step, saying what Done means. */
  doneMeans: string;
  /** Asked every cycle, after closing the loop, always optional. */
  initiativeLabel: string;
  /** Teen and young-adult worksheets only, and only when a goal slipped. */
  tryDifferentlyLabel?: string;
  sections: Section[];
}

export const VOICE_TYPING_HINT =
  "You can use your phone's voice typing for any question with more room to write.";

export const NOTE_TO_SELF_LABEL =
  "A note to yourself for next time, if you want one. You'll see this again right before your next check-in, nobody else does.";

const CHORES_FIELD: ChoiceField = {
  kind: 'choice',
  id: 'chores_rating',
  label: 'How did chores and your house zone go this month?',
  options: ['Great', 'OK', 'Rough'],
  followups: {
    Great: { id: 'chores_followup', label: 'What made it easier this month?' },
    OK: { id: 'chores_followup', label: 'What got in the way sometimes?' },
    Rough: { id: 'chores_followup', label: 'What got in the way?' },
  },
};

const ADULT: Worksheet = {
  intro:
    'Write the truth here, not what sounds good or what you think you should be. Nobody sees this but you and Tyson, through the private link it came from. You can save and come back, there is no need to finish this in one sitting.',
  doneMeans:
    "Done means it's actually finished the way you meant it when you set it, not started and moved on to something else.",
  initiativeLabel: 'Anything you did this cycle that nobody asked you to do?',
  sections: [
    {
      title: 'Where I am right now',
      framing:
        'Score each area from 1 to 10. A 1 means this is actively hurting your life. A 10 means this is as good as you could reasonably expect it to be. Then write one honest sentence about why you gave it that number. One sentence, not a paragraph, and do not write what you plan to do about it yet, that comes later.',
      scoreMin: 1,
      scoreMax: 10,
      fields: [
        { kind: 'area', id: 'health_energy', label: 'Health and energy' },
        { kind: 'area', id: 'fitness_movement', label: 'Fitness and movement' },
        { kind: 'area', id: 'money_security', label: 'Money and security' },
        { kind: 'area', id: 'work_business', label: 'Work and business' },
        { kind: 'area', id: 'growth_learning', label: 'Personal growth and learning' },
        { kind: 'area', id: 'mind_emotional', label: 'Mind and emotional health' },
        { kind: 'area', id: 'home', label: 'Home and where I live' },
        { kind: 'area', id: 'fun_travel_rest', label: 'Fun, travel, and rest' },
        { kind: 'area', id: 'faith_meaning', label: 'Faith and meaning' },
        { kind: 'area', id: 'friendships_community', label: 'Friendships and community' },
        { kind: 'area', id: 'creative_work', label: 'Creative work and expression' },
        {
          kind: 'text',
          id: 'most_want_different',
          label: 'The area I would most want to be different a year from now',
          long: true,
        },
        {
          kind: 'text',
          id: 'avoiding',
          label: 'The area I am probably avoiding',
          long: true,
        },
      ],
    },
    {
      title: 'Where I am going',
      framing:
        "Write in plain present tense, as if it's already happened. Not 'I want to' or 'I hope to.' Write 'I live in' and 'I work' and 'I have.'",
      fields: [
        {
          kind: 'text',
          id: 'ten_years',
          label:
            'Ten years out. Picture an ordinary Tuesday, ten years from now. Where do you wake up, what do you do that day, what are you not doing anymore?',
          placeholder: "Where do you wake up? Who's around? What do you do that day?",
          long: true,
        },
        {
          kind: 'text',
          id: 'three_years',
          label:
            'Three years out. What is true about your money, work, home, and health three years from now?',
          placeholder: "What's true about your money, your work, your home, your health?",
          long: true,
        },
        {
          kind: 'text',
          id: 'one_year',
          label:
            'One year out. What has to be true twelve months from now for the three-year picture to still be reachable?',
          placeholder: 'What has to be true twelve months from now?',
          long: true,
        },
        { kind: 'text', id: 'willing_to_trade', label: 'Willing to trade' },
        { kind: 'text', id: 'not_on_the_table', label: 'Not on the table, ever' },
      ],
    },
    {
      title: 'Next 90 days',
      framing:
        'Pick three goals, not eight. Test each one before you write it down: could a stranger look at this in ninety days and tell you yes or no, without asking how you feel about it? If not, it is a wish, and it needs rewriting. These three become your running goal list, checked at every review from here on, not words that get filed away.',
      fields: [{ kind: 'goals3' }],
    },
    {
      title: 'The money reality check',
      framing:
        "Write down real figures, not the estimate you're comfortable with. If you don't know a number, write 'unknown' and that becomes one of your ninety-day goals. The point isn't perfect numbers, it's seeing clearly.",
      fields: [
        { kind: 'text', id: 'monthly_income', label: 'Monthly income' },
        { kind: 'text', id: 'monthly_expenses', label: 'Monthly expenses' },
        {
          kind: 'text',
          id: 'savings',
          label: 'Savings, and how many months of expenses it covers',
          long: true,
        },
        { kind: 'text', id: 'debts', label: 'Debts, and to whom', long: true },
        {
          kind: 'text',
          id: 'unknown_number',
          label: "The one number I actually don't know right now",
          long: true,
        },
      ],
    },
    {
      title: 'The rules I run by',
      framing:
        'Short-term goals get abandoned in ordinary weeks, not dramatic ones. Writing the rules down now is what gets you through the ordinary weeks.',
      fields: [
        { kind: 'text', id: 'decide_big', label: 'How I decide something big', long: true },
        {
          kind: 'text',
          id: 'missed_commitment',
          label: 'What happens when I miss a commitment',
          long: true,
        },
        {
          kind: 'text',
          id: 'protected',
          label: "What's protected no matter how busy things get",
          long: true,
        },
        {
          kind: 'text',
          id: 'stopped_caring',
          label: "How I handle a goal I've quietly stopped caring about",
          long: true,
        },
      ],
    },
    {
      title: 'Review rhythm',
      fields: [
        { kind: 'text', id: 'weekly_review', label: 'Weekly review day and time' },
        { kind: 'text', id: 'monthly_review', label: 'Monthly review date' },
        { kind: 'text', id: 'quarterly_review', label: 'Quarterly review date and place' },
      ],
    },
  ],
};

const TEEN: Worksheet = {
  intro:
    "Be honest here, this isn't about getting in trouble. Only your parents read this, from your own private link.",
  doneMeans:
    "Done means it's actually finished the way you meant it, not started and moved on to something else.",
  initiativeLabel: 'Did you do anything this month that nobody asked you to do?',
  tryDifferentlyLabel:
    "What's one thing you could try differently, without someone telling you what it is?",
  sections: [
    {
      title: 'Right now',
      framing:
        "Rate each one honestly. 1 means it's rough right now. 5 means it's going really well. Nobody's grading you, this just helps you see where things stand.",
      scoreMin: 1,
      scoreMax: 5,
      fields: [
        {
          kind: 'my_area',
          firstTimeLabel:
            "Pick one thing around the house that's yours to take care of, in your own words.",
          scoreLabel: 'How does it look right now, honestly',
          scoreMax: 5,
          reasonLabel: 'Why that score',
        },
        { kind: 'area', id: 'school', label: 'School' },
        { kind: 'area', id: 'friendships', label: 'Friendships' },
        { kind: 'area', id: 'chores_responsibility', label: 'Chores and responsibility' },
        { kind: 'area', id: 'self_feeling', label: 'How I feel about myself' },
        { kind: 'area', id: 'fun_free_time', label: 'Fun and free time' },
      ],
    },
    {
      title: 'Looking ahead',
      framing: 'Pick one thing, not ten. Say it in your own words.',
      fields: [
        {
          kind: 'text',
          id: 'goal_this_month',
          label: 'One goal for this month',
          placeholder: "Something at school, at home, with a friend, whatever's real for you",
          long: true,
        },
        {
          kind: 'text',
          id: 'want_more',
          label: 'One thing I want more of',
          placeholder: 'Can be anything, big or small',
        },
        {
          kind: 'text',
          id: 'want_less',
          label: 'One thing I want less of',
          placeholder: 'Can be anything, big or small',
        },
      ],
    },
    {
      title: 'Chores and house zone check-in',
      fields: [CHORES_FIELD],
    },
    {
      title: 'Anything else',
      fields: [
        {
          kind: 'text',
          id: 'anything_else',
          label: 'Anything else you want to say.',
          long: true,
        },
      ],
    },
  ],
};

const YOUNG_ADULT: Worksheet = {
  intro:
    "Write this honestly, this isn't about getting caught out. It's the one place this month where you actually look at where things stand, in your own words. Only your parents read this, through your own private link.",
  doneMeans:
    "Done means it's actually finished the way you meant it, not started and moved on to something else.",
  initiativeLabel: 'Anything you did this month that nobody asked you to do?',
  tryDifferentlyLabel:
    "What's one thing you could try differently, without someone telling you what it is?",
  sections: [
    {
      title: 'Right now',
      framing:
        'Score each area from 1 to 10. A 1 means this is actively hurting your life right now. A 10 means this is as good as you could reasonably expect it to be. Then write one honest sentence about why you gave it that number.',
      scoreMin: 1,
      scoreMax: 10,
      fields: [
        {
          kind: 'my_area',
          firstTimeLabel:
            'Pick one real thing around the house that becomes yours to take care of, start to finish. Pick something real, not the easiest option available.',
          scoreLabel: 'How does it look right now, honestly',
          scoreMax: 5,
          reasonLabel: 'Why that score',
        },
        { kind: 'area', id: 'direction_purpose', label: 'Direction and purpose' },
        { kind: 'area', id: 'work_income', label: 'Work or income' },
        { kind: 'area', id: 'responsibility_home', label: 'Responsibility at home' },
        { kind: 'area', id: 'money', label: 'Money' },
        { kind: 'area', id: 'relationships', label: 'Relationships' },
        { kind: 'area', id: 'self_feeling', label: 'How I feel about myself' },
      ],
    },
    {
      title: 'Looking ahead',
      framing: 'Pick one thing, not ten. Say it in your own words.',
      fields: [
        { kind: 'text', id: 'goal_this_month', label: 'One goal for this month', long: true },
        { kind: 'text', id: 'want_more', label: 'One thing I want more of' },
        { kind: 'text', id: 'want_less', label: 'One thing I want less of' },
      ],
    },
    {
      title: 'Chores and house zone check-in',
      fields: [CHORES_FIELD],
    },
    {
      title: 'Anything else',
      fields: [
        {
          kind: 'text',
          id: 'anything_else',
          label: 'Anything else you want to say.',
          long: true,
        },
      ],
    },
  ],
};

export const WORKSHEETS: Record<TemplateName, Worksheet> = {
  adult: ADULT,
  teen: TEEN,
  young_adult: YOUNG_ADULT,
};
