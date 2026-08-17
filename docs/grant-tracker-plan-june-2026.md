# Grant Tracker — Delivery Plan & Goals (v2)

**Prepared:** 12 June 2026 (v2 same day, after codebase review) · **GA date:** 30 June 2026 · **Review cadence:** monthly re-plan of next 30 days

> **Status refresh — 16 June 2026.** Markers added against the original plan to reflect what's been completed since 12 June. Legend: ✅ done · 🟡 partial · ⏳ open.
>
> **Done since the plan was written:**
> - ✅ **Umami analytics setup finished** (16 Jun) — Plausible removed; self-hosted Umami on Vercel, backed by a dedicated Supabase project, served first-party via a Next.js rewrite (adblock-proof); all 5 custom events verified landing; both analytics + main DBs RLS-secured.
> - ✅ **MCP directory submission submitted** — awaiting Anthropic review.
> - ✅ **MCP query log built & live** (`mcp_query_log`) — already caught silent-exclusion bugs (sector `arts`→`creative`, region label vs token).
> - 🟡 **Privacy/ToS** — privacy updated (OAuth-only, capture/consent). Ltd-entity + Stripe amendments still pending.
> - ✅ **Security hardening (extra):** RLS enabled across the Umami DB; closed a world-read/write exposure on `funder_watchlist` + `watchlist_alerts` in the main DB.
>
> **Still open from Week-1 security (pre-GA):** ⏳ rotate the Upstash token · ⏳ server-side rate limits on inference surfaces (verified open: `/api/deep-search` has no server-side limit **and no auth gate**; `/api/builder/generate` is allowlist-gated but has no per-build cap).
> **Re-verified resolved (not open):** ✅ MCP rate-limit counter race — `mcp-rate-limit.ts` uses atomic Upstash sliding-window limiters; the "race" was the documented ±1 `remaining_hour` estimator variance, not an enforcement bug.

---

## North star
Paying organisations. **30–40 by month six** (end December 2026), **£50k revenue** in year one. Every workstream below should be traceable to acquiring, converting, or retaining paying organisations — or keeping the company legally and financially sound while doing so.

**Deliberately parked:** Shoots, Frame, Social Impact Knowledge Wiki. No work before Q4 2026 review.

## Open decisions — settle in week 1
- **Builder gating at GA.** Cohort-allowlisted today. On 30 June: free-for-now, trial-gated, or paid-only? Signup copy depends on this.
- **Apply-first price anchor.** Strategy wanted Companion first (anchor ~£65–95) with Apply (£25–30) as "the apply-well tier." GA reality inverts that (Apply is first purchasable). Decide deliberately; show the full ladder on pricing so Apply doesn't become "Grant Tracker's price."
- **Month-1 revenue criterion.** Cohort is free six months, so month-one payers must be strangers converting within ~2 weeks of GA. Exit criterion softened to "first trial-to-paid conversions in motion"; any actual payer is upside.

## Workstreams
- **Product** — goal agent, builder gating, tier gating + trial, signup, alerts UX
- **Catalogue** — launch-claims honesty, coverage gaps, accuracy, contracts/procurement
- **MCP channel** — directory submission + approval readiness, query log, cold-start watch
- **Commercial** — Stripe, 14-day trial mechanism, tier ladder, conversion funnel
- **Marketing & partnerships** — cohort fill, launch push, SEUK, Anthropic, sector press, LinkedIn
- **Customers** — cohort engagement, support, onboarding, case studies
- **Company & finance** — Ltd registration, bank account, insurance, forecast, legal amendments

---

## Month 1 (detailed): 15 June – 12 July 2026

### Week 1 — w/c 15 June: Pre-launch hardening

**Goal agent** (sequenced per the agent handover: data floor + evals before reasoning core)
- ⏳ Mon–Tue: write the spec and seed the golden set from MCP captures; confirm the data floor. The reasoning eval harness doesn't exist yet (only the matcher regression suite) — building the brain before the evals inverts the commissioned order.
- ⏳ Tue onwards: use Fable (free until 22 June) for low-risk parallelisable scaffolding only — schemas, orchestration plumbing — in the background; check in daily, capture outputs before the window closes.
- Treat the Fable window as a bonus, not a dependency (tooling flaky this week). Fallback: Opus.

**Security & abuse hardening before open signup** (must complete before GA)
- ⏳ **Rotate the Upstash token** (visible in a 13 May screenshot; rotate before public launch — open signup is that moment).
- ⏳ **Server-side rate limiting** on inference surfaces. *Verified 16 Jun:* `/api/deep-search` has **no server-side limit and no auth gate** (weekly cap is client-side only) — any POST triggers a paid Anthropic web-search call. `/api/builder/generate` is auth-gated (cohort allowlist) with cost instrumentation but has **no per-build rate cap**. Open abuse/cost vector for strangers at GA.
- ✅ **MCP rate-limit counter race** — *re-verified 16 Jun: not open.* `mcp-rate-limit.ts` enforces via atomic Upstash sliding-window limiters; the 20 May "counter race" was the documented ±1 variance in the reported `remaining_hour` (sliding-window estimator), not an enforcement bug.

