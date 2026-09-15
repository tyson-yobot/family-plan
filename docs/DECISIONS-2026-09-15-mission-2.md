# Decisions, Mission 2, 2026-09-15

Every judgement call this session made under the autonomy rules, with the
reasoning. The tie-breakers the mission set, in order, were: the more private
option, the more reversible option, the option that keeps a child from feeling
watched or ranked, and the option an eleven year old understands.

---

## D1. Goal areas are a SEPARATE list from the check-in's scored areas

**The call.** Exercise, athletics and the rest were added as a new per-tier
`GOAL_AREAS` list, used only for filing a goal. The scored-area lists the
check-in runs on (`ADULT_AREAS`, `TEEN_AREAS`, `YOUNG_ADULT_AREAS`) were not
touched at all.

**Why, and this one nearly went the other way.** The obvious implementation is
to add the new areas to the existing per-tier area arrays. That would have
broken a hard constraint without looking like it. `validatePayload` in
`api/src/lib/validate.ts` loops over `template.areas` and REQUIRES a score and a
reason for every one of them. Adding an area to that array therefore adds a
scored question to the check-in, which the mission forbids twice: the six
sections and their questions must not change, and "do not add or reword any
check-in question to introduce them".

It would also have broken every half-finished check-in on the spot. Tyson has a
September draft in progress right now; a new required area would have made it
unsubmittable until he answered a question that did not exist when he started.

So the two lists are now different things on purpose: scored areas are what the
check-in asks about, goal areas are what a goal can be filed under. Goal areas
are a superset.

## D2. Only the two genuinely missing areas were added, not all three named

**The call.** `exercise` and `athletics` were added to the teen and young-adult
goal areas. Friendships and relationships was NOT added, because both tiers
already have it under a different name: teen has `friendships` ("Friendships")
and young adult has `relationships` ("Relationships").

The mission said to check what was already there before adding, and not to
duplicate an area that exists under a different name. Adding a second
friendships area would have given a teenager two near-identical choices in a
picker, which is the opposite of the eleven-year-old tie-breaker.

Adults were left alone for the same reason: `fitness_movement` covers exercise,
`friendships_community` covers relationships, and `money_security` already puts
money on a first-class footing, alongside a whole check-in section about it.
Athletics was added to the adult list too, since it was genuinely absent
everywhere and an adult can play sport.

## D3. The birthday rule and its column are gone

**The call.** Tyson's instruction, given directly: storing five dates of birth,
three of them a child's, to block a few hundred four-digit codes is not worth
the personal data. The rule is removed from `lib/codes.ts`, `refuseCode` no
longer takes a birthday, and the column is removed from the Drizzle schema so
nothing in this codebase can read or write it.

**What was NOT done, and why.** The physical column was not dropped from the
production table. Dropping or narrowing a column is on this mission's own
stop-and-ask list, and a session does not perform a destructive migration on a
live database because the same message also asked for the code removal. The
column is unreferenced and null for all five people, so it holds no personal
data while it waits. `scripts/pending/001-drop-people-birthday.sql` is the whole
of finishing it, and it checks the column is empty before dropping.

The lockout in `lib/auth.ts` and the shape rules in `refuseCode` carry the load
now, which is the right way round anyway: the lockout defends the live door,
where a rule about choosing a code only defends the choice.
