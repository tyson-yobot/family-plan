import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * A real Postgres enum, not a text column. An invalid template type has to fail
 * at the database, because a silent typo here would produce a broken worksheet
 * page that nobody notices until a real person opens their link.
 */
export const templateType = pgEnum('template_type', ['adult', 'teen', 'young_adult']);

export const people = pgTable('people', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  templateType: templateType('template_type').notNull(),
  accessToken: text('access_token').notNull().unique(),
  /**
   * Their own four-digit code, stored the way a password is stored: scrypt with
   * a per-person random salt, in the format produced by hashCode in
   * lib/codes.ts. Null until they set one, which is what makes the first visit
   * to their own name a "set your code" screen rather than a "type it in" one.
   *
   * Nothing anywhere can read a code back out of this. Tyson resetting one
   * clears the column; it never reveals what was there.
   */
  codeHash: text('code_hash'),
  codeSetAt: timestamp('code_set_at', { withTimezone: true }),
  /** Wrong codes in a row. Put back to zero by a correct one. */
  failedAttempts: integer('failed_attempts').notNull().default(0),
  /** Set while a run of wrong codes has locked this person out. */
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  /*
   * There is deliberately no birthday column here any more.
   *
   * There was one, unused and null for all five people, to support a rule that
   * refused a code matching the owner's date of birth. Tyson ruled on
   * 2026-09-15 that storing five dates of birth, three of them a child's, to
   * block a few hundred four-digit combinations is the wrong trade. The rule is
   * gone from lib/codes.ts and the column is gone from here, so nothing in this
   * codebase can read or write it.
   *
   * The physical column still exists on the production table: dropping one is a
   * destructive migration and those are Tyson's to approve, not a session's. It
   * is unreferenced and empty, so it holds no personal data while it waits.
   * scripts/pending/001-drop-people-birthday.sql is the whole of removing it.
   */
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A signed-in phone. One row per successful code entry.
 *
 * Only the hash of the session token is kept, on the same reasoning as the code
 * itself: a stolen copy of this table must not be usable as anybody's session.
 * Every private request carries the raw token and is refused unless it hashes
 * to a live row whose person is the person being asked about.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    personId: uuid('person_id')
      .notNull()
      .references(() => people.id),
    tokenHash: text('token_hash').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('sessions_person_idx').on(table.personId)],
);

/** One draft per person at a time, so person_id is unique rather than just a reference. */
export const drafts = pgTable('drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  personId: uuid('person_id')
    .notNull()
    .unique()
    .references(() => people.id),
  cycleLabel: text('cycle_label').notNull(),
  payload: jsonb('payload').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const submissions = pgTable(
  'submissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    personId: uuid('person_id')
      .notNull()
      .references(() => people.id),
    templateType: text('template_type').notNull(),
    cycleLabel: text('cycle_label').notNull(),
    payload: jsonb('payload').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('submissions_person_submitted_idx').on(table.personId, table.submittedAt)],
);

export const goalHorizon = pgEnum('goal_horizon', [
  'ninety_day',
  'one_year',
  'three_year',
  'ten_year',
]);

export const goalStatus = pgEnum('goal_status', ['open', 'hit', 'missed', 'dropped']);

/**
 * A goal on somebody's own board. This is the thing that turns a check-in from
 * a form into a system: a goal written in a check-in stays here as a living
 * item until its owner closes it, and next month's check-in asks about whatever
 * is still open rather than about whatever was written down last time.
 *
 * Several columns here have no interface in this release and are deliberate
 * room for the next one: parentGoalId, for hanging a ninety-day goal off a one,
 * three or ten year one; weeklyHabit and weeklyTargetCount, for the weekly
 * drumbeat; and targetNumber, targetUnit and progressNumber, for a goal that is
 * counted rather than judged. All are nullable, so nothing existing has to know
 * about them, and building those screens later is a screen rather than a schema
 * change underneath a live board.
 */
