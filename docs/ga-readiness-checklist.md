# Grant Tracker — GA Readiness Checklist

**Target GA:** 30 June 2026 (per delivery plan v2)
**Last updated:** 2026-06-24
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
| **Apply-tier access enforced server-side (LOAD-BEARING)** | ✅ Shipped (2026-06-22) | `apply_access` entitlement on `organisations` + RLS on pipeline_items/projects/applications/org_core_content (migration 030). DB-verified both directions. Full record in §2a. |
| Server-side rate limits (MCP) | ✅ Shipped | `src/lib/mcp-rate-limit.ts` — 3 sliding-window limiters (key 100/h, key 1000/d, IP 5000/h), per-request enforcement, fails loud on non-authenticated traffic. Upstash Redis. |
| **AI inference surface (`ai-search`) — auth + rate limit (was a hidden GA BLOCKER)** | ✅ Shipped (2026-06-22) | **Finding:** `api/ai-search/route.ts` — the free-tier Haiku ranking call — was **unauthenticated AND unmetered** (verified live: anon POST returned `200 []`). It had been mis-filed below as "lower risk, authenticated + admin-gated"; it was neither, and goes public the moment free-tier signup opens. **Fix (`06383eb`):** server-side auth gate (any signed-in user, NOT the Apply allowlist → else 401) + per-user Upstash sliding-window limit (**30/h, 150/day**), reusing the MCP limiter mechanism in `mcp-rate-limit.ts` (not a second system). **Fails CLOSED** (limiter unreachable → 503; client falls back to keyword results, no AI spend) — deliberately opposite to the MCP limiter's fail-open, because this is an unbounded inference-cost surface. ⚠️ Consequence: `ai-search` now needs `UPSTASH_*` set in prod or AI ranking returns 503 (overlaps the Upstash item below). |
| Other public inference routes (`autofill-grant`, `org-autocomplete`) — auth + rate limit | ✅ Shipped (2026-06-22) | Same class as `ai-search`: both fetched a URL + called Haiku with **no auth and no metering** (verified live: anon POST → `200` with extraction). Fix (`e86e7c7`): per-user auth gate + Upstash limit (**20/h, 60/day** each, fail-closed) via the generalised `enforceInferenceRateLimit` helper (one mechanism, one bucket per surface). `org-autocomplete` onboarding was diagnosed as **post-login** (not a middleware-public path) so a per-user gate is safe — no IP fallback needed. Verified live: anon → 401. |
| Other non-MCP API routes (admin / builder) | 🟡 Auth/allowlist-gated, no rate limit | `api/admin/*` + `api/builder/*` are auth- + allowlist-gated (low risk; no anonymous inference). No general per-route limiting planned for GA. **Rule:** flag + gate before merge if any *new* unauthenticated or AI-inference route is added. |
| SSRF note on the auto-fill routes (non-blocking) | ⬜ Flagged | `autofill-grant` + `org-autocomplete` fetch a **user-supplied URL server-side** — now auth+rate-limited, but still a server-side request to an arbitrary host (could be pointed at internal/metadata addresses). Out of scope for this pass; consider a host/scheme allowlist or block of private IP ranges post-GA. |
| Upstash token rotation | ✅ Done (2026-06-22) | Rotated by Paul (`UPSTASH_REDIS_REST_TOKEN` was briefly visible in a 2026-05-13 setup screenshot). **Connectivity verified live:** MCP `health_check` returned real decremented counters (`remaining_hour:94, remaining_day:973`), not the static `100/1000` fallback a missing/unreachable token produces → the limiter reaches Redis with the active token in prod. Same token/Redis as the inference routes (ai-search/autofill/org-autocomplete), so all fail-closed surfaces are confirmed wired. **Residual (Paul):** confirm the OLD leaked token is deleted/revoked in Upstash — that's the security goal of the rotation and isn't verifiable from here. |
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

**Fix — SHIPPED 2026-06-22 (migration `030_apply_access_entitlement.sql`):**

