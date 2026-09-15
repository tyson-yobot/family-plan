# Continuation, 2026-09-15, Mission 1

The privacy, access, goal-board and dark-rebrand pass. Read this before touching
the access control or the goal board.

There is a second brief from earlier the same day,
`docs/CONTINUATION-2026-09-15.md`, covering the pacing pass. Most of it still
holds; the parts this supersedes are named below.

## What this session did

Five changes, two of which reversed earlier decisions.

1. **Goals are shared with the house; everything written is private.** The
   parent view is gone. This one reversed twice in a day: the mission opened by
   making goals private too, and Tyson changed it mid-build, in his words
   "Yes, I think we should see goals, so we can push each other." Nothing had
   shipped, so the reversal cost a rebuild rather than a migration.
2. **One shared house link, then a four-digit code per person.**
3. **A goal board**, so a check-in leads somewhere instead of being filed.
4. **Dark**, replacing the calm cream direction of the previous pass.
5. Words on the ends of the score scale, and the family streak and days left.

## The wrong assumptions a fresh session would make

**There are three levels of access, not two, and the middle one is easy to
miss.** A link opens the family board. ANY signed-in person can read EVERYBODY's
shared goals, through `api/src/routes/family.ts`. Only the person themselves can
read their own scores, reflections and private goals. A route added to
`family.ts` is readable by all five; a route added to `space.ts` is not. Putting
one in the wrong file is the way this breaks.

**The shared goal shape is an allow-list and has to stay one.** `SharedGoal` in
`api/src/routes/family.ts` names every field that leaves. A column added to the
`goals` table is private by default because it is simply not on that list. If
anybody ever rewrites it as "the row, minus these fields", the next column
somebody adds is a leak nobody notices.

**A link proves nothing any more.** Every private route takes a session in an
Authorization header and refuses unless that session's person is the person the
route is about. Both halves matter: checking only the session would let one
child's phone read another's board through her link, and checking only the link
is where this started. `requireOwner` in `api/src/lib/auth.ts` is the only place
that decision is made, and every private route goes through `owner()` in
`api/src/routes/space.ts` to reach it. If you add a route and reach for the
person by slug without going through `owner()`, you have made the hole this
release closed.

**Private routes are keyed by slug, not by token, and that is on purpose.** The
family board would otherwise have to hand out all five people's link tokens so
it could link to them. It hands out names instead, and the code is the gate.

**The log redaction works by shape, not by route, and the first version did
not.** `redactPath` in `api/src/server.ts` hides anything matching
`[A-Za-z0-9_-]{20,}` in any path segment. The first version listed the routes it
knew about; the first thing through it was `/api/form/<token>`, a route this
release deleted, because nobody thinks to redact an address that no longer
exists. Every old bookmark in the house points at one of those. Found by making
the request and reading the Railway log line back, not by reading the code.
There is also a `setNotFoundHandler`, because Fastify's own 404 writes the full
address into the reply and the log and neither goes through the serialiser.

**`_ui.place` from the pacing pass still governs where a resumed draft lands**,
and that is unchanged. What is new is that `goal_status` inside the draft is
**reconciled against the board on every open**, not seeded once. A goal can be
added or closed from the goal board, in another tab or on another phone, while a
check-in is half-finished. A draft holding an older list would then ask about a
goal that is no longer open, or never ask about one that is, and the server
refuses both. The reconciliation matches by `goal_id` and keeps answers already
given. If you ever simplify that back to "seed it if it is missing", a
half-finished check-in becomes unsubmittable the moment its owner touches their
board.

**The check-in's four answers are not the old three.** Done / Partly / Not yet
became Still working on it / Hit it / Missed it / Changed my mind, because those
three could only describe a goal that had just ended and a goal now lives across
months. The list lives in `api/src/lib/templates.ts` (`LOOP_ANSWERS`) and is
copied in `web/components/WorksheetFlow.tsx`. Nothing checks that those two
agree; a drift means the screen offers an answer the server refuses.

**A goal closes inside the submit transaction.** `applyCheckIn` in
`api/src/lib/goals.ts` runs in the same transaction as the submission insert. A
check-in that filed the answers and then failed to update the board would leave
somebody saying they hit a goal next to a board that still shows it open, with
no way of telling which was right.

**History is one entry per month, not one per submission.** Redoing a month is
allowed and files a second row on purpose, so the first answers are kept. The
history endpoint keeps the most recent per month. Found by redoing a month on the
preview and seeing September twice in the chart.

