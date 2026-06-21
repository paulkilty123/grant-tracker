# Grant Tracker — GA Readiness Checklist

**Target GA:** 30 June 2026 (per delivery plan v2)
**Last updated:** 2026-06-21
**Maintained by:** Claude (update in place as items move)

## GA scope (decided 2026-06-21)
- **Free tier opens to the public** at GA (matching + saved grants).
- **Apply (pipeline + builder) stays cohort-allowlisted** and is **NOT** offered to public signups.
- **Paid tier + Stripe come later** — ~2–4 weeks post-GA, after the cohort has tested the builder properly. See the new **"Before Apply goes paid"** section.

> Because Apply stays allowlist-only at GA, **the allowlist IS the access-control for the paid features.** It must hold server-side against a user manipulating a request or hitting the API/DB directly — not just be hidden in the UI. That verification is now the load-bearing GA security item (§2).

## Status legend
- ✅ **Shipped** — deployed to production (`origin/main` → Vercel) or otherwise live & verified
- 🟡 **In progress** — partially done, mitigated, or interim solution in place
- ⬜ **Not started**
- 🔎 **Needs Paul** — external / ops fact, not verifiable from the codebase; confirm and update

> **Honesty rule:** only ✅ items are confirmed live in production. Code on `origin/main` = deployed (Vercel auto-deploys main). Anything not code-verifiable is 🔎, not ✅.

---

## 1. Company & finance
External/legal — Paul's to drive. Legal *pages* exist in the app; legal *review* and corporate setup need confirmation.

| Item | Status | Evidence / notes |
|---|---|---|
| Ltd company registered | 🔎 Needs Paul | Not in codebase. Confirm Companies House registration + company number. |
| Business bank account | 🔎 Needs Paul | Needed for Stripe payouts — but **not GA-blocking** (paid tier is post-GA). |
| ICO registration (data protection fee) | 🔎 Needs Paul | Required — app stores org + user personal data. Privacy page exists; ICO registration is a separate external step. |
| Insurance (PI / cyber) | 🔎 Needs Paul | Confirm cover appropriate for a free public SaaS handling user data. |
| Privacy policy page | ✅ Shipped | `src/app/privacy/page.tsx` live. Content/legal accuracy → 🔎 Paul sign-off. |
| Terms of service page | ✅ Shipped | `src/app/terms/page.tsx` live. Confirm terms are correct for a free public tier. |
| MCP terms page | ✅ Shipped | `src/app/mcp/terms/page.tsx` live. |

---

## 2. Security hardening

| Item | Status | Evidence / notes |
|---|---|---|
| **Apply-tier access enforced server-side (LOAD-BEARING)** | 🟡 Partial — **GA BLOCKER** | Builder = solid; pipeline/projects/applications = **not enforced**. Full finding + fix below (§2a). |
| Server-side rate limits (MCP) | ✅ Shipped | `src/lib/mcp-rate-limit.ts` — 3 sliding-window limiters (key 100/h, key 1000/d, IP 5000/h), per-request enforcement, fails loud on non-authenticated traffic. Upstash Redis. |
| Non-MCP API route rate limiting | ⬜ Not started | App/admin API routes rely on auth, not rate limits. Lower risk (authenticated + admin-gated); flag if any unauthenticated route is added. |
| Upstash token rotation | 🔎 Needs Paul — **GA BLOCKER** | `UPSTASH_REDIS_REST_TOKEN` was briefly visible in a setup screenshot (2026-05-13). Rotate before public launch + confirm prod env vars set (rate limiting silently disables if missing). |
| MCP counter race | 🟡 Mitigated — **re-smoke-test for GA** | Non-monotonic hourly counter = sliding-window estimator's inherent ±1 variance. Handled: `remaining_hour` clamped ≥0, `reset_at_hour` exposed for precise pacing, documented `mcp-rate-limit.ts:84-88`. Re-run the 6-call smoke test before GA to confirm no drift beyond ±1. |

### 2a. Apply-tier access enforcement — detailed finding (verified 2026-06-21)

**What was verified:** every code path that reaches builder + pipeline + the linked tables, and what happens when a non-allowlisted authenticated user calls them directly (not via the UI).

**Allowlist mechanism:** `src/lib/builder/access.ts` → `getBuilderUser()` reads the Supabase session server-side and checks the email against `BUILDER_ALLOWLIST` (21 emails). Returns the user only if allowlisted, else `null`.