1. ✅ **Entitlement as a DB fact.** `apply_access boolean not null default false` on `organisations`, seeded `true` from `BUILDER_ALLOWLIST` via `auth.users` join. All 20 current orgs are allowlist-owned → all seeded `true` (zero impact on the live cohort); new (public) signups default `false`. `access.ts` now reads the column (`getBuilderUser()` = allowlist OR `apply_access=true` org) — the list is retained as seed + fallback for internal logins without an org.
2. ✅ **Enforced in RLS.** All 16 policies on `pipeline_items`, `projects`, `applications`, **and `org_core_content`** (the builder content bank — same bypass class) now require org-ownership **AND** `apply_access = true` (USING + WITH CHECK, incl. explicit WITH CHECK on UPDATE).
3. ✅ **Self-escalation closed (not in original spec).** `organisations` is user-writable, so a free-tier owner could have set `apply_access=true` on their own org via a hand-crafted INSERT/UPDATE. Trigger `trg_enforce_apply_access_immutable` (SECURITY INVOKER, `current_user`-checked) blocks any non-`service_role`/`postgres`/`supabase_admin` change to the column on both INSERT and UPDATE.
4. ✅ **Defence-in-depth / UX.** Pipeline page now checks access BEFORE loading the Kanban and shows a cohort-only message otherwise; the Pipeline nav link is hidden from non-entitled users (Projects/Applications already were). Projects/Applications pages already gated.

**Acceptance test — PASSED (DB-level role simulation, both directions, 2026-06-22):**
- ✅ Entitled owner (apply_access=true) can read (4 rows) AND insert their own pipeline.
- ✅ Same owner with apply_access=false (rolled-back tx) → **0 rows on read, RLS `42501` on insert** — blocked at the DB, not just the UI.
- ✅ Authenticated owner attempting to set `apply_access` (UPDATE or new-org INSERT) → trigger raises `42501`.
- ✅ Regression: normal profile updates + new-org creation (defaults false) still succeed; no test data leaked; all 20 orgs remain entitled.

**Residual (NOT GA-blocking, folds into §4 "coherent free-tier UX"):** the Deadlines and Search pages still expose pipeline-write affordances ("+ Pipeline", "set a date → create pipeline item") to all authenticated users. For a future free-tier user these now fail with an RLS error rather than being hidden. No current user is affected (all are entitled) and open signup isn't live yet, so this is a UX-coherence task to do alongside the §4 free-tier nav/UX pass, not a security gap (RLS denies the write either way).

**Carry-forward:** `apply_access` is the **foundation of the post-GA Stripe paid gate** — post-GA work = wire subscription state + trial-expiry to this column (set via `service_role`/admin SQL; the trigger already blocks user self-service), **not** a rebuild. Admin can flip entitlement today with `update organisations set apply_access = … where …` run as `service_role`/`postgres`.

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
| Other data errors surfaced | 🟡 Partly cleared | ✅ **NLHF "Heritage Grants £250k–£10m" FIXED (2026-06-22).** Root cause: `parseAmountRange` matched only `/£[\d,]+/`, so "£250,000 to £10million" parsed as `min=10, max=250000` — a major funder shown orders of magnitude wrong. Parser now magnitude-aware (million/mn/m/thousand/k) + order-robust (`06383eb`); live row `4b989eab` corrected to £250k–£10m via SQL (scraper now emits the same → no revert). The parser fix also self-corrects other "£Nmillion"-style rows on next crawl. ⬜ Still queued: Jack Petchey "Places & Spaces Fund" `amount_max=£2,000,000` — verify. |
| Creative Scotland "amount fix" — does not exist (conflation) | ✅ Clarified | There was **no Creative Scotland amount mis-parse.** CS's issue was junk/nav-page rows, already deactivated (`6869d90`, `2494968`); the DB confirms those rows are archived and the live row ("Open Fund", £1k–£150k) is correct. Recorded so it isn't chased as an open amount item. |
| Launch-claims SQL pass | 🟡 In progress — **GA BLOCKER** | Amounts honesty pass done (sweep). Coverage verified ad-hoc 2026-06-21 (gap-audit/programme additions still in `tagged` queue, **not live** — no "we added X funders" claim shippable yet). Full coverage-claim SQL pass required before any public launch comms. |

---

## 4. Product / signup

