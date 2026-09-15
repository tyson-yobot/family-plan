# family-plan, current state

Last updated 2026-09-15.

## Where it is

One link for the house, a code each, and a goal board behind it. Built,
deployed and walked end to end against the running system.

## Live addresses

- Site: https://family-plan-iota.vercel.app
- API: https://api-production-c4122.up.railway.app
- Check what is actually running: https://api-production-c4122.up.railway.app/api/version

The one link for the house is not written down here on purpose. It is in
`qr-codes/links.txt`, which is not in the repository, along with a QR code at
`qr-codes/family-plan.png`. Re-print them with the seed script in the README.

## Its own projects, shared with nothing else

- Railway project `family-plan`, id `c5eebf06-daa6-4963-86a3-b6aa8d1835bd`
- Vercel project `family-plan`, id `prj_eSdBYuUbwNsyPoDKRkbpVVxKxfh1`
- GitHub `tyson-yobot/family-plan`, private, branch `dev`

Inside the Railway project: a Postgres service and an `api` service with root
directory `/api`. The Vercel project builds from root directory `web`.

## What is done

**Phase 1a**, three worksheets (adult, teen, young adult), server-side
validation of all three shapes, answers that save as they are written, the
stale-draft choice, the review screen and the confirmation echoes.

**Phase 3**, the pacing pass: a check-in is asked over small screens rather than
a few long ones, with everybody's own colour running through their own.

**Mission 1**, this pass. Four things changed shape rather than looks.

*Goals are shared, everything written is not.* The parent view is gone: the
routes, the component and the seed script that made the links. Everybody's goals
are visible to the whole house, which is the point of a goal, and anybody can
mark any single one theirs alone. Every score, every sentence behind a score and
every note stays with the person who wrote it, and is refused at the API unless
the request carries a session created by that person entering their own code.
The full statement of where the line is, including the ambiguous cases and how
they were decided, is at the top of the README. A parent link that used to lay
out everybody's answers now opens the family board like everybody else's.

*One link, then a code each.* `/h/<token>` is the family board: the month, the
streak, days left, and five names with a status and a date. Tapping a name asks
for a four-digit code. Codes are scrypt-hashed, obvious ones are refused when
they are set, wrong ones are slowed and then locked out, and a session lasts
thirty days or until somebody signs out. Tyson can clear anybody else's code
from inside his own space; `api/src/scripts/reset-code.ts` clears his own,
because otherwise his is the one code with no way back.

*A goal board.* A goal written in a check-in becomes a row its owner can tick,
edit, add steps to, close as hit, missed or dropped, and keep to themselves.
Anybody can send a short preset cheer on somebody else's goal, and nothing else:
no editing, no closing, no comment box anywhere. It stays open across
months until they close it, and the next check-in opens by asking about whatever
is still open rather than about whatever was written down last month.

*Dark.* Charcoal and graphite, silver structure, each person's colour used hard
against it, condensed display type for headers and the finish. Every colour pair
re-measured from scratch; none of the old cream-page measurements carried over.

## What is deliberately not built

The Week screen, money tracking, the horizons chain and the coach are Mission 2.
The goal table already carries the columns they need (`parent_goal_id`,
`weekly_habit`, `weekly_target_count`, `target_number`, `target_unit`,
`progress_number`, `life_area`) and there is a `habit_logs` table waiting, so
those are screens rather than a schema change under a live board.

No email, no reminders, no chore integration, no scheduling engine.

## Things to know before changing anything

- **Two lists must agree**: field ids in `api/src/lib/templates.ts` and the
  wording in `web/lib/worksheets.ts`. `npm run check:worksheet-ids` from the
  repo root. It gates the web deploy, not the api one.
- **Verify a deploy with `/api/version`**, never a health check.
- `npm run check:chunks` proves the pacing did not lose a question.
  `npm run check:contrast` measures every colour pair against WCAG 2.1 and was
  rewritten for the dark palette. Both run as `web`'s `prebuild` along with the
  worksheet-id check, so they gate the real Vercel build.
- **The log redaction works by shape, not by route.** Anything matching a token
  is hidden wherever it appears in a path. The first version named the routes it
  knew about and the first thing through it was a route this release deleted: an
  old bookmark to `/api/form/<token>` put a live token into Railway's logs. See
  `redactPath` in `api/src/server.ts`.
- **The preview walk needs its own database and its own API.** Both were built
  for this pass and then deleted; the recipe is in
  `docs/CONTINUATION-2026-09-15-mission-1.md`.
- The Vercel project's root directory is `web`, so `vercel deploy` is run from
  the repo root, not from `web/`.
- The database is reachable from a laptop through a Railway TCP proxy on the
  Postgres service.
- Vercel Authentication is limited to preview deployments, so production is open
  and previews stay protected. Open a preview through a share link.