export const goals = pgTable(
  'goals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    personId: uuid('person_id')
      .notNull()
      .references(() => people.id),
    title: text('title').notNull(),
    /** Why it matters, in their own words. Nothing asks for it yet. */
    detail: text('detail'),
    /**
     * Which part of life this belongs to: the id of a scored area on that
     * person's own worksheet where there is one, so that a goal and the score it
     * came out of can be lined up later, or free text where there is not.
     */
    lifeArea: text('life_area'),
    horizon: goalHorizon('horizon').notNull().default('ninety_day'),
    /** The longer goal this one hangs off. Nothing sets it yet. */
    parentGoalId: uuid('parent_goal_id'),
    /** A counted goal: the number to reach, what it is counted in, where it is now. */
    targetNumber: numeric('target_number'),
    targetUnit: text('target_unit'),
    progressNumber: numeric('progress_number'),
    /** The habit behind the goal, worked weekly rather than monthly. */
    weeklyHabit: text('weekly_habit'),
    weeklyTargetCount: integer('weekly_target_count'),
    /**
     * Free text rather than a date column, because the worksheet asks for a due
     * date in the person's own words and an eleven year old writes "before
     * Christmas". Storing it as a date would mean refusing the answer they gave.
     */
    dueDate: text('due_date'),
    owner: text('owner'),
    /**
     * Whether this one goal is the owner's alone.
     *
     * Goals are shared with the house by default, because a goal is a
     * commitment somebody is willing to be held to and sharing it is the point.
     * Anything set here is the owner deciding this particular one is not, and
     * when it is set the goal appears on nobody else's screen at all, not even
     * as a number. Children have this on exactly the same terms as adults.
     *
     * Everything else a check-in produces stays private whatever this says: the
     * scores, the sentence behind each score, the note to self. Those are
     * somebody admitting where they are weak, which is a different thing from a
     * commitment, and sharing them turns honest answers into careful ones.
     */
    isPrivate: boolean('is_private').notNull().default(false),
    status: goalStatus('status').notNull().default('open'),
    /**
     * Their one line about how it went, written when they closed it. Private to
     * the owner: it is a written reflection, not the commitment itself.
     */
    closedNote: text('closed_note'),
    /**
     * The line they wrote about a goal that is STILL open, at the last check-in
     * that asked about it. Private, for the same reason.
     *
     * It has its own column because the first version wrote it into closedNote,
     * which had two consequences nobody would have noticed until it hurt: each
     * month overwrote the last, so an ongoing goal's history was one line deep,
     * and closing the goal later with the reflection left blank wrote null over
     * the lot. Somebody's notes on a goal they worked for three months vanished
     * at the moment they finished it.
     */
    progressNote: text('progress_note'),
    /** How it got here: a check-in, or added by hand on the goal board. */
    source: text('source').notNull().default('checkin'),
    sourceSubmissionId: uuid('source_submission_id'),
    createdCycleLabel: text('created_cycle_label').notNull(),
    closedCycleLabel: text('closed_cycle_label'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (table) => [index('goals_person_status_idx').on(table.personId, table.status)],
);

/** The steps under a goal. The first one is the check-in's "first action this week". */
export const goalSteps = pgTable(
  'goal_steps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    goalId: uuid('goal_id')
      .notNull()
      .references(() => goals.id),
    /**
     * Denormalised on purpose. Every read here is scoped by person, and holding
     * the person on the row makes that scoping a column rather than a join
     * somebody can forget to write.
     */
    personId: uuid('person_id')
      .notNull()
      .references(() => people.id),
    title: text('title').notNull(),
    dueDate: text('due_date'),
    done: boolean('done').notNull().default(false),
    doneAt: timestamp('done_at', { withTimezone: true }),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('goal_steps_goal_idx').on(table.goalId)],
);

/**
 * A short cheer from one person on somebody else's goal.
 *
 * Preset reactions and nothing else. There is no free text here on purpose:
 * a comment box between five people in one house is a place for an argument,
 * and the thing worth having is the nudge rather than the conversation.
 *
 * One row per person per goal, so a second tap changes the cheer rather than
 * stacking another one up. Nothing here lets anybody touch the goal itself.
 */
export const cheers = pgTable(
  'cheers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    goalId: uuid('goal_id')
      .notNull()
      .references(() => goals.id),
    /** Whose goal it is, so a read can be scoped without a join. */
    goalOwnerId: uuid('goal_owner_id')
      .notNull()
      .references(() => people.id),
    fromPersonId: uuid('from_person_id')
      .notNull()
      .references(() => people.id),
    reaction: text('reaction').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('cheers_goal_from_idx').on(table.goalId, table.fromPersonId)],
);