**Every colour was re-measured and the shape of the check changed.** An accent is
no longer a dark colour under white text; it is a bright colour under the page's
own near-black, `ON_ACCENT` in `web/lib/theme.ts`. `tintOf` mixes towards the
raised card colour rather than towards white, and `TINT_BASE` there must equal
`--surface-2` in `globals.css` or the contrast check measures colours the app
does not draw. The check enforces that equality rather than trusting it.

**Do not reach for `color-mix`.** Same reason as the previous pass: the tint has
to be a value the contrast check can read.

## Things that cost time, so they do not cost it again

**A preview walk needs its own database AND its own API.** The new API breaks the
old web, so deploying it to production before the walk would have taken the
family's site down for the duration. The recipe, all of which was torn down
afterwards:

1. `create database family_plan_preview` on the same Postgres, so the real rows
   are untouchable rather than merely untouched.
2. A Railway service `api-preview` whose `DATABASE_URL` is a Postgres connection
   string assembled out of Railway reference variables rather than typed: the
   user, the password and the private domain each as a `${{Postgres.PG...}}`
   reference, port 5432, database `family_plan_preview`. Built that way so no
   credential is ever read into a session or written down.

   Do not paste the assembled string into a file here even as an example. It
   holds no secret, only the names of references, but it is shaped like a
   connection string and the repo's commit guard stops it, correctly: a rule
   that recognises the shape is worth more than the one line it costs.
3. **Set its root directory to `/api` before the first `railway up`.** Without
   it, the CLI uploads from the git root, railpack finds no start script, and the
   build fails with "Railpack failed to prepare the build", which says nothing
   about the real cause. Two failed deploys went that way.
4. `npx vercel deploy --build-env NEXT_PUBLIC_API_BASE_URL=<preview api>`, then
   alias it to `family-plan-git-dev-tyson-yobots-projects.vercel.app`, which is
   already in `WEB_ORIGIN`. Open it through a Vercel share link.

**`railway up` uploads from the git root, not from the directory you are in.**
It honours the service's root directory setting instead. That is the whole of the
failure above.

**Chrome still could not be resized.** `resize_window` reported success while
`innerWidth` stayed at 1528, exactly as the previous brief says. Phone width was
measured by injecting `html{width:390px}` and reading geometry back.

**`javascript_tool` runs in a fresh isolated world each call.** A helper stashed
on `window` in one call and used in the next throws "Illegal invocation", because
its captured `HTMLInputElement.prototype` belongs to the previous world while the
element belongs to this one. Define helpers inline in every call.

**`querySelectorAll('input[type=text]')` misses these inputs.** They have no
`type` attribute, and the attribute selector matches the attribute rather than
the IDL default. Use `input:not([type=password])`.

## Left open, deliberately

**Nobody's birthday is stored**, so the rule that refuses a birthday as a code
refuses nothing today. The column and the check are both there; filling
`people.birthday` in as `YYYY-MM-DD` is the whole of turning it on. It is a
question for Tyson rather than something a session can invent.

**The session lives in `localStorage`, not an httpOnly cookie.** The site and
the API are on different origins and the allowed set includes previews that come
and go, so a cookie would have meant loosening SameSite on everything. The cost
is that a script on this origin could read it; the app loads no third-party
script at all. Written up where it is implemented, in `web/lib/api.ts`.

**`start_url` in the manifest is still `/`.** A home-screen icon therefore opens
the landing page rather than the board, so the landing page remembers the last
link this phone came in on and offers it. On iOS a home-screen app does not
always share storage with the browser it was added from, so that can come back
empty; the landing page reads correctly with nothing there. The real fix is a
per-household start_url, which a static manifest cannot carry.

**The `try_differently` rule is duplicated too**, and now reads "any open goal
unfinished" on both sides rather than "the first answer". Teens can add their own
goals, so the old rule asked or skipped the question on the strength of whichever
goal happened to be at the top of the board.

**Nothing checks that `LOOP_ANSWERS` matches between the api and web copies.**
`check:worksheet-ids` does this for field ids and the same idea would work here.
It is the obvious next guard.

**The api deploy is still ungated.** `check:worksheet-ids`, `check:chunks` and
`check:contrast` all run as web's prebuild only. A change made in `api/` alone
still reaches production unchecked.
