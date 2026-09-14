import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

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

export type Person = typeof people.$inferSelect;
export type Draft = typeof drafts.$inferSelect;
export type Submission = typeof submissions.$inferSelect;