/**
 * One tick of a goal's weekly habit, on one day. Nothing writes this yet: the
 * weekly drumbeat is the next release. The table is here so that when it
 * arrives, a habit that has been named since this release has somewhere to land
 * without a schema change underneath a live board.
 */
export const habitLogs = pgTable(
  'habit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    goalId: uuid('goal_id')
      .notNull()
      .references(() => goals.id),
    personId: uuid('person_id')
      .notNull()
      .references(() => people.id),
    /** The day it was done, in the family's own timezone, as YYYY-MM-DD. */
    logDate: text('log_date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('habit_logs_goal_day_idx').on(table.goalId, table.logDate)],
);

/**
 * The private note written back to one person after they check in.
 *
 * THIS IS THE MOST PRIVATE TABLE IN THIS DATABASE, and it is worth saying why
 * rather than assuming the next person will work it out.
 *
 * A row here is written from one person's own answers: their scores, the
 * sentences behind them, their note to self. It reads nobody else's data, not
 * even the shared goals, and it never compares anybody to anybody. So a row
 * here is a derivative of the most private thing in the app, and it leaks the
 * original if it is ever shown to somebody else. There is exactly one route
 * that reads this table, it is under `owner()`, and nothing in routes/family.ts
 * touches it at all.
 *
 * The text is stored rather than regenerated on every open, for three reasons:
 * somebody rereading their note should see the same words rather than a new
 * take on an old month, it costs nothing to read, and a model that is down
 * cannot take away a note somebody already has.
 */
export const coachNotes = pgTable(
  'coach_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    personId: uuid('person_id')
      .notNull()
      .references(() => people.id),
    cycleLabel: text('cycle_label').notNull(),
    /** The submission it was written about, where there was one. */
    submissionId: uuid('submission_id'),
    body: text('body').notNull(),
    /**
     * The one small next step it offered, and the goal it belongs under.
     *
     * Kept separate from the body so that accepting it is a button rather than
     * somebody retyping a sentence out of a paragraph. Null where the note did
     * not suggest anything, which is a legitimate outcome: a month where
     * somebody is already doing the work does not need a new task.
     */
    suggestedStep: text('suggested_step'),
    suggestedGoalId: uuid('suggested_goal_id'),
    /** Set when they tapped it onto their board, so it is not offered twice. */
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    /** Set when they waved it away. Also stops it being offered again. */
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
    /** Which model wrote it, so a change in voice can be traced to a change here. */
    model: text('model').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('coach_notes_person_idx').on(table.personId, table.createdAt)],
);

/**
 * The one link the whole house shares. It opens the family board and nothing
 * else: names, whether each person has finished this month, and the date they
 * did it. It reads nobody's answers, so holding it is not a way in to anybody.
 */