| Item | Status | Evidence / notes |
|---|---|---|
| Open (public) free-tier signup | ⬜ Not started — **GA action** | `src/app/auth/signup/page.tsx` redirects to `/apply` (invite-only); `/apply` states paid signups open June 2026. Flip to real signup for the **free tier** at GA. Gate Apply features server-side first (§2a). |
| Email verification | ✅ Shipped | Supabase confirm-email flow wired: `auth/callback/route.ts` + login error handling for `Email not confirmed` / `otp_expired` / `confirmation_failed` (`auth/login/page.tsx`). |
| Builder/pipeline gated from free-tier users | 🟡 Partial | See §2a — builder compute gated; pipeline/projects/applications data not. GA-blocking. |
| Free vs Apply nav/UX for public users | ⬜ Not started | Confirm a public free-tier user sees a coherent app (matching + saved) without dead-ends into gated Apply features. |
| **Deadline / saved-grant reminder emails — enable + unsubscribe** | ⬜ Not started (Paul to dive into) | Cron `/api/cron/deadline-reminders` is **fully coded** (pipeline deadlines + David's saved-grant reminders + a "due today" tier, `1a17179`) but **NOT listed in `vercel.json` → it never fires; zero reminder emails send today.** **To enable:** add `{ "path": "/api/cron/deadline-reminders", "schedule": "30 7 * * *" }` to `vercel.json` + confirm env (`CRON_SECRET`, `RESEND_API_KEY` ✅already set, `ALERT_FROM_EMAIL`). **Verify firing:** Vercel → Cron Jobs tab (last run/status), or `curl -H "Authorization: Bearer $CRON_SECRET" https://www.granttracker.co.uk/api/cron/deadline-reminders` (use **www** — apex strips the bearer). **Blocker before enabling for cohort:** no one-click **unsubscribe** in the email (only in-app Clear / footer "Manage settings" → /dashboard/profile). Reminders are opt-in per action (pipeline-add / set-reminder), so more transactional than the auto-subscribed digests. **Decision pending:** (A) enable now + fast-follow a tokenised unsubscribe, or (B) build unsubscribe first then enable. |

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
| Cohort feedback items (Jack, 2026-06-20) — **already shipped, not pending** | ✅ Shipped | Recorded straight because these were loosely carried as "pending": pipeline star/favourite + "Starred only" filter (`50a485a`, `9c2c029`); add-fund discoverability / "Add a fund not listed" relabel (`d464b74`, `931f812`, `e2c1f57`); Rank dead-URL fix (`d464b74`). All on `origin/main`. Remaining Jack items (Scotland coverage depth) stay post-GA. |
| location_tag hygiene backlog (residual) | 🟡 Post-launch | 6 data-quality items from the 2026-06-02 region audit. Degrade matching at the margins, not silent invisibility — non-blocking for GA. |

---

## GA-blocking summary (must be ✅ before opening free-tier signup)
1. ✅ **Apply-tier access enforced server-side** for pipeline/projects/applications/org_core_content (§2a) — *the load-bearing item; shipped + DB-verified 2026-06-22 (migration 030).*
2. ✅ **AI inference surface (`ai-search`) auth-gated + rate-limited** (§2) — *found mis-classified during this review (was unauth + unmetered); fixed `06383eb`, auth gate verified live.*
3. ✅ Upstash token rotated (Paul) + prod connectivity verified live (MCP limiter counters `94/973`, not the static fallback) — env vars set & reachable for all fail-closed inference routes. Residual: Paul to confirm the old leaked token is revoked in Upstash.
4. 🟡 Launch-claims coverage SQL pass before any public comms.
5. 🟡 MCP counter-race re-smoke-test.
6. 🔎 Ltd + ICO + insurance confirmed (bank only needed for post-GA paid).
7. ⬜ Open free-tier signup flipped on + coherent free-tier UX.

**Cleared 2026-06-21:** ✅ numeric guard live-verified (Greggs) · ✅ Fredericks data error fixed (£1.5m→£50k) · ✅ Greggs duplicate `08fcdf0b` archived.
**Cleared 2026-06-22:** ✅ Apply-tier RLS entitlement fix (§2a) shipped + DB-verified (migration 030) — the #1 load-bearing GA blocker · ✅ `ai-search` auth + rate-limit (§2, `06383eb`) — the inference-surface gap surfaced this review · ✅ `autofill-grant` + `org-autocomplete` auth + rate-limit (§2, `e86e7c7`) — same inference-surface class, anon → 401 verified live · ✅ NLHF "Heritage Grants £250k–£10m" amount fixed at source (`06383eb`) + live row corrected · ✅ Upstash token rotated (Paul) + prod connectivity verified live (MCP counters `94/973`).
**Queued non-blocking:** Jack Petchey "Places & Spaces" £2m to verify · §4 free-tier UX must hide pipeline-write affordances on Deadlines/Search (see §2a residual) · SSRF hardening on the two auto-fill URL-fetch routes — host/scheme allowlist (see §2) · **enable deadline/saved reminder-email cron (not in `vercel.json`) + build email unsubscribe before cohort sends (§4)**.
**Off the GA list (post-GA, ~2–4 wks):** Stripe/payment (wire to `apply_access`), entitlement→payment/trial logic, pricing UX · Scotland coverage depth · location_tag hygiene backlog.
**▶ Next GA blockers:** launch-claims coverage SQL pass · MCP counter-race re-smoke-test · open free-tier signup + coherent free-tier UX (§4) · (🔎 Paul, external) ICO + insurance + Ltd; confirm old Upstash token revoked.
