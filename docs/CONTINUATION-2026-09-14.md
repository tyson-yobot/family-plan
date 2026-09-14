# Continuation, 2026-09-14

## What was done

Phase 1a, the five worksheets, and Phase 2, the parent view. Both are built,
deployed and verified against the running system, not against a report.

## What a fresh session would get wrong without this

**The two deployments are not the same thing and only one of them can be
checked properly.** The API tells you the commit it is running at
`/api/version`. The site cannot. Use the API's answer, and confirm the site
separately by loading a page and looking at the behaviour you changed.

**A Vercel deploy from the command line and a deploy from a git push are not
interchangeable here.** The project's root directory is `web`, which is what a
git push needs. Running `vercel deploy` from inside `web/` fails with "the
specified Root Directory web does not exist", because the upload root is
already `web`. Push to `dev` and let the git deploy run.

**The Vercel MCP connector cannot create or update projects with the
credentials this machine has**; both came back 403. `vercel api` through the
CLI can, and is how the root directory, the framework and the deployment
protection were set.

**Vercel Authentication was on by default and would have locked the whole
family out.** It is now limited to preview deployments. If it ever reverts,
every link returns a login wall and the cause is not in this repository.

**The database is only reachable from a laptop through the TCP proxy** on the
Postgres service. Without it `drizzle-kit push` cannot see it from here.

**Do not trust a test that opens a worksheet somebody has already submitted.**
It shows "this month is done" instead, with no continue button, and a test
written without that in mind stalls on a timeout that looks like a bug in the
page.

## What was found by testing, not by reading

Everything below was live and would have reached a real person. Listed because
the same mistakes are easy to make again.

- The month heading said August in September, west of Greenwich: a UTC date
  formatted in local time.
- The list of screens was recomputed from the answers, so it changed shape on
  the first save and skipped the intro.
- The goal owner was painted on screen but never stored, so the worksheet
  refused to move on over a field that looked filled in.
- Clearing the answers to start a month again threw away everything carried
  over from last time, producing the same symptom again.
- An inline "this is required" message stayed up after the field was answered,
  and while it was there it suppressed the short-answer nudge.

## What a cold review found that testing did not

- The month was taken from the request body rather than computed on the server.
- Submitting was two statements rather than one transaction, and reopening the
  link afterwards offered a blank worksheet with no sign it was done.
- Going back and editing, and anything typed on the review screen including the
  note people leave themselves, were never saved.
- A failed save moved the person on anyway.
- The confirmation echoed a goal two cycles old rather than the one just
  answered.

## Open, and honestly open

- **Nothing enforces that the two field-id lists agree.** `npm run
  check:worksheet-ids` is run by hand. The obvious home for it is a check that
  runs before either deploy, and neither deploy can see both folders.
- **There is no rate limiting on any endpoint.** The tokens are 32 characters
  of real randomness so guessing is not a practical worry, but nothing would
  say if somebody tried.
- **The site's own access log records `/f/<token>` in full.** Nothing in this
  repository can redact that. The API's logs are redacted; the host's are not.
- **`submissions.template_type` is a plain text column** while `people` uses a
  real enum. That is what Phase 1a specified. A bad value there now produces a
  plain refusal rather than a crash, but the database would still accept one.

## Next, if it continues

Phase 3 as named in the original brief is reminders, and Phase 4 is the chore
integration. Reminders need a decision first: anything that emails or messages
a real person is not something a session should start on its own.
