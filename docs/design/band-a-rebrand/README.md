# Shoots rebrand — Band A design spec

**For:** the Code session doing the edits
**Scope:** six pages rebuilt properly ahead of the September launch
**Status of this document:** design decisions are settled. Implementation approach is yours.

---

## 0. Read this first — three sequencing rules

These are ordering constraints, not preferences. Getting them wrong costs rework.

**1. Typography is a three-face system. Do not flatten it.**
`docs/brand-guidelines.md` defines three faces with fixed roles, and the live landing page still follows it. **Both faces are already loaded and already used correctly in the auth pages** — see the `UI` / `BODY` constants at the top of `src/app/auth/forgot-password/page.tsx`. There is no font swap to perform. What changes on these pages is colour, radius, borders and button style.

| Face | Role |
|---|---|
| **Space Grotesk** | Headings, UI labels, button text, nav, metadata, **all numeric values** |
| **Plus Jakarta Sans** | Body prose, form content, help text, descriptions |
| **DM Serif Display** | Decorative only — the marketing About testimonial. Nowhere else. **Not** the onboarding welcome headline: see §7. |

`brand-guidelines.md` reserves the serif for two places, one of them the onboarding welcome headline. **That reservation is superseded** — Paul's decision, 20 Aug. The serif is now used in one place only, the About testimonial, and no page in Band A uses it.

**2. Google OAuth must be configured before the button is built.**
Checked directly: the Supabase project has 31 auth identities and every one is `email`. Google has never been used, so it is not currently wired up. The config job — Google Cloud OAuth client, then the provider toggle in Supabase Auth — lands first. If it slips, build the email-only variants (see §7) rather than shipping a button that does nothing.

**3. Signup ships built but unlinked.**
The signup page is being prepared for launch, not for now. Build the route and the page; do **not** add a link to it from the landing header or anywhere else public. Today the only public entry points are "Sign in" and the waitlist anchor, and that stays true until launch. Someone will otherwise helpfully wire it up.

**Also worth knowing:** `docs/brand-guidelines.md` is still written for Grant Tracker — it names the product, the old domain, and lime as the primary CTA colour. Its *typography* and *voice* sections are still correct and are the source of truth for §0 and §3 here. Its *colour* and *button* sections are superseded by §2 and §4 of this document. Updating that file is worth doing, but it is not part of Band A.

---

## 1. Pages in scope

| Page | Route | Direction |
|---|---|---|
| Login | `/auth/login` | A — centred card |
| Signup | `/signup` | B — split canvas *(built, unlinked)* |
| Forgot password | `/auth/forgot-password` | A — centred card, 2 states |
| Reset password | `/auth/reset-password` | A — centred card, 5 states |
| Onboarding welcome | `/onboarding/welcome` | centred hero, Space Grotesk headline |
| Onboarding wizard | `/onboarding/wizard` | 720px card, 7 states / 6 steps |

Out of scope: the rest of the app gets a cosmetic pass only, and the full sweep waits until October. Do not refactor shared app chrome beyond what these six pages need.

---

## 2. Colour tokens

Taken from the live landing page, plus three additions for states that did not previously exist.

```
/* brand — already live at /landing */
--cream:            #F6F1E7   /* page background */
--deep:             #1D3C3E   /* primary ink, primary button fill */
--forest:           #173404
--charcoal:         #2E2E2E   /* body text */
--sage:             #9BCA9D   /* highlight, success tint */
--terra:            #D67558   /* accent/fill only — never text, see §6 */
--gold:             #EBCE78
--teal:             #4EAAB4
--sky:              #ABCBEE

/* added for states */
--deep-hover:       #16302F
--deep-active:      #102524
--ink-muted:        #5F5E5A   /* secondary text */
--ink-placeholder:  #74736E
--danger:           #B4472A
--danger-hover:     #9C3C24
--danger-tint:      #FBEFEA
--border-input:     #7B8A8B
--border-ghost:     rgba(29,60,62,.22)
--border-hair:      rgba(29,60,62,.10)

/* geometry */
--radius-pill:      999px     /* all buttons */
--radius-input:     12px
--radius-card:      22px
```

The lime `#8ECB3C` that currently drives primary buttons is **retired**. It should not appear on any of these six pages.

