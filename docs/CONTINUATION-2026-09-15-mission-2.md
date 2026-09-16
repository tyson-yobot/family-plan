# Continuation, 2026-09-15, Mission 2

The depth pass: horizons, the weekly drumbeat, goal areas, the private coach and
the money area. Read this and `DECISIONS-2026-09-15-mission-2.md` before
touching any of them.

Mission 1's brief, `CONTINUATION-2026-09-15-mission-1.md`, still holds for the
access model, the shared allow-list and the dark palette. The parts this
supersedes are named below.

## The one thing to know first

**Mission 1 had never been deployed.** It was built, walked and committed, and
the push had been refused twice by the permission layer, so production was
running the commit from before it. The push went through this session on the
first attempt with no change to how it was run, and both Railway and Vercel
auto-deployed off it. The `vercel promote` step the Mission 1 brief describes
was therefore unnecessary: the Vercel project builds production from the `dev`
branch itself.

## What is live

Production is `abc80ad`, verified at `/api/version` rather than from a
dashboard. The site is `family-plan-iota.vercel.app`.

Five changes plus Tyson's birthday ruling:

1. **Four horizons.** The three "Where I am going" answers become real ten,
   three and one year goals. A ninety-day goal can hang off a longer one, and
   the longer one shows progress counted from its children.
2. **The weekly drumbeat.** A habit on a goal, a seven-day row, a run of weeks,
   and a nudge that waits a fortnight.
3. **Goal areas**, separate from the scored areas. Exercise and athletics added
   for teens and young adults, athletics for adults.
4. **The private coach.** A few sentences written for one person after a
   check-in, reading only their own data.
5. **The money area.** Adults only, behind a second longer passphrase, read-only,
   fed by SimpleFIN on a schedule.

## The wrong assumptions a fresh session would make

**Goal areas are NOT the scored areas, and conflating them breaks the check-in.**
`validatePayload` requires a score and a reason for every entry in a tier's
`areas` array, so adding an area there adds a QUESTION to the check-in, which
Mission 2 forbids, and makes every half-finished draft unsubmittable until the
new question is answered. `goalAreasFor()` in `api/src/lib/templates.ts` is the
list a goal can be filed under; `TEMPLATES[x].areas` is the list the check-in
scores. `scripts/check-worksheet-ids.mjs` now checks both pairs for drift, and
it has been seen to fail on purpose.

**Vision goals are created PRIVATE, and every other goal is not.** This is the
one place the mission's "horizon goals are shared by default" was deliberately
not followed, and the reasoning is in DECISIONS D1 and in the doc comment on
`applyVision`. They are the first sentence of a paragraph somebody wrote under a
promise that what they write is theirs alone. If you ever flip that default,
you are publishing somebody's ten-year answer to the family board.

**The money passphrase travels in `x-money-session`, not `Authorization`, and
that header must stay in the CORS allow-list.** The separation is the point: if
the money gate read the same header as the ordinary session, a month-long
session would open the bank. The cost is that a custom header is not on the
browser's CORS safe list, so `allowedHeaders` in `api/src/server.ts` has to name
it. It did not at first, and every money request failed as an opaque "Failed to
fetch" while the entire API test suite passed, because requests made from Node
have no CORS at all.

**`syncBank` REPLACES whole months. Do not make it update-or-insert again.**
Writing a row if it exists and inserting otherwise leaves behind any row that
stopped receiving transactions, so the first category rule anybody writes counts
that money twice and the month reads roughly double. The window also snaps back
to the first of the oldest month, because a plain ninety days rewrites that
month from a partial pull and its total shrinks a little every day.

**Category rules DO apply to history, and that is intended.** Two comments used
to claim the opposite. Somebody who writes "KROGER is Groceries" while looking
at a pile of uncategorised spending means that pile.

**The coach must never become blocking.** It is started with `void` after the
submit transaction has committed and every failure path inside it returns null
rather than throwing. `max_tokens` is 16,000 rather than something tight because
thinking is on by default on this model and comes out of the same ceiling; at
2,000 a long month would truncate the JSON, fail in the parse, be swallowed, and
leave somebody on "Writing you something" for ever.

**Only summaries of spending are stored.** Transactions are pulled, totalled and
discarded. There is no transaction table and there should not be one.

## Things that cost time, so they do not cost it again

**`python -c "..."` in bash silently eats `${...}`.** Two template literals in
`GoalBoard.tsx` were written as `width: ,` because bash expanded `${Math.round(
...)}` inside the double-quoted argument before python ever saw it. Write the
script to a file and run the file, or use the Edit tool.

**A quoted heredoc still fails on some content.** `cat > f <<'EOF'` broke twice
on files containing backticks and braces. The Write tool is the reliable route
for anything with template literals in it.

