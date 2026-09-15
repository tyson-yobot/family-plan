# family-plan

A private planning tool for one family. Not a product, not for anyone else.

## What it is

One link for the whole house. It opens the family board: the month, how many
people have checked in, days left, the family streak, and the five names. Tap
your own name, put your own four-digit code in, and you are in your own space.

Your space is three things: your goal board, your own history, and your monthly
check-in. You live on the goal board between check-ins; the check-in is what
puts things there and what closes them off.

- `api/` Fastify and Drizzle against Railway PostgreSQL. Deploys to Railway.
- `web/` Next.js App Router. Deploys to Vercel. Installable to a phone home
  screen as a Progressive Web App.

There are three worksheets, not one. Tyson and Danyell get the adult worksheet,
six sections. Aidan and Mariah get the teen worksheet, four sections. Dylan gets
the young-adult worksheet, four sections, written for a nineteen year old living
at home rather than a bigger version of the teen one.

## What the five of them can see of each other

This is the rule the rest of the design serves, so it is worth stating plainly
and in full.

**A goal is shared.** Every person's goals are visible to the whole house: the
goal itself, which part of life it belongs to, when it is due, how many of its
steps are done, and whether it was hit, missed or dropped. A goal is a
commitment somebody is willing to be held to, and being able to see it is what
lets the house push each other.

**What somebody wrote is theirs.** Every 1-to-10 score, the sentence behind each
score, the note to themselves, the line about how a goal went. Nobody else sees
any of it, ever, in any view. That is somebody admitting where they are weak,
and sharing it does not make anybody better: it turns honest answers into
careful ones, which destroys the only thing a check-in is for.

**Any single goal can be kept back.** Anybody, adult or child, on exactly the
same terms, can mark any goal theirs alone when they write it or at any time
afterwards. A private goal is on nobody else's screen at all, not as a title,
not as a status, and not as a number. When every one of somebody's goals is
private their name simply does not appear in the shared list, because "and two
others" is still a row about somebody's private goals.

**Nobody is ranked.** There is no leaderboard, no percentage per person, no
total, and no ordering of people by how much they have done. The people come out
in the order they were added and stay in it. What you can see is what somebody is
working on and how it is going, never who is ahead. The family streak is the one
shared number and it only moves when all five finish a month.

**You can cheer, and that is all you can do.** A short preset reaction on
somebody else's goal, from a closed set, with no free typing anywhere near it. A
comment box between five people in one house is a place for an argument. Nobody
can edit, comment on, reassign or close anybody else's goal.

### Where the line was drawn on the ambiguous things

The standing rule is that anything genuinely ambiguous is private. These were
the calls, and they are here so the next person deciding one has the reasoning:

- **Step titles are private; the count of steps done is shared.** "Progress" is
  what the house sees, and a count is progress. A step can say considerably more
  than the commitment does.
- **The line written about how a goal went is private**, whether the goal was
  closed or is still running. It is written in the check-in and it is usually
  somebody explaining a miss, which is a reflection rather than a commitment.
- **A goal's numbers are private.** `target_number` and `progress_number` are
  where Mission 2's money screens will live, so a money goal is shareable as a
  goal without its figures being visible.
- **Seeing the shared goals needs a code**, even though a goal is shared.
  "Shared with all five" is not the same as "readable by whoever is holding the
  link", and a link can be forwarded.
- **A new goal is shared by default.** Sharing is the point of it, and the
  screen that creates one says so and offers the alternative in the same breath.

### How it is enforced

At the API, not by a screen choosing not to show something.

- **Holding the shared house link proves you are in this house.** It opens the
  family board, which is a name, a status and a date per person.
- **Holding a person's own link proves nothing.** It is a bookmark.
- **Being signed in as any of the five** gets you everybody's shared goals, built
  as a short allow-list of fields rather than a row with things stripped out. A
  column added to the goals table later is private until somebody puts it on
  that list on purpose, because the failure of a deny-list is a leak and the
  failure of an allow-list is a missing field somebody notices at once.
- **Being signed in as a particular person** is the only way to reach that
  person's answers, scores, written reflections and private goals. A valid
  session for somebody else is refused.

There used to be a parent view that laid out every person's answers. It is gone:
the routes, the component and the seed script that made its links.

## Codes

A four-digit code each, chosen by that person the first time they open their own
name.

- Stored with scrypt and a per-person salt. Nothing can read one back out,
  including whoever holds the database.
- Obvious ones are refused when they are set: four of the same, four in a row up
  or down, a repeated pair, the handful that top every most-used list, and the
  person's birthday if one is on their row. Nobody's birthday is stored today,
  so that last rule currently refuses nothing; filling the column in is the whole
  of turning it on.
- Wrong codes are slowed, with the delay growing, and lock the door for a while
  after five in a row. The delay is applied to a correct answer too, so how fast
  a refusal comes back does not tell anybody which guess was close.
- A session lasts thirty days. "Not you? Sign out" inside a space ends it, which
  matters on a phone two people use.

**Forgotten codes.** Tyson clears anybody else's from inside his own space: it
lets that person pick a new one, it never reveals the old one, and it gives him
no access to anything of theirs. His own is the exception, because there is
nobody above him to ask, so:

    cd api
    npx tsx src/scripts/reset-code.ts tyson