### Contrast — do not substitute these values

Every pair was calculated, not eyeballed. Three of them replace values that fail WCAG AA:

| Use | Value | On cream | Note |
|---|---|---|---|
| Primary ink | `#1D3C3E` | 10.55:1 | |
| Secondary text | `#5F5E5A` | 5.77:1 | replaces charcoal @ 60% (3.70:1 — **failed**) |
| Placeholder | `#74736E` | 4.75:1 on white | replaces charcoal @ 42% (2.41:1 — **failed**) |
| Input border | `#7B8A8B` | 3.59:1 on white | replaces deep @ 18% (1.39:1 — **failed**) |
| Danger | `#B4472A` | 4.81:1 | works as both fill and text |

If a lighter grey looks better to you, it is failing. These are floors.

---

## 3. Type

Three faces, fixed roles — see §0. Desktop values:

| Role | Face | Size / line-height | Weight | Tracking | Colour |
|---|---|---|---|---|---|
| Display *(landing hero only)* | Space Grotesk | 70 / 1.08 | 700 | −0.03em | `--deep` |
| Page title | Space Grotesk | 27–32 / 1.15 | 600 | −0.025em | `--deep` |
| Section | Space Grotesk | 20 / 1.3 | 600 | −0.01em | `--deep` |
| Body prose | **Plus Jakarta Sans** | 14.6–17 / 1.6 | 400 | normal | `--ink-muted` |
| Label | Space Grotesk | 13 / 1.3 | 600 | normal | `--deep` |
| Meta / helper | Plus Jakarta Sans | 12.7 | 400 | normal | `--ink-muted` |
| Eyebrow | Space Grotesk | 11.5 | 600 | .16em, uppercase | `--ink-muted` |
| Onboarding welcome headline | Space Grotesk | 48 / 1.08 | 600 | −0.03em | `--deep` |

Numerals are always Space Grotesk, including inside body prose.

## 4. Button hierarchy

Four levels. Primary, secondary and tertiary are already live in the landing header — match those, don't reinvent them.

**Primary** — deep fill. One per page (or per distinct decision point). Never two competing.
`background: --deep; color: --cream; border-radius: 999px; padding: 12px 26px; font: 600 15px;`
Full-width form variant: `height: 52px`.

**Secondary** — ghost outlined.
`background: transparent; color: --deep; border: 1.5px solid --border-ghost; padding: 10.5px 24.5px;`

**Tertiary** — text with underline.
`color: --deep; text-decoration: underline; text-underline-offset: 4px; text-decoration-thickness: 1.5px; text-decoration-color: rgba(29,60,62,.35);`

**Danger** — `--danger` fill, `#FDF6F3` text. Destructive and irreversible actions only; does not appear on any Band A page, specified here so it exists when the wider app needs it.

### States

| State | Primary | Secondary | Tertiary | Danger |
|---|---|---|---|---|
| Hover | `--deep-hover` | bg `rgba(29,60,62,.06)`, border `.38` | underline → full `--deep` | `--danger-hover` |
| Active | `--deep-active`, `translateY(1px)` | — | — | — |
| Focus | `outline: 2px solid --deep; outline-offset: 3px` | same | same, `border-radius: 8px` | `outline-color: --danger` |
| Loading | spinner + verb ("Signing in…"), width held | — | — | — |
| Disabled | bg `rgba(29,60,62,.26)`, text `rgba(29,60,62,.48)` | text `.38`, border `.12` | — | — |

**The focus ring is not optional.** The ghost button's border is deliberately light (1.49:1, matching the live brand) — the label carries identification, and the focus ring carries keyboard navigation. Removing it makes the control genuinely unusable without a mouse.

**Loading must hold the button's width** so the layout doesn't jump when a form submits.

---

## 5. Inputs

```
height: 50px; border-radius: 12px; border: 1.5px solid #7B8A8B;
background: #fff; padding: 0 15px; font-size: 15px; color: #2E2E2E;
```

| State | Change |
|---|---|
| Placeholder | text `--ink-placeholder` |
| Focus | `border-color: --deep` + `box-shadow: 0 0 0 3px rgba(29,60,62,.16)` |
| Error | `border-color: --danger`, `background: --danger-tint`, message below |
| Disabled | `background: #F1EEE7`, `border-color: #D8D3C8`, text `--ink-placeholder` |