export const houseAccess = pgTable('house_access', {
  id: uuid('id').primaryKey().defaultRandom(),
  label: text('label').notNull().unique(),
  accessToken: text('access_token').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * An adult's passphrase for the money area, and only for the money area.
 *
 * A four-digit code is right for a goal board. It is not right for a year of
 * bank transactions, and pretending otherwise would be the weakest link in the
 * whole app: ten thousand combinations guarding a household's spending history.
 *
 * So the money area sits behind a SECOND secret, longer, set by each adult
 * separately, hashed exactly the way the four-digit code is. Two things follow
 * from the shape of this table and both are deliberate:
 *
 *   - One row per adult, so Tyson and Danyell each have their own passphrase
 *     and neither has to know the other's.
 *   - Either correct passphrase opens the SAME shared household money view.
 *     They run a household together and mutual accountability is the entire
 *     point; a per-adult view of a joint account would be a fiction.
 *
 * The session it grants is separate from the ordinary sign-in and expires far
 * sooner. An ordinary session lasts a month because it guards a goal board. A
 * money session lasts minutes, because a phone left on a kitchen counter should
 * not still be showing the bank.
 */
export const moneyAccess = pgTable('money_access', {
  id: uuid('id').primaryKey().defaultRandom(),
  personId: uuid('person_id')
    .notNull()
    .unique()
    .references(() => people.id),
  /** scrypt, same format and same helpers as the four-digit code. */
  passphraseHash: text('passphrase_hash').notNull(),
  failedAttempts: integer('failed_attempts').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** A phone that has just answered the money passphrase. Short-lived on purpose. */
export const moneySessions = pgTable(
  'money_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    personId: uuid('person_id')
      .notNull()
      .references(() => people.id),
    tokenHash: text('token_hash').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('money_sessions_person_idx').on(table.personId)],
);

/**
 * What the household spends, by category, by month.
 *
 * Deliberately a SUMMARY table rather than a copy of the bank feed. The
 * spending view needs "how much went on groceries in September" and the count
 * behind it, so that is what is kept. Individual transactions are read from
 * SimpleFIN, totalled, and thrown away.
 *
 * That is a decision about how much of a family's financial life sits in a
 * hobby database on Railway, and it is the cautious way round: a copy of every
 * transaction would be the single most sensitive thing here and nothing on any
 * screen needs it. The cost is that a new way of slicing the data needs a
 * re-pull rather than a re-query, which is a cost worth paying once a month.
 */
export const spendingByCategory = pgTable(
  'spending_by_category',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** YYYY-MM, in the family's own timezone. */
    cycleLabel: text('cycle_label').notNull(),
    /** The category as SimpleFIN gave it, or as a household rule assigned it. */
    category: text('category').notNull(),
    /** Money out, as a positive number, in dollars. */
    spent: numeric('spent').notNull(),
    transactionCount: integer('transaction_count').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('spending_month_category_idx').on(table.cycleLabel, table.category)],
);

/** What the adults decided a category should cost per month. */
export const spendingCaps = pgTable('spending_caps', {
  id: uuid('id').primaryKey().defaultRandom(),
  category: text('category').notNull().unique(),
  monthlyCap: numeric('monthly_cap').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A household rule for categorising a transaction SimpleFIN did not categorise.
 *
 * Applied across the whole pulled window, so it DOES change the last three
 * months and not only the future. An earlier version of this comment claimed
 * the opposite; the comment was wrong about the code, and re-categorising is
 * the behaviour that was actually wanted. Somebody writing a rule while looking
 * at a pile of uncategorised spending means that pile. See categorise() in
 * lib/money.ts for the full reasoning and for what had to change alongside it.
 */
export const categoryRules = pgTable('category_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Matched case-insensitively against the transaction description. */
  matchText: text('match_text').notNull(),
  category: text('category').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** The quarterly cut the adults are aiming for. One live row at a time. */
export const savingsTargets = pgTable('savings_targets', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** e.g. "2026-Q3". */
  quarterLabel: text('quarter_label').notNull().unique(),
  /** How much less they mean to spend across the quarter, in dollars. */
  targetAmount: numeric('target_amount').notNull(),
  /** The quarter's spend they are cutting FROM, set when the target is made. */
  baselineAmount: numeric('baseline_amount'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * When the bank feed was last pulled, and how it went.
 *
 * One row, updated in place. It exists so a screen can say "as of Tuesday
 * morning" rather than showing a number with no age on it, and so a feed that
 * has been failing for a week says so plainly instead of quietly showing stale
 * figures as though they were current.
 */
export const bankSync = pgTable('bank_sync', {
  id: uuid('id').primaryKey().defaultRandom(),
  label: text('label').notNull().unique(),
  lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
  lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
  /** A short, already-scrubbed reason. Never the access URL. */
  lastError: text('last_error'),
  accountCount: integer('account_count'),
});

/**
 * The old parent links.
 *
 * These used to read every person's answers. They do not any more and nothing
 * in this codebase can: a row here is now only a second way of holding the
 * shared house link, kept so that a link already saved on somebody's phone
 * still opens the family board rather than breaking. Nothing writes this table
 * any more.
 */
export const dashboardAccess = pgTable('dashboard_access', {
  id: uuid('id').primaryKey().defaultRandom(),
  label: text('label').notNull().unique(),
  accessToken: text('access_token').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Person = typeof people.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Goal = typeof goals.$inferSelect;
export type Cheer = typeof cheers.$inferSelect;
export type GoalStep = typeof goalSteps.$inferSelect;
export type Draft = typeof drafts.$inferSelect;
export type Submission = typeof submissions.$inferSelect;
export type CoachNote = typeof coachNotes.$inferSelect;
export type SpendingRow = typeof spendingByCategory.$inferSelect;
export type SpendingCap = typeof spendingCaps.$inferSelect;
