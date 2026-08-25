# Band B, first pass — app shell & dashboard

**Companion file:** `shell-and-dashboard.html` in this folder. It holds the visuals at real token values, plus the measured contrast tables; this note holds intent, sequencing and the things a screenshot can't tell you.

**Hero: option A — the deep panel — is decided.** Paul chose it on 20 Aug. The companion file draws only that.

**Scope:** the shared sidebar, the dashboard page background, and the dashboard itself. Nothing else. The rest of the app keeps its current styling until we come back to it.

---

## One consequence of choosing A

The hero is now a `--deep` fill that is not a button, which weakens "deep = the thing to click" as a signal. The companion file handles this by giving the hero CTA a **`--cream` fill on the deep panel** rather than another deep fill — so within the panel the button is still the lightest, highest-contrast thing. Keep that inversion; a deep button on a deep panel is the failure mode to avoid.

---

## Do this first, and separately: the app still calls itself Grant Tracker

**27 user-facing strings**, including the dashboard headline this pass is redesigning — `src/app/dashboard/page.tsx:445`, "Welcome to Grant Tracker, {displayName}." Also five browser tab titles (`Projects · Grant Tracker`, `Applications · Grant Tracker`, and so on), the whole of `dashboard/instructions/page.tsx`, the applications copy, `dashboard/account/page.tsx`, and the feedback form.

This is find-and-replace, not design. It does not depend on anything below and should not wait for the hero decision.

**Three deliberate uses must survive.** A blanket replace will eat them:

- `src/app/privacy/page.tsx:43` and `src/app/terms/page.tsx:39` — "In August 2026 Grant Tracker became Shoots." Legally load-bearing; this sentence is the reason the change of name is documented.
- `src/app/privacy/page.tsx:61` — "trading as Shoots (formerly Grant Tracker)".
- `src/app/auth/login/layout.tsx` — the comment there explains that the OAuth authorize screen and `/mcp` advertising "Grant Tracker" is intentional, not a brand bug. Read it before touching anything in `.well-known/`.

---

## The token-scope question — read before writing any CSS

Band A deliberately scoped itself to `.shoots-a` so the wider app kept the old tokens. That was the right call and it now creates a specific hazard, because **the same token names hold different values inside and outside that scope**:

| Token | Global (`globals.css`) | Inside `.shoots-a` |
|---|---|---|
| `--cream` | `var(--bg-page)` = `#FAFAF7` | `#F6F1E7` |
| `--sage` | `var(--green-mid)` = `#639922` | `#9BCA9D` |
| `--forest` | `var(--green-deep)` = `#173404` | — |

`src/app/dashboard/layout.tsx` is the parent of **40 page components**. Putting `.shoots-a` on that wrapper would silently redefine those tokens for every one of them.

**Blast radius is small but real:** two files consume the colliding tokens today —

- `src/app/dashboard/admin/grants/[id]/GrantDetail.tsx`
- `src/app/dashboard/admin/review/ReviewQueue.tsx`

Both are admin surfaces Paul uses daily. `--sage` shifting from `#639922` to `#9BCA9D` in those views would be a real, unannounced colour change in tools nobody asked us to touch.

**Recommendation: do not put the token scope on the dashboard layout.** Set the page background on the layout element directly — replacing the literal `#FAFAF7` at `dashboard/layout.tsx:51` — and apply the full token scope only to the two things being redesigned: the `Sidebar` component and the dashboard page itself. That keeps 38 untouched pages genuinely untouched.

If you'd rather widen the scope, that's a defensible call — but it converts this pass from "shell and dashboard" into "audit 40 pages", so flag it rather than absorbing it.

---

## Sidebar — `src/components/layout/Sidebar.tsx`

The `SB` block at lines 71–82 is the whole colour surface. Map:

| `SB` key | Current | New |
|---|---|---|
| background (l.234, l.433) | `#173404` | `--deep` `#1D3C3E` |
| `textBright` | `#F5F1E8` | `--cream` `#F6F1E7` |
| `text` | `rgba(245,241,232,0.72)` | `rgba(246,241,231,0.80)` |
| `icon` | `rgba(245,241,232,0.55)` | `rgba(246,241,231,0.70)` |
| `iconActive` / `accent` | `#8ECB3C` | `--sage` `#9BCA9D` |
| `activeBg` | `rgba(142,203,60,0.14)` | `rgba(246,241,231,0.10)` |
| `hover` | `rgba(245,241,232,0.06)` | unchanged |
| `divider` | `rgba(245,241,232,0.08)` | `rgba(246,241,231,0.10)` |
| `badgeBg` / `badgeText` | lime @18% / `#C0DD97` | `--sage` bg, `--deep` text |