| Surface | How access is enforced | Direct (non-UI) call by a non-allowlisted user |
|---|---|---|
| **Builder compute** — all 12 `api/builder/*` routes (generate, draft, export, review, eligibility, import, parse, return, guidelines, bank, applications) | ✅ **Server-side**: each calls `getBuilderUser()` → **403 "cohort-only"** if not allowlisted | **Blocked (403).** Solid. |
| **Pipeline data** (`pipeline_items`) | ❌ **No allowlist anywhere.** No API route — `src/lib/pipeline.ts` reads/writes via the **browser** Supabase client. The pipeline page loads `getPipelineItems()` *unconditionally* (`pipeline/page.tsx:523`); the access check (`:526`) only toggles a builder sub-feature. Protected solely by **RLS = org-ownership** (`org_id IN (orgs WHERE owner_id = auth.uid())`). | **Allowed.** Any authenticated user can read/write their own org's pipeline rows directly via Supabase. |
| **Projects / Applications data** (`projects`, `applications`) | ⚠️ **UI-only gate.** Pages fetch `/api/builder/access` and hide the feature, but data is read/written via the **browser** Supabase client; RLS = org-ownership only. | **Allowed.** UI blocks casual users; a determined user bypasses the UI and hits the table directly. |

**Verdict:** The allowlist holds for the expensive **builder compute** (AI generation, export, etc.) but **does NOT hold for the pipeline/projects/applications data layer.** RLS still isolates orgs (no cross-org data leak), so this is an **entitlement bypass** (a free-tier user using paid features for their *own* org), not a data breach. Under the GA model where "the allowlist is the security model for paid features," this fails the requirement.

**Fix (GA-blocking) — build spec for the dedicated session:**

> ⚠️ **Run this in a single, fresh, dedicated session** (Paul will `/clear` first for clean context on the schema change). **No parallel work touching `pipeline_items`, `projects`, or `applications` while the migration runs.**

1. **Entitlement as a DB fact.** Add `apply_access boolean not null default false` on `organisations`. Seed `true` for the orgs owned by the 21 emails in `BUILDER_ALLOWLIST` (`src/lib/builder/access.ts`) — map email → `organisations.owner_id` via `auth.users`. Keep `access.ts` in sync, or have it read this column.
2. **Enforce in RLS.** Rewrite the `USING` (SELECT/UPDATE/DELETE) and `WITH CHECK` (INSERT/UPDATE) policies on `pipeline_items`, `projects`, `applications` so they require **both** org-ownership **and** `apply_access = true` on the owning org. (Today they check org-ownership only.)
3. **Defence-in-depth / UX.** Redirect non-allowlisted users away from the pipeline/projects/applications pages, and gate the pipeline Kanban load (`pipeline/page.tsx:523`) behind the access check (today it loads unconditionally).

