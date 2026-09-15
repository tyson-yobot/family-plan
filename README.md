# family-plan

A private planning tool for one family. Not a product, not for anyone else.

## What it is

Five people each get their own private link. They open it on their phone once a
month, fill in their own worksheet, and submit it. The answers go into a real
database so they can be looked back at.

- `api/` Fastify and Drizzle against Railway PostgreSQL. Deploys to Railway.
- `web/` Next.js App Router. Deploys to Vercel. Installable to a phone home
  screen as a Progressive Web App.

There are three worksheets, not one. Tyson and Danyell get the adult worksheet,
six sections. Aidan and Mariah get the teen worksheet, four sections. Dylan gets
the young-adult worksheet, four sections, written for a nineteen year old living
at home rather than a bigger version of the teen one.

## The access model

There is no login. A person is identified only by a long random token in their
own URL, `https://<site>/f/<token>`. Tokens are 32 characters of real
randomness. Nothing in the API lists people, slugs or tokens, and request paths
are redacted before they reach a log line, because Railway keeps those logs.

The practical consequence: anyone holding the link is that person. That is the
right trade for five people in one house and the wrong trade for anything
bigger.

## The month

There is no dashboard and no scheduler yet, so the cycle is computed rather than
chosen. It is the current calendar month, `YYYY-MM`, worked out on the server in
the family's own timezone. The page never invents one.

If someone has a half-finished worksheet from an earlier month, it is never
silently resumed and never silently thrown away. They are asked which they want
before anything else is shown.

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

## Adding or re-issuing the five links

    cd api
    WEB_BASE_URL=https://<site> npx tsx src/scripts/seed.ts

Safe to run again. Anyone already in the table keeps the token they have, so
links already handed out keep working. It prints each person's link and writes a
QR code per person to `qr-codes/`, so each person can scan their own from a
screen instead of being sent a link to forward.

Run it locally and never in a build step. It prints full tokens, and a build log
is not a place for them.

## Checking a deploy actually landed

`GET /api/version` returns the commit that is running and when it was built. Use
that, not a health check: a health check returns 200 perfectly happily while the
old code is still serving.

## Two lists that must agree

The field ids the API validates against live in `api/src/lib/templates.ts`. The
wording shown on screen lives in `web/lib/worksheets.ts`. They are separate
files because the two build contexts do not contain each other, and if they
drift you get a worksheet that can be filled in and then refuses to submit.

    npm run check:worksheet-ids

from the repo root compares them. It is run by hand. Nothing enforces it in
either deploy, and that is a real gap rather than a covered one.

## Two more checks, run the same way

    npm run check:chunks
    npm run check:contrast

`check:chunks` runs the real code that splits a section into small screens
against the real worksheets, and fails if a question is asked twice, asked out
of order, dropped, or if a screen has gone back to holding more than four. A
dropped question would not error anywhere: the worksheet would simply never ask
it, and the server would then refuse the submission over a field nobody was
shown.

`check:contrast` reads the colours out of `web/lib/theme.ts` and
`web/app/globals.css` and measures every pair the app actually renders against
WCAG 2.1. Every accent is used three ways, as a button background under white
text, as text on the page and on a card, and as a tint behind an icon, and a
colour can be comfortable in one and fail in another.

Both are run by hand, like the one above, and nothing in either deploy runs
them.

## The parent view

Phase 2. `https://<site>/d/<token>`, one link each for Tyson and Danyell,
created by:

    cd api
    WEB_BASE_URL=https://<site> npx tsx src/scripts/seed-dashboard.ts

It opens on the five people and this month, gives each person's history, and
lays out every answer in the order it was written. It is read only: nothing in
it can change or delete what anybody wrote.

A parent link reads everybody's answers, which makes it the one link here that
really matters. It is kept in its own table, separate from the people who fill
worksheets in, so a worksheet token can never be used as a parent one.

## Deliberately not built yet

There is no email, no reminders, no chore integration and no scheduling engine.
Quarterly review timing is a later idea and is not implemented.

There is no password anywhere, on either half. An unguessable link is the whole
of the access control, which is the right trade for five people in one house
and the wrong one for anything bigger.