**The two alpha bumps are not cosmetic preference.** Forest `#173404` is darker than deep `#1D3C3E`, so every alpha-based colour on the sidebar *loses* contrast when the background lightens:

| Element | On forest | On deep, alpha unchanged | On deep, proposed alpha |
|---|---|---|---|
| Nav label, inactive | 7.04:1 | 6.29:1 | **7.40:1** @80% |
| Nav icon, inactive | 4.76:1 | **4.39:1** | **6.07:1** @70% |

Nothing fails either way — icons are non-text UI at a 3:1 threshold — but a straight background swap drifts the whole sidebar down about half a point, which is the wrong direction and invisible without measuring. Change the alphas in the same commit as the background.

Also at line 356: the `#8ECB3C` / `#173404` badge becomes `--sage` on `--deep` (6.41:1).

---

## Dashboard — `src/app/dashboard/page.tsx`

Page background: `dashboard/layout.tsx:51`, `#FAFAF7` → `--cream` `#F6F1E7`.

Hero (458–497): the `linear-gradient(135deg, #EAF3DE, #F1F8E4, #FAFAF7)` at 458 and both `#8ECB3C` CTAs at 487 and 497 go, replaced by the deep panel — see the companion file. Hero CTA is `--cream` fill, not `--deep`.

Getting-started checklist (515–560): the lime circle, the `2px solid #8ECB3C` ring and the `#8ECB3C` avatar all move to `--deep`; the current row keeps a `--sage-tint` background; the `#173404` action buttons become `--deep` pills at `--radius-pill`.

Everything inherits Band A's §2–§6 — tokens, type, buttons, inputs, focus rings. Nothing new is introduced except the two tints named below.

### Pipeline stage ladder — lines 343–347

This is a colour **system**, not a page style: it also drives the Pipeline page. Currently a lime tonal progression with coral for Declined. Rebuilt from the brand palette, keeping the property that matters — it darkens monotonically toward Won, so it still reads as advancement in greyscale rather than relying on hue:

| Stage | Background | Text | Ratio |
|---|---|---|---|
| Identified | `#F1EDE3` | `--ink-muted` `#5F5E5A` | 5.55:1 |
| Applying | `--sage-tint` `#E1EFE2` | `--deep` | 9.98:1 |
| Submitted | `--sage` `#9BCA9D` | `--deep` | 6.41:1 |
| Won | `--deep` `#1D3C3E` | `--cream` | 10.55:1 |
| Declined | `--danger-tint` `#FBEFEA` | `--danger` `#B4472A` | 4.81:1 |

Two new tints, both already used in Band A's onboarding work: `--sage-tint #E1EFE2` and `--danger-tint #FBEFEA`. `#F1EDE3` is new — a warm neutral for the pre-action stage.

If you change the ladder here, check the Pipeline page consumes the same constant rather than a duplicate.

---

## What this pass does not cover

**The member view of the sidebar.** The mockup shows thirteen nav items because Paul is an admin. `MAIN_NAV` is four entries — Find Funding, Pipeline, Deadlines, Profile — plus Dashboard; everything below the divider is gated on `ADMIN_EMAIL`. **A real user sees five.** At that length the sidebar is mostly empty and the balance between nav, account footer and dead space is a different design problem, which has not been drawn yet. Build the shell, but expect a follow-up on the member layout, and don't tune spacing against the admin view.

**The dashboard below the fold.** The screenshots this was designed from show the hero and the top of the checklist. `dashboard/page.tsx` is 1,218 lines and there is more page underneath — including a lime CTA at 736 and a lime progress fill at 785 that both still need remapping. Not reviewed.

**Empty and edge states** — zero matches, incomplete profile, no pipeline items. The `profileComplete` branches at lines 513 and 555 already swap backgrounds, and both need checking against the new palette.

**Every other page in the app.** Deliberately.