**Acceptance test (must pass before it's called done — verify LIVE on real accounts, both directions):**
- ✅ A **cohort (allowlisted)** user can still read AND write their own pipeline / projects / applications.
- ✅ A **non-allowlisted** user is **blocked at the database level** (RLS denies the direct Supabase call), not merely hidden in the UI.
- Test by hitting the Supabase data path directly (not just the UI) for both a seeded and a non-seeded account.

**Carry-forward bonus:** this `apply_access` entitlement is the **foundation of the post-GA Stripe paid gate** — build it to carry forward (post-GA work = connect `apply_access` to Stripe subscription state + trial-expiry, not rebuild). It replaces the hardcoded TS allowlist that `access.ts` already anticipates retiring.

---

## 3. Catalogue trust

| Item | Status | Evidence / notes |
|---|---|---|
| Numeric-grounding guard (deployed) | ✅ Shipped | `enrich-grant/route.ts` — `detectUngroundedAmounts()` flags £-figures in `typical_award` not grounded in source. Advisory only. Commits `299b55fa` + `b4fb1cf6`. |
| Numeric guard — **live-verified** | ✅ Done (2026-06-21) | Verified on Paul's Greggs re-enrich: guard fired correctly on `Community Action Fund` (`_ungrounded_amounts:[60000]`) — £60k is a derived 3-yr total (£20k/yr × 3) not verbatim in the stored description. Web-confirmed £60k is the correct max. Guard behaved as designed: surfaced a non-verbatim figure for review, **no auto-rewrite**. Conservative + working. |
| Retroactive sweep (run) | ✅ Done | `scripts/sweep-ungrounded-amounts.mjs` over 497 briefs: **0 fabrications in live set**, 13 cosmetic, 1 real error (Fredericks — now fixed). Script uncommitted — optional to commit as a reusable launch tool. |
| Mis-attribution fix | ✅ Shipped | Prompt disambiguation (`b4fb1cf6`): `typical_award` = per-grant size, not income band / total fund / other product. NB: Fredericks showed mis-attribution can also hit the `amount_max` *parse* path (`fill-amounts`), not just `typical_award` — analogous "don't grab a delivered/other-product ceiling" guard is a possible future enhancement (not GA-blocking). |
| Fredericks Foundation data error | ✅ Fixed (2026-06-21) | `011655cc` `amount_max` £1.5m → **£50k** (revenue-share product max, web-confirmed). £1.5m was the *Community Builders Fund* (£100k–£1.5m) that Fredericks only *delivers*. `manual`/`external_id=null` + admin-pinned `field_provenance.amount_max` → won't revert on crawl. |
| Greggs duplicate | ✅ Archived (2026-06-21) | Two rows = **same fund**. Funder site confirms there is **no** separate Local Community Projects Fund — only the Community Action Fund. **Archived `08fcdf0b`** ("Local Community Projects", `is_active=false`/`pipeline_state=archived`, provenance `admin:dedup_2026-06-21`); **kept `cfb56fe7`** "Community Action Fund" (£20k–£60k, correct name/URL/eligibility/amount). |
| Duplicate rows as a class | ✅ Assessed — not systemic | Seed+scraper heuristic flagged 27 funders, but the overwhelming majority are legitimately multi-programme (NLCF = 24 distinct programmes, Foundation Scotland = 14 community funds, etc.). True same-fund duplication is a **small set**: Greggs (confirmed), plus generic catch-all seed rows that overlap specific programmes (Ufi VocTech, Esmée Fairbairn, Social Investment Business). Dedup discipline is largely holding. Worth a short cleanup pass, not a systemic fix. |
| Other data errors surfaced (non-blocking) | ⬜ Queue | NLHF "Heritage Grants £250k–£10m" row has `amount_min=10, amount_max=250000` (both wrong — scraper mis-parse; `source=heritage_fund`/`external_id` set → fix in scraper or it reverts). Jack Petchey "Places & Spaces Fund" `amount_max=£2,000,000` looks too high — verify. |
| Launch-claims SQL pass | 🟡 In progress — **GA BLOCKER** | Amounts honesty pass done (sweep). Coverage verified ad-hoc 2026-06-21 (gap-audit/programme additions still in `tagged` queue, **not live** — no "we added X funders" claim shippable yet). Full coverage-claim SQL pass required before any public launch comms. |

---

## 4. Product / signup

| Item | Status | Evidence / notes |
|---|---|---|
| Open (public) free-tier signup | ⬜ Not started — **GA action** | `src/app/auth/signup/page.tsx` redirects to `/apply` (invite-only); `/apply` states paid signups open June 2026. Flip to real signup for the **free tier** at GA. Gate Apply features server-side first (§2a). |
| Email verification | ✅ Shipped | Supabase confirm-email flow wired: `auth/callback/route.ts` + login error handling for `Email not confirmed` / `otp_expired` / `confirmation_failed` (`auth/login/page.tsx`). |
| Builder/pipeline gated from free-tier users | 🟡 Partial | See §2a — builder compute gated; pipeline/projects/applications data not. GA-blocking. |
| Free vs Apply nav/UX for public users | ⬜ Not started | Confirm a public free-tier user sees a coherent app (matching + saved) without dead-ends into gated Apply features. |

---

## 5. Before Apply goes paid (post-GA, target ~2–4 weeks after GA)
Moved off the GA-blocker list per the 2026-06-21 scope decision. Cohort tests the builder free for 2–4 weeks; then:

| Item | Status | Notes |
|---|---|---|
| Stripe / payment wiring | ⬜ Not started | No payment code in repo. Needs business bank account (§1). |
| Entitlement → payment/trial logic | ⬜ Not started | Builds on the GA entitlement (§2a step 1–2): connect `apply_access` to Stripe subscription state + any trial-expiry rules. Trial-abuse mitigations (per earlier `docs/strategy/trial-value-integrity.md`) live here. |
| Pricing / checkout UX | ⬜ Not started | £65/6mo, £115/yr per CLAUDE.md. |

---

## 6. Known bugs

| Item | Status | Evidence / notes |
|---|---|---|
| London-grants location follow-up | ✅ Shipped | Geo-scope filter was hiding UK-wide funding for region-scoped profiles. Fixed: `a0e9db25`, `f4eaffcf`, `1bdaec30` (all 2026-06-20), on `origin/main`. |
| location_tag hygiene backlog (residual) | 🟡 Post-launch | 6 data-quality items from the 2026-06-02 region audit. Degrade matching at the margins, not silent invisibility — non-blocking for GA. |

---

## GA-blocking summary (must be ✅ before opening free-tier signup)
1. 🟡 **Apply-tier access enforced server-side** for pipeline/projects/applications (§2a) — *the load-bearing item; currently not enforced.*
2. 🔎 Upstash token rotated + prod env vars confirmed.
3. 🟡 Launch-claims coverage SQL pass before any public comms.
4. 🟡 MCP counter-race re-smoke-test.
5. 🔎 Ltd + ICO + insurance confirmed (bank only needed for post-GA paid).
6. ⬜ Open free-tier signup flipped on + coherent free-tier UX.

**Cleared this session (2026-06-21):** ✅ numeric guard live-verified (Greggs) · ✅ Fredericks data error fixed (£1.5m→£50k) · ✅ Greggs duplicate `08fcdf0b` archived.
**Queued non-blocking:** NLHF "Heritage Grants £250k–£10m" amount mis-parse (scraper fix) · Jack Petchey "Places & Spaces" £2m to verify.
**Off the GA list (post-GA, ~2–4 wks):** Stripe/payment, entitlement→payment/trial logic, pricing UX.
**▶ Next session:** build the Apply-tier RLS entitlement fix (§2a) — fresh & dedicated, no parallel writes to those 3 tables.
