# elvinpeters.com design system

One page. If a page disagrees with this document, the page is wrong.
Tokens live in `css/site.css` — **hex literals live there and nowhere else.**
`node verify.js` enforces the FAIL rules on every build; WARN rules are debt.

## Contexts
Three color contexts assign the same 15 role names (`--bg --bg-2 --panel
--panel-2 --line --line-soft --line-strong --ink --ink-2 --muted --accent
--accent-hi --accent-ink --accent-on --info/--ok/--warn`):
- **site-light** (default) · **site-dark** (OS preference, or pinned via the
  toggle → `localStorage['ep-theme']`, applied by `js/site.js`)
- **book-light** — `<html data-theme="book">`. Fixed white on purpose (sales
  page). Never flips; no theme toggle rendered there.

## Type — 9 steps, nothing else
`--fs-label` 12px (FLOOR) · `--fs-sm` 14 · `--fs-body` 16 · `--fs-lead` 18 ·
`--fs-lead-lg` 22 · `--fs-h3` clamp(20→24) · `--fs-h2` clamp(28→40) ·
`--fs-h1` clamp(34→52) · `--fs-display` clamp(40→64, homepage hero only).
Leading: headings `--lh-tight` 1.12, card titles 1.2, body 1.6, long-form 1.75.
**No fractional px. Nothing under 12px. Form controls never under 16px** (iOS zoom).
Fonts: EB Garamond (headings) + Inter (everything else). No third font, ever.

## Color rules
- Gold is a **fill** (`--accent`, gradients with `--accent-hi`). The ONLY gold
  text is `--accent-ink` (passes 4.5:1 in every context). One exception: a
  display-size hero line may use `--accent` (large-text contrast).
- `--muted` is the dimmest legal text. `--line-strong` for interactive borders.
- One red (`--warn`), one green (`--ok`), one blue (`--info`). No new hues.

## Shape and space
- **Every button and chip is a pill** (`--r-pill` 999px). Inputs/thumbs
  `--r-sm` 10 · cards `--r-card` 16 · full-width bands `--r-lg` 20.
- Tap targets ≥ `--tap` 44px. Space on the 4px scale (`--sp-1..10`);
  section rhythm via `--sp-section` / `--sp-section-tight`.
- Containers: `--w-wide` 1080px (heroes, bands, nav) or `--w-text` 720px
  (anything you read). Pick one; do not invent a third.

## Breakpoints
**640 and 920. Only.** A deliberate exception carries `/* bp-exempt: reason */`
on the same line, which verify.js honors.

## Images
`width` + `height` attributes always; `loading="lazy"` below the fold; never
an inline `width:` style on an `<img>` (that exact bug shipped a stretched
cover and a sideways-scrolling page — twice). Prefer webp; the eager payload
budget is ~250KB per page. If CSS constrains one dimension, set the other
`auto` or you re-create the stretch.

## Chrome
Nav + mobile drawer + theme come from `js/site.js` (accessible: real button,
`aria-expanded`, Escape, focus return). Never hide nav links on mobile without
the drawer present. Anchors rely on `[id]{scroll-margin-top}` — do not remove.

## Proof and claims (content rules that verify.js tripwires)
No unattributed testimonials, no star rows without a real rating count, no
implied rankings ("bestseller" imagery), no payment badges where no payment
happens, one number per fact (games count, budget figures) sourced from what
actually exists in the repo.

## Workflow
`node build.js && node verify.js` before any push. Green gate or no push.
New page? Start from the tokens and primitives (`.btn .btn--primary .btn--ghost
.label .field .section`), link `css/site.css` + `js/site.js`, and you inherit
all of the above for free.
