# family-plan, current state

Last updated 2026-09-14.

## Where it is

Phase 1a is built, deployed and verified. Phase 2, the parent view, is in
progress in the same session.

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
all three shapes, drafts that save on every section, the stale-draft choice, the
review screen, the confirmation echoes, five private links with QR codes, and a
Progressive Web App that installs to a phone home screen.

## What is deliberately not built

No login. No email or reminders. No chore integration. No scheduling engine.
Quarterly review timing is a later, dashboard-driven idea and is not here.

## Things to know before changing anything

- Two lists must agree: field ids in `api/src/lib/templates.ts` and the wording
  in `web/lib/worksheets.ts`. Run `npm run check:worksheet-ids` from the repo
  root. Nothing enforces it in either deploy.
- Verify a deploy with `/api/version`, never a health check.
- The database is reachable from a laptop through a Railway TCP proxy on the
  Postgres service. Without it, `drizzle-kit push` cannot reach it from here.
- Vercel Authentication was on by default on this project and would have locked
  every family member out. It is now limited to preview deployments, so
  production is open and previews stay protected. That is deliberate: the
  unguessable link is the access control.
