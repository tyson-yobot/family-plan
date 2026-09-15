# family-plan, current state

Last updated 2026-09-14.

## Where it is

Phase 1a and Phase 2 are both built, deployed and verified against the running
system. No test data is left in the database: five people, no drafts, no
submissions.

## Live addresses

- Site: https://family-plan-iota.vercel.app
- API: https://api-production-c4122.up.railway.app
- Check what is actually running: https://api-production-c4122.up.railway.app/api/version

## Its own projects, shared with nothing else

Both were created new for this and are not attached to CONSTRUKTR, TRANSFORMR,
REPLAY, AACC, PopJar or anything else.

- Railway project `family-plan`, id `c5eebf06-daa6-4963-86a3-b6aa8d1835bd`
- Vercel project `family-plan`, id `prj_eSdBYuUbwNsyPoDKRkbpVVxKxfh1`
- GitHub `tyson-yobot/family-plan`, private, branch `dev`

Inside the Railway project: a Postgres service and an `api` service with root
directory `/api`. The Vercel project builds from root directory `web`.

## What is done

Phase 1a: three worksheets (adult, teen, young adult), server-side validation of
all three shapes, answers that save as they are written, the stale-draft choice,
the review screen, the confirmation echoes, five private links with QR codes,
and a Progressive Web App that installs to a phone home screen.

Phase 2: a read-only parent view at `/d/<token>`, one link each for Tyson and
Danyell. Who is done this month, everybody's history, and every answer laid out
in the order it was written. It cannot change or delete anything.

Phase 3, the design and pacing pass. No question, no wording, no order and no
validation rule changed: `web/lib/worksheets.ts` and the whole of `api/` are
byte for byte what they were. What changed is the delivery. A check-in opens on
one screen saying what it is, shown to somebody who has never written anything
here before and reachable from the header afterwards. Each section is asked over
two or three small screens rather than one long one, so the bar moves on every
screen. Everybody's own colour runs through their whole check-in, every question
has an icon, and finishing a section or the whole thing is marked.

## What is deliberately not built

No email, no reminders, no chore integration, no scheduling engine. Quarterly
review timing is a later idea and is not here.

There is no password anywhere. Both the worksheets and the parent view are
reached by an unguessable link, which is the same model throughout rather than
two different ones. A parent link reads everybody, so it matters more than the
others.

## Things to know before changing anything

- Two lists must agree: field ids in `api/src/lib/templates.ts` and the wording
  in `web/lib/worksheets.ts`. Run `npm run check:worksheet-ids` from the repo
  root. Nothing enforces it in either deploy.
- Verify a deploy with `/api/version`, never a health check.
- `npm run check:chunks` proves the pacing did not lose a question: every field
  is still asked, once, in the order it was written, and no screen has gone back
  to holding more than four. `npm run check:contrast` measures every colour pair
  the app renders against WCAG 2.1. Both were watched failing on purpose and
  then passing. All three, including the worksheet-id check, now run as `web`'s
  `prebuild`, so they gate the real Vercel build rather than waiting for
  somebody to remember. That was tested by renaming a field id, deploying, and
  watching Vercel refuse the build, not assumed from the project settings.
- The preview walk does not need a Railway variable changed. The origin
  `family-plan-git-dev-tyson-yobots-projects.vercel.app` is already in
  `WEB_ORIGIN`, so `npx vercel deploy` then `npx vercel alias set <deployment>
  family-plan-git-dev-tyson-yobots-projects.vercel.app` gives a working preview
  at an allowed origin, with production on `family-plan-iota` untouched. That
  alias is protected, so open it through a share link rather than directly.
- The Vercel project's root directory is `web`, so `vercel deploy` is run from
  the repo root, not from `web/`. Run from `web/` it looks for `web/web` and
  fails. Linking at the root appends duplicate lines to `.gitignore`; check
  `git status` afterwards.
- The database is reachable from a laptop through a Railway TCP proxy on the
  Postgres service. Without it, `drizzle-kit push` cannot reach it from here.
- Vercel Authentication was on by default on this project and would have locked
  every family member out. It is now limited to preview deployments, so
  production is open and previews stay protected. That is deliberate: the
  unguessable link is the access control.