**Product / signup**
- ⏳ Application builder: add cohort emails to the allowlist (one-line change — builder is feature-complete and adversarially verified).
- ⏳ Decide builder gating at GA (open decision #1) and write signup copy accordingly.
- ⏳ Open self-serve signup: finalise flow, professionalise email verification.
- ✅ **Finish Umami setup** — scoped to marketing/page analytics only. *(Done 16 Jun.)* The capture layer (live since 9 June, with org attribution and token-level cost instrumentation) remains the product-funnel source of truth; don't double-build.

**Catalogue** (GA exposes known gaps publicly)
- ⏳ Launch-claims honesty pass: SQL-verify every coverage claim in launch copy.
- ⏳ Triage the worst publicly visible items: `is_rolling` over-flagging (~25–70 grants showing forever), regional programme zeroes (Wales/NI/Yorkshire, mental-health programmes), location-tag hygiene worst offenders.

**MCP channel**
- ✅ **Confirm the Anthropic submission channel and submit** — *submitted; awaiting review.*

**Company & finance** (critical path for revenue)
- ⏳ Register Grant Tracker Ltd at Companies House; apply for business bank account immediately after (Starling/Monzo/Tide quickest).
- ⏳ ICO data protection registration.
- 🟡 Amend privacy policy and ToS for the Ltd entity, Stripe payments, and open signup. *(Privacy updated 9 Jun + OAuth-only pass; Ltd/Stripe amendments still to do.)*
- ⏳ Professional indemnity insurance (pulled forward from month 3 — giving funding-related guidance to strangers from 30 June).

**Marketing**
- ⏳ Final cohort signup outreach push — close remaining cohort gaps this week.
- ⏳ Set up Grant Tracker LinkedIn company page; secure handles on X/Bluesky/Instagram.
- ⏳ Write the two launch outreach messages against the 47-target spreadsheet.
- ⏳ Ask Emma & Jen (Paper Birds) and Devi for permission to use named quotes.
- ⏳ Finish LinkedIn profile rewrite.

**Customers**
- ⏳ Cohort comms: launch-window expectations, app-builder feedback by a named date, and the permanence + export message (export shipped, so the promise is now true).

### Week 2 — w/c 22 June: Launch assembly

**Product**
- ⏳ Review and integrate goal-agent scaffolding from the Fable window; continue golden set / eval harness build.
- ⏳ Alert-management UX + unsubscribe link, then re-enable the 3 alert crons (free tier). Known blocker: crons disabled 15 May because onboarding auto-subscribes with no off-switch — the real task, bigger than flipping them on.
- ⏳ Triage and fix priority app-builder feedback from cohort.
- ⏳ Website copy and design final for free tier + application builder launch (reflecting gating + anchor decisions).
- ⏳ Smoke-test the full new-user journey: signup → verify → first query → alert subscribe/unsubscribe.

**Commercial**
- ⏳ Stripe account setup under the new Ltd.
- ⏳ Tier gating: Free vs purchasable tier entitlements for launch scope.
- ⏳ 14-day trial mechanism, even crude (freemium converts 2–5%, trials 17–50%; first-week time-to-value is the biggest predictor). The trial is the conversion machine.
- ⏳ Implement the Apply-anchor framing decided in week 1 (pricing page shows the full ladder).

**MCP channel**
- 🟡 Weekly `mcp_query_log` review for silent exclusions; fix top issues. *(Log built; ritual ongoing.)*
- ⏳ Cold-start watch: first-request-after-redeploy errors (directory traffic will surface these).

**Marketing**
- ⏳ Pitch one sector publication (Charity Digital / UK Fundraising / Civil Society) — Procurement Act hook as roadmap/commentary, not coverage (honesty rule).
- ⏳ SEUK meeting: ask about newsletter/webinar distribution and contracts-catalogue priorities.
- ⏳ Prepare 4–6 LinkedIn posts for launch fortnight (personal + company page).

### Week 3 — w/c 29 June: GA — 30 June
- ⏳ Launch day: open signup live, announcement post, first outreach wave (cohort + warm contacts ~14 targets).
- ⏳ Monitor signups, errors, capture-layer funnel, inference costs daily; fix breakages same-day.
- ⏳ Second outreach wave mid-week (channels/orgs ~33 targets), staggered for replies.
- ⏳ Daily LinkedIn presence through launch week.
- ⏳ Cohort thank-you + referral ask.

### Week 4 — w/c 6 July: Stabilise and convert
- ⏳ Support and bug-fix backlog from launch week — protect 50% of time.
- ⏳ Trial follow-up: personal contact with every active trial; offer onboarding calls.
- ⏳ Review week-one funnel (capture layer + Umami); record baseline: signups, activation, trial starts, MCP-originated users, per-org inference cost.
- ⏳ One-year financial forecast (revenue by tier × adoption curve, inference costs, runway).
- ⏳ Month 1 retro + detailed plan for month 2.

**Month 1 exit criteria:** open signup live, stable, abuse-hardened · builder live under chosen gating · 14-day trial working with first trial-to-paid conversions in motion (any month-one payer is upside) · goal agent golden set + eval harness in place with Fable scaffolding harvested · alerts re-enabled with working unsubscribe · launch claims SQL-verified · ✅ MCP directory submission confirmed in · Ltd registered, insured, bank account in progress · ✅ Umami (marketing) + capture layer (product) both reporting · cohort at full strength · all 47 outreach targets contacted.

---

## 3-month goals (by ~mid-September 2026)

**Commercial** — 10–15 paying organisations; trial→paid conversion measured and improving · full tier ladder (Free / Apply / Strategise / Scale) live and gated · email alerts live for paid tiers with preference management.

**Product** — Goal agent v1 shipped to ≥ cohort, validated against the eval harness; copy/design live · Project-first Phases 2–3 (Project entity → project matching, the Apply tier's differentiator, sized via fork telemetry) · onboarding email sequence + basic help/docs live · LinkedIn page posting consistently.

**Catalogue** — coverage measurably expanded (set +X sources, +Y opportunities) with the regional zeroes (Wales/NI/Yorkshire) closed · curation review-time per opportunity cut (e.g. halved) · contracts/procurement scoping complete, build started if SEUK signals demand.

**Partnerships & marketing** — SEUK formalised (newsletter/webinar/member offer) · Anthropic Claude for Nonprofits contact + fit assessed · 2 sector press/podcast pieces, 1–2 events · 2–3 named case studies published.

**Company** — Ltd fully operational (bank, Stripe under entity, accounting software) · decide VAT posture.

## 6-month goals (by end December 2026)
- 30–40 paying organisations + identifiable repeat usage by tier.
- Contracts & procurement live in the catalogue (Procurement Act / PPN 002 → coverage).
- MCP directory listing approved and converting; MCP-originated signups tracked as a distinct channel.
- Catalogue largely self-maintaining (curation = exception-handling).
- Churn understood: retention metric defined, first renewal/cancellation data in.
- ≥1 strategic partnership producing recurring referrals (SEUK, Impact Hub, or Anthropic).
- Decide first hire / contractor vs staying solo into 2027.
- Month-six strategic review: revisit Shoots and Frame — proceed, park, or kill.

## 12-month goals (by June 2027)
- £50k revenue run-rate or cumulative (pick the definition now).
- 80–100+ paying organisations if conversion economics hold; revise at month-six review.
- Grant Tracker recognised as a reference tool in UK social-impact funding — measured by inbound > outbound.
- Catalogue the most comprehensive UK source (grants, contracts, investment, in-kind) with a publishable, SQL-verifiable accuracy claim.
- Product ladder complete and validated (clear upgrade-path evidence).
- Sustainable solo (or solo-plus-contractor) operating rhythm.
- Informed decision on Shoots/Frame for year two, backed by Grant Tracker revenue.

---

## Key dependencies & risks
| Risk / dependency | Mitigation |
|---|---|
| Stripe blocked on entity + bank account | Register Ltd week 1; bank application same week; interim sole-trader Stripe only as a conscious fallback |
| Open signup = open abuse/cost exposure | Week-1 hardening non-negotiable: token rotation, server-side rate limits, MCP counter race fix; watch per-org inference cost from day one |
| Fable tooling flakiness | Use for parallelisable scaffolding only; Opus fallback; goal-agent critical path doesn't depend on it |
| MCP directory approval timing | Submitted; rolling launch so nothing anchors to approval day; keep query-log fixes flowing |
| Trial mechanism load-bearing for early revenue | Crude version in week 2 beats polished in month 2; instrument first-week time-to-value |
| Solo-founder capacity (support vs build) | Pre-commit 50% of week 4 to support; goal agent + project matching flex, signup stability + abuse hardening don't |
| Catalogue accuracy surfacing publicly | Launch-claims honesty pass before GA; weekly query-log ritual; triage by real query volume |
| Plan sprawl | Monthly retro; re-plan only next 30 days in detail; 6/12-month sections are direction, not commitments |

## Operating rhythm
- **Weekly (Friday, 30 min):** review week vs plan; funnel numbers (capture layer + Umami); `mcp_query_log` silent-exclusion check; cold-start error check; set next week's top 3.
- **Monthly (half day):** retro; false-negative archive audit; update this document; write next month's detailed plan.
- **Quarterly:** strategic review — pricing, partnerships, parked projects.