Labels are always visible — never placeholder-as-label. Password fields get a "Show" toggle, styled as tertiary.

Error messages sit below the field, 12.8px `--danger`, with the alert icon, and must be linked to the input via `aria-describedby`.

---

## 6. Behaviour rules

**Sign-in failure must not reveal whether an account exists.** One message — *"Email or password is not correct"* — shown as a banner above the form, never attached to one field. Confirming a valid email to someone guessing tells them an account exists.

**Terracotta `#D67558` is never text.** It is 2.85:1 on cream and fails as body copy. Fill, accent and icon use only. Danger uses `#B4472A` instead, which is why danger is a deepened terracotta rather than a generic red — a stock red sits foreign against the teal-greens.

**Every interactive element needs a visible focus state.** See §4.

---

## 7. Page briefs

Appearance is defined by the accompanying HTML mockups, which use the real token values. Treat those as the source of truth for layout and spacing; this section covers intent and content.

### Login — `/auth/login`

Centred card on cream, max-width 436px, vertically centred. Header carries the logo left and "New here? Join the waitlist" right.

- Title "Welcome back", body "Sign in to pick up where you left off."
- Email, then password with "Forgot password?" as a tertiary link **on the label row**, right-aligned — not floating below the field.
- Primary "Sign in", full width.
- Divider "or", then secondary "Continue with Google".
- **Email-only fallback:** if Google is not ready, remove the divider and the Google button together, and add a hairline-topped footer reading "New to Shoots? Join the waitlist →". Do not leave the divider orphaned.

Sign-in is the only primary on the page.

### Signup — `/signup` *(built, unlinked)*

Split canvas. Deep panel left (50%), form right on cream with no card.

Left panel, top to bottom: logo · headline "Funding you can actually win" with `--sage` highlight behind "actually win" · four benefits · proof row.

The four benefits are drawn from live landing sections so marketing and signup say the same thing — do not rewrite them:

1. **Only what you're eligible for** — Every opportunity checked against your legal structure, location and funding stage, before you spend an hour on it.
2. **Not just grants** — Social investment, programmes and in-kind support alongside grants — the funding you didn't know to look for.
3. **One pipeline, not a stale spreadsheet** — Track every application from matched through drafting to won, with every deadline in view.
4. **Applications in your own voice** — Turn one project into tailored, fundable applications per funder. The voice stays yours.

Proof row: `600+` verified opportunities · `4` funding types · `3 min` to first matches.

Right panel: "Already have an account? Sign in" top right · title "Create your account" · body "Tell us about your organisation and see what fits, in about three minutes." · Your name, Work email, Password · primary "Create account" · divider · "Sign up with Google" · terms and privacy line.

**Mobile:** the deep panel stacks above the form. Drop the benefits to the two strongest (1 and 3) rather than scrolling all four above the fields.

### Forgot password — `/auth/forgot-password`

**Re-skin only. Do not restructure and do not rewrite the copy.** The existing page is correct: the sent-state phrasing ("If *address* has an account…") is enumeration-safe, and the "Not arrived?" box carries the one-per-hour rate limit, which users need because a second request inside the hour sends nothing silently.

What changes: page background to cream, lime button to deep fill, card radius to 22px, input border to `#7B8A8B`, tertiary links restyled.

Two states — form, and sent.

### Reset password — `/auth/reset-password`

**Re-skin only.** This page was rebuilt in August after a user was locked out for two weeks; `docs/password-reset-flow.md` documents why it looks the way it does. The four-phase state machine, the click-to-redeem gate and the parsing in `src/lib/auth/recovery-link.ts` are all load-bearing. **Do not simplify any of it.**

Five states — checking, confirm, ready, done, invalid.

Two proposed changes, both optional and both copy-only:

1. **Rename the `confirm` phase heading** from "Reset your password" to **"You're nearly there"**. It currently duplicates the forgot-password heading word for word, and a user following a dead link sees both in sequence.
2. **The `invalid` state should not read as an error.** Its everyday cause is Outlook/M365 safe-links prefetching and burning a single-use token before the human clicks — routine, and not the user's fault. Use the gold badge, not danger red, and make the resend field the primary action.