**`npx tsc --noEmit | head` reports head's exit code, not tsc's.** A typecheck
that had three real errors printed `EXIT: 0`. Redirect to a file, read `$?`, then
look at the file.

**The Chrome extension still cannot resize the viewport,** exactly as the
previous two briefs say. `documentElement.clientWidth` ignores a `width` rule
because it IS the viewport. Constrain `main` with a max-width instead and read
geometry off the real elements; that is how the seven day boxes were measured at
44px.

**`javascript_tool` runs in a fresh isolated world every call.** Define helpers
inline each time. React-controlled inputs need the native value setter plus a
dispatched `input` event or React never sees the change.

## What was verified, and how

All against real production on `abc80ad`, not a preview.

- **Unauthorised access, 16 checks:** a child reaching the money area (404, with
  no hint it exists), an adult with only the four-digit code (401), an ordinary
  session replayed as a money session (401), reading another person's coach note,
  weekly detail and space (401 each), a parent reading a child's note (401), and
  one person's session against another's space (401).
- **Two adults on one device:** adult B replaying adult A's live money token is
  refused, and A is unaffected.
- **The shared allow-list against real goals**, with private values planted in
  every private column. The first run of this check reported "0 shared goals"
  and proved nothing, because the database was empty; it was rewritten to create
  goals first.
- **The lockout actually reached.** The first attempt used an invalid link token
  and was refused at the link, so the lockout never ran. Redone with the real
  house link against a probe person who had a code: locked after six wrong
  tries, and the CORRECT code refused while locked.
- **The coach failing:** a real check-in submitted with no API key configured.
  The answers filed, the goal reached the board, the screen was told not to
  expect a note, and no placeholder row was written.
- **The bank down:** the money view loads, says plainly it is not connected,
  invents no figures, and the goal board, family board and week still answer 200.
- **Vision privacy end to end:** a real adult check-in with a marker string in
  the ten-year answer, then the family board read as somebody else. The marker
  appears nowhere and only the three typed goals are visible.
- **Contrast:** 118 pairs, 0 failing, including three new money-bar pairs.
- **Touch targets:** the seven day boxes measured at 44.0-44.1 by 44 at 390px.
- **Record fingerprints:** byte-identical to the baseline taken before any work,
  including Tyson's half-finished September draft.

## Left open, deliberately or otherwise

**THE PREVIEW TEARDOWN IS BLOCKED AND STILL STANDING.** Deleting the Railway
service `api-preview`, id `5f1744c3-a7a7-4bd7-9d53-59204a09d9c8` in project
`c5eebf06-daa6-4963-86a3-b6aa8d1835bd`, was refused by the permission layer:
"Permission for this action was denied by the Claude Code auto mode classifier.
Reason: [Unverifiable Deletion Scope]." That was not worked around. The
`family_plan_preview` database was left in place too, because dropping it while
the service still points at it would leave a broken service rather than a clean
one. Both still need removing, and the alias
`family-plan-git-dev-tyson-yobots-projects.vercel.app` still points at an old
preview build.

**Neither secret is configured in production**, so two features are honest-
degrading rather than working:
- `SIMPLEFIN_ACCESS_URL` is unset, so the money screens say the bank is not
  connected and show no figures.
- `ANTHROPIC_API_KEY` is unset, so no coach note is ever written and the screen
  says nothing rather than pretending.
Both are Tyson's to add as Railway variables on the `api` service. **Read
MISSION STANDING RULES 3 before assuming an edit takes effect: a variable edit
restarts the service that OWNS it, and these are owned by `api` itself, so that
one is fine, but verify by reading the behaviour back rather than the dashboard.**

**Nobody has set a four-digit code yet**, all five are null. That is why the
browser walk used a throwaway household: signing in as a real person would have
consumed the one-time "pick your code" screen each of them is meant to get.

**`people.birthday` still exists as a physical column.** It is unreferenced,
null for everybody, and gone from the Drizzle schema, so nothing can read or
write it. `scripts/pending/001-drop-people-birthday.sql` is the whole of
removing it and it checks the column is empty first. Dropping a column is on the
stop list, so it was not run.

**The api deploy is still ungated.** `check:worksheet-ids`, `check:chunks` and
`check:contrast` run as web's prebuild only, so a change made in `api/` alone
still reaches production unchecked. Unchanged from Mission 1 and still the most
obvious next guard.

**Nothing checks that `LOOP_ANSWERS` agrees between the api and web copies.**
Also unchanged from Mission 1. The goal-area drift check added this session is
the pattern to copy.

**The family board copy says "the five of us" as a fixed string.** Correct today
and wrong the moment a sixth person exists, which was visible during the walk
when two throwaway people were present.
