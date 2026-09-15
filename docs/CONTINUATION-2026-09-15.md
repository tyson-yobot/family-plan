# Continuation, 2026-09-15

The design and pacing pass. Read this before touching the worksheet flow.

## What this session did

Tyson opened his own check-in and the parent dashboard for the first time and
could not tell what the tool was going to do, or why it was spread over so many
screens. The finding underneath that complaint was specific: section one of the
adult worksheet was not six screens, it was eleven near-identical
score-and-reason cards stacked on one endlessly scrolling page, all of them
required before the progress bar moved at all.

So this was a pass on the container, not the contents. `web/lib/worksheets.ts`
and the whole of `api/` have a zero-line diff across it, which is the cheapest
proof that no question, no wording, no order and no validation rule changed.
Exactly one user-facing string outside those files changed on purpose: the
heading on the submitted screen, from "Submitted. Thank you." to a warmer
moment, which was the point of that part of the work.

## The wrong assumptions a fresh session would make

**The saved place is a screen, not a number.** A bare index used to be safe
because a step was a whole section. It is not any more: how many screens a
section is asked over depends on the fields inside it, so deleting one scored
life area turns section one from five screens into four and shifts every index
after it. `_ui.place` now holds `{kind, index, part}` and is looked up on the way
back in; `_ui.step` is kept only as the fallback for a draft written before this
existed. If you ever go back to trusting the number, a mid-month deploy silently
moves whoever is part way through to a screen they did not leave.

**Nothing on the parent dashboard knows how far through anybody is.** The API
sends `started_at` and nothing else. A part-drawn arc for somebody mid-way was
the first thing built here and it was wrong: a made-up quantity sitting directly
under a ring whose arc is a real fraction. Being part way through is a dashed
ring for exactly that reason. If a real position is ever wanted, send it from the
API rather than inventing one in the component.

**The section is not the unit any more.** A step is now
`{kind:'section', index, part, partCount}`. `web/lib/chunks.ts` cuts a section
into the screens it is asked over, by weight rather than by count, because three
scored areas fit a phone and three long written answers do not. Everything that
used to loop over `section.fields` now has to loop over the units of the current
part instead. `checkStep` and `nudgeKeysFor` in particular: if either goes back
to reading the whole section, somebody is told to answer a question they have
not been shown yet.

**The step list must never change shape for the same person between two saves.**
This was already true for the note screen and the comment there says why; the
"what a check-in is" screen is now the second thing that can add or remove a
step. Both are decided once, when the worksheet opens, and both are written into
the draft's `_ui` key alongside `step`. If either were recomputed from the
answers, every index after it would shift under somebody mid-way through.

**`partsOf` has to stay deterministic.** It reads the worksheet and nothing
else. The moment it depends on an answer, a saved `step` points somewhere
different on the way back in. `npm run check:chunks` is the guard on this and on
the harder one: that every question is still asked, once, in the order it was
written. A dropped question is silent, because the worksheet simply never asks
it and the server then refuses the submission over a field nobody saw.

**Do not add a plain `build` script or reach for `color-mix`.** The tint behind
every icon is computed in `tintOf` in `web/lib/theme.ts` rather than written as
`color-mix` in the stylesheet, so that the exact colour shipping is a value
`npm run check:contrast` can read and measure. Moving it into CSS would make the
contrast check measure a colour the app no longer uses.

## Things that cost time, so they do not cost it again

**The Vercel project's root directory is `web`, so `vercel deploy` runs from the
repo root.** From `web/` it looks for `web/web` and fails. Linking at the root
appends duplicate `.vercel` and `.env*` lines to `.gitignore`; check
`git status` afterwards.

**A preview walk needs no Railway change.** `WEB_ORIGIN` already allows
`family-plan-git-dev-tyson-yobots-projects.vercel.app`. Deploy a preview, then
`npx vercel alias set <deployment> family-plan-git-dev-tyson-yobots-projects.vercel.app`,
and the preview runs against the real API at an origin CORS already permits,
with production on `family-plan-iota` untouched. Put the alias back to the
production deployment when finished. The alias is protection-protected, so open
it through a share link.

**Chrome could not be resized for this walk.** The window was maximized and the
extension's resize reported success while `innerWidth` stayed at 1528. Phone
width was measured instead by setting `html { width: 390px }` and reading
geometry out of the DOM, which gives a real 390px layout box for everything
except a `position: fixed` element, whose box still comes from the real
viewport. The one fixed element here is the "what is this" overlay, and it was
measured separately by setting its own width. Chrome also refused to open
`localhost`; the LAN address the dev server prints works.

**The two tap targets that were too small were only found by measuring.** A
`<summary>` is not covered by the `button, [role=button] { min-height: 44px }`
rule in `globals.css` and was 21px tall. The Edit links on the review screen
were 24px across. Neither looked wrong.

## Left open, deliberately

**The three checks now run as `web`'s `prebuild`, and that was tested rather
than assumed.** The Vercel project's root directory is `web` but the build does
get the files above it, confirmed by reading a real preview build log and seeing
all three run. It was then watched failing on purpose: a worksheet field id was
renamed, deployed, and Vercel refused the build. So a dropped or renamed field
can no longer reach the family's links.

**Score endpoint labels.** The 1-to-10 and 1-to-5 pickers show bare numbers. A
word at each end would help an eleven year old, but whether that counts as the
container or the contents is genuinely unclear, so it was left alone. It is
Tyson's call.

**Reduced motion was verified by flipping the media condition on in the CSSOM
and reading the computed style back**, not by changing an operating system
setting. The ring and tick come out drawn and static rather than absent, which
is the intent.