**Open question for you:** `recovery-link.ts` mentions a distinct missing-verifier state for opening the email on a different device from the one that requested the reset. That is a very common thing for people to do, so the state will be seen. Confirm it renders with the same care as the expired state rather than as a bare error.

### Onboarding welcome — `/onboarding/welcome`

**Decided: the headline stays Space Grotesk.** "Welcome, {name}." in `--ui`, 48px, weight 600, line-height 1.08, tracking −0.03em, `--deep`. Matches what the page does today.

This was put to Paul as an open question because `docs/brand-guidelines.md` reserves DM Serif Display for this exact headline and the page had drifted from it. **He chose consistency over the brand doc.** The consequence is that the guideline is now the stale one, not the page: the serif is used in a single place across the whole product, the marketing About testimonial. Update `brand-guidelines.md` §2 to drop the onboarding reference so the next person doesn't re-litigate this. **No Band A page loads DM Serif Display.**

Everything else on the page keeps its structure. The eyebrow moves from lime text to a `--sage-tint` pill with a `--deep` dot; the CTA becomes a deep-filled pill; page background moves to cream.

**Two copy changes:**

1. **The eyebrow must be conditional.** "Founding cohort, you're in" is true today and false for anyone arriving through public signup from September. Show it only to actual founding-cohort members; everyone else gets a neutral line. This needs a flag on the user or organisation record — treat it as part of this page's work, not a later cleanup, because shipping it unconditioned tells new signups something untrue on their first screen.
2. **Fix the name fallback.** `firstName()` returns the literal string `'there'`, which renders as "Welcome, there." Fall back to a nameless "Welcome." instead.

### Onboarding wizard — `/onboarding/wizard`

Seven states across six step positions: `entry`(1) · `review`|`manual`(2) · `sectors`(3) · `beneficiaries`(4) · `location`(5) · `reveal`(6).

**Keep the 720px card.** It is the one place in Band A where a wider container is correct — the review step carries four fields and the sector step ten chips. Do not let the 436px auth-card width leak across.

**The field-confidence system is the important part.** `fieldConf()` returns `confident | uncertain | missing`, and each needs a shape as well as a colour so the state survives greyscale and colour-blindness:

| State | Background | Border | Icon | Extra |
|---|---|---|---|---|
| `confident` | `--sage-tint` `#E1EFE2` | `rgba(29,60,62,.10)` | tick, white on `--deep` | — |
| `uncertain` | `--gold-tint` `#F7ECCC` | `rgba(133,79,11,.22)` | warning, white on `#854F0B` | "· please confirm" in `#854F0B` |
| `missing` | `#FBF9F4` | 1px **dashed** `rgba(29,60,62,.30)` | plus, dashed outline | value in `--ink-placeholder` |

`#854F0B` on the gold tint is 5.71:1. Deep on either tint is ~10:1.

**Add a text step counter.** "Step 3 of 6" beside the dots. The six-dot indicator is currently the only progress signal and it is purely visual — a screen reader gets nothing from it and it is hard to count at a glance. With the text present the dots become decorative, which is where they belong. **This is the change I would argue hardest for on this page.**

Step dots: upcoming `rgba(29,60,62,.15)` · completed `--sage` · current `--deep`, 20px wide pill.

Sector chips: unselected is ghost-outlined; selected is `--deep` fill; **primary** is `--sage-tint` with a `--deep` border and a star. Primary is a different kind of thing from "also selected", so it gets a different mark rather than a darker shade of the same one.

**Not yet designed** — the `manual` branch, `beneficiaries`, `location`, the "Finding your matches…" loading state, per-field inline editing, and mobile. The four drawn states establish the language and the rest should inherit it, but that claim is worth checking against the real file rather than assumed.

---

## 8. Definition of done

- No `#8ECB3C` anywhere on the six pages
- Typography roles intact: Space Grotesk for UI, numerics and the welcome headline; Plus Jakarta Sans for body prose; no DM Serif Display anywhere in Band A
- The reset-password state machine is untouched — same four phases, same guarantees
- Every interactive element has a visible focus state, reachable by keyboard alone
- Sign-in failure does not disclose account existence
- No contrast value below the floors in §2
- Signup builds and routes but is not linked from anywhere public