## Links

    https://<site>/h/<token>          the family board, shared by all five
    https://<site>/h/<token>/<name>   that person's own space, behind their code

Every link ever issued still works. A person's old `/f/<token>` link lands on
their own sign-in screen, and an old parent `/d/<token>` link opens the family
board. Both are bookmarks now rather than ways in.

## The month

There is no scheduler, so the cycle is computed rather than chosen: the current
calendar month, `YYYY-MM`, worked out on the server in the family's own
timezone. The page never invents one.

If someone has a half-finished worksheet from an earlier month, it is never
silently resumed and never silently thrown away. They are asked which they want.

## Goals

A goal written in a check-in becomes a row on that person's own board, with its
first step under it. The owner can tick a step, add a step, add a goal, change a
goal's wording or date at any time, and close it as hit, missed, or deliberately
dropped. Nobody else can touch it.

**A goal stays open until its owner closes it.** One set in September is still
live in November. The next check-in opens by asking about everything still open:
still working on it, hit it, missed it, or changed my mind, with room for a line
in their own words. The first of those keeps it; the other three close it.

The goal table carries columns nothing writes yet, on purpose, so the next
release is screens rather than a schema change under a live board:
`parent_goal_id` for hanging a ninety-day goal off a one, three or ten year one;
`weekly_habit` and `weekly_target_count` for the weekly drumbeat;
`target_number`, `target_unit` and `progress_number` for a goal that is counted;
and `life_area` for which part of life it belongs to. There is a `habit_logs`
table waiting for the weekly ticks.

## Running it

Both halves need environment variables. Nothing has a working default, on
purpose: a missing one fails loudly at startup rather than quietly running
wrong.

`api/.env`

    DATABASE_URL   the Railway PostgreSQL connection string
    WEB_ORIGIN     exact site origins allowed to call the API, comma separated.
                   Never "*": these URLs carry private tokens.
    PORT           defaults to 8080

`web/.env.local`

    NEXT_PUBLIC_API_BASE_URL   the address of the API

Commands:

    cd api
    npm install
    npx drizzle-kit push          # schema changes go through drizzle-kit, not by hand
    npm run build                 # tsc, then writes dist/build-info.json
    npm start

    cd web
    npm install
    npm run build

## Issuing the links

    cd api
    WEB_BASE_URL=https://<site> npx tsx src/scripts/seed.ts

Safe to run again. Anybody already in the table keeps the token they have, so
links already handed out keep working, and the house link is only created once.
It prints the house link and writes its QR code to `qr-codes/`, which is not in
the repository.

Run it locally and never in a build step. It prints full tokens, and a build log
is not a place for them.

## Before and after a change that touches data

    cd api
    npx tsx src/scripts/snapshot.ts        # a fingerprint of everybody's records
    npx tsx src/scripts/backup.ts <path>   # every answer, to a file outside the repo

`snapshot.ts` hashes the exact bytes of every answer per person, so "nobody's
records were touched" is something to check rather than hope. Run it before and
after and compare the two.

`backfill-goals.ts` moves goals written before the goal board existed onto it.
It is safe to run more than once and says what it would do before `--write`.

## Checking a deploy actually landed

`GET /api/version` returns the commit that is running and when it was built. Use
that, not a health check: a health check returns 200 perfectly happily while the
old code is still serving.

## Keeping tokens and codes out of the logs

Fastify logs every request path, which on Railway would put private links into
the log stream. `redactPath` in `api/src/server.ts` hides **anything shaped like
a token, wherever it appears in a path**, rather than naming the routes it knows
about. That is deliberate: the first version named routes, and the first thing
through it was a route this release deleted, because nobody thinks to redact an
address that no longer exists.

Codes and session tokens never appear in a path at all. A code is always a JSON
body and a session is always an Authorization header, and the logger is
configured to serialise neither, which is why the request serialiser returns two
fields rather than letting Fastify's default one through.

None of this reaches Vercel's own access log, which records the page path in
full. Nothing in this repository can change that.

## Three checks that gate the build

`check:worksheet-ids` compares the field ids the API validates against with the
ids the worksheet renders. They live in two files because the two build contexts
do not contain each other, and a drift produces a worksheet that can be filled
in and then refuses to submit.

`check:chunks` proves that breaking a section into several screens did not lose
a question: every field is still asked, once, in the order it was written.

`check:contrast` reads the colours out of `web/lib/theme.ts` and
`web/app/globals.css` and measures every pair the app actually renders against
WCAG 2.1. It was rewritten from scratch for the dark palette; none of the old
measurements against the cream page carried over, and the shape of the check
changed with them, because an accent is no longer a dark colour under white text
but a bright one under the page's own near-black.

All three run as `web`'s `prebuild`, so the Vercel build fails rather than
shipping a broken worksheet. Run them by hand as well while you are working; the
gate is there for the deploy, not as a substitute for looking.

## Deliberately not built yet

The Week screen, money, the horizons chain and the private coach are Mission 2.
There is no email, no reminders, no chore integration and no scheduling engine.
