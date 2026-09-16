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

## D4. `horizon` was added to the shared allow-list; `parent_goal_id` was not

**The call.** A goal's timeframe is now shared with the household. The goal it
hangs off is not.

**Why.** The timeframe is the same class of fact as the due date, which Mission 1
already shared: it is when somebody means to have done this by. Without it a ten
year goal sits on the family board looking like a ninety day goal nobody has
finished, which is the opposite of what it means.

The parent id is different. A ninety day goal can hang off a parent its owner
has marked private. Handing out that id would confirm a private goal exists and
let anybody match several shared goals to the same hidden one, which is a way of
inferring its shape without ever seeing it. The laddering view lives in the
owner's own space, where the parent is theirs to see. This is the privacy
tie-breaker applied directly.

## D5. The coach runs on Claude Opus 5

**The model.** `claude-opus-5`, 1M context, $5 per million input tokens and $25
per million output. Checked against the current line-up on 2026-09-15 rather
than reused from anything earlier.

**The cost, at the volume actually described.** Five people checking in monthly
plus occasional re-reads is roughly 20 requests a month. About 2,000 input
tokens each (the instruction plus one person's answers) and about 300 output.
That is 0.04M input and 0.006M output: **about 35 cents a month.**

**Why not a cheaper model.** At that volume the saving is a few pence and the
thing at stake is the tone of a message on an eleven year old's screen. Rule 14
of the standing expectations is explicit that cheaper is not the same as better,
and a child reading something that lands wrong is exactly the customer-facing
case where the shortcut is never correct.

**Effort is `medium`, not the default `high`.** Writing four warm sentences is
not a reasoning problem. What is hard is picking the one thing worth saying out
of a month of answers, which `medium` keeps.

**Retention and training, confirmed from Anthropic's own published pages rather
than from memory.** Anthropic does not train on commercial API inputs or
outputs by default: "By default, we will not use your inputs or outputs from our
commercial products (e.g. Claude for Work, Anthropic API, Claude Gov, etc.) to
train our models." Inputs and outputs are deleted from the backend within 30
days. Sources: `privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training`
and `privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data`.

## D6. Only spending SUMMARIES are kept, never transactions

**The call.** SimpleFIN is read for a ninety day window, money out is totalled
per category per month into `spending_by_category`, and the individual
transactions are discarded. Nothing keeps a transaction row, a description, an
amount, an account number or a balance.

**Why.** A copy of a household's transaction history would be the single most
sensitive thing in this database, and no screen in the product needs it: the
spending view needs "how much went on groceries in September" and the count
behind it, which is what is stored. Ninety days rather than a year because the
quarter is the longest window any screen shows.

**What it costs.** A new way of slicing the data needs a fresh pull rather than
a re-query. That is a cost worth paying once a month.

## D7. The money gate is a different secret, a different header, and a different store

Three separate decisions, all pulling the same way.

**Its own passphrase**, at least twelve characters and not all digits. Four
digits is ten thousand combinations, which is the right size of secret for a
goal board and the wrong one for a year of bank transactions.

**Its own header**, `x-money-session`, not `Authorization`. If the money gate
read the same header an ordinary session uses, a month-long session would open
the bank, which is the whole thing this gate exists to prevent. This is the
decision that produced the CORS defect described in the continuation brief: a
custom header is not on the browser's safe list. The fix was to name the header
on the server, not to give up the separation.

**Its own store**, `sessionStorage` rather than `localStorage`, and fifteen
minutes rather than thirty days. An ordinary session is meant to survive a phone
being put down for a fortnight. A money session is meant not to, and closing the
tab should end it.

## D8. One vision goal per horizon, edited rather than duplicated

**The call.** The three "Where I am going" answers become one open goal each per
person. Rewriting the answer next month edits that goal; it does not make a
second one.

**Why.** A person has one ten-year vision, not a new one every month, and the
adult worksheet asks the same three questions every time. A row per check-in
would put twelve near-identical ten-year goals on the board within a year. That
is the same bug the ninety-day de-duplication already exists to stop, one
horizon up, and it would not have been visible until real answers were in it.

A vision goal somebody has deliberately CLOSED is left closed and a new one is
written, because closing it was a decision and reopening it silently would
overrule them.

**The long answer is split.** The first sentence becomes the title and the whole
text is kept in `detail`, because a paragraph as a board item is unreadable and
truncating without keeping the original would lose what they wrote.

## D9. The browser walk used a throwaway household, not the five real people

**The call.** A temporary house link and two temporary people were created for
the walk and deleted afterwards. The five real records were never signed into.

**Why, and this was not the original plan.** None of the five has set a
four-digit code yet. The set-code route only works once, by design, so signing
in as them would have consumed the first-visit "pick your code" screen each of
them is meant to get, and there is no way to give it back without clearing their
code. Walking with the real house link would also have put a live access token
into a session transcript.

**What this costs, stated plainly.** The walk proves the screens work for an
adult tier and a teen tier on real production. It does not prove anything about
the five real people's own data, because they have none yet. The record
fingerprint covers that instead, and it is unchanged.

## D10. No percentage anywhere in the weekly layer, and the nudge waits a fortnight

**The call.** The Week screen shows a count ("1 of 3 this week") and a run of
weeks. There is no percentage, no score, and no comparison to anybody. A goal
nobody has touched says nothing at all for fourteen days, then says one warm
line in the ordinary soft ink, with no icon, no border and no colour.

**Why.** Three of the five people are children. Any number that can be read as a
mark will be read as one, and a red flag on a child's screen for not running
this week teaches them to avoid the app, which costs far more than the habit is
worth. This is the third tie-breaker the mission set, applied literally.
