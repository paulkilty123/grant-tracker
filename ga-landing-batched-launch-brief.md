# Grant Tracker — GA landing page & batched launch (build brief)

Prepared 19 June 2026. For the code session. Ship the new public landing page as a separate, switchable page, opened to partner audiences in batches (free tier only) before full public launch.

---

## Decisions (resolved)

- Build the new page as a **separate route**; the current cohort landing page stays live until switched.
- **Switch via a feature flag** (instant flip and rollback, not a redeploy).
- **Access model: partner invite links (auto-grant) + a public waitlist** released in batches.
- **Early batches unlock the Free tier only.** The application builder (Apply) stays behind the existing cohort allowlist.
- **Pricing shows the full ladder**, but only Free is actionable now: Free (live), Apply (~£30/mo, after cohort testing), Companion (coming).

---

## 1. Routing & switch

- New page at **`/launch`**, set `noindex, nofollow` until full public launch.
- Current cohort landing stays at **`/`**.
- A single feature flag, e.g. `LANDING_PUBLIC` (Vercel env var or a Supabase config row): off = `/` serves the cohort page; on = `/` serves the new page. Instant flip, rollback by toggling.
- During the batched phase, partner links and accepted waitlist users go straight to `/launch`; `/` stays the cohort page until full public.

## 2. Access model

- **Partner invite links:** `/join/[partner]` (e.g. `/join/seuk`, `/join/impact-hub`). Visiting sets a source tag; signup from that link **auto-grants free-tier access** (skips the waitlist).
- **Public visitors:** the hero "Request free access" CTA adds them to a **waitlist** (email + `source=public`). Release access in batches by granting N waitlisted users at a time.
- Store **`acquisition_source`** on the org/user record (partner slug / `waitlist` / `cohort`). This feeds the capture-layer channel attribution the strategy calls for, so partner conversion is measurable from day one.
- **Free tier only** for these users: search, matching, eligibility filtering, save. The builder stays on the existing cohort allowlist.

## 3. Prerequisites before the first batch (non-negotiable)

Invited members are still strangers on inference cost, so the June-plan hardening must land before batch 1, not just before full public:

- Server-side rate limits on all inference surfaces (live-search weekly limit is client-side only today; builder per-build cost needs server-side bounding).
- Rotate the Upstash token.
- Fix the MCP rate-limit counter race.
- Open self-serve free-signup flow live, with professionalised email verification.

## 4. Page content (use v2 copy, with the agreed fixes)

**Honesty pass (your launch rule) — apply in v2 AND the existing stats strip:**

- SQL-verify "600+" before publish; use the verified floor; ensure "live" excludes `is_rolling` over-flagged rows. The number appears in the hero, the free section, the free card, and the existing stats strip — fix all of them together.
- Soften "every opportunity checked against its original source" to a demonstrable claim (surface a last-verified date) or ensure it is literally true for every row.

**Copy refinements (agreed):**

- Reconsider the hero superlative "The UK's most honest funding intelligence." Lead on the outcome ("Find the funding you can actually win"), with verification as the proof beneath. The load-reduction line is already live on the page ("spend less time searching, not less time thinking") and supports this.
- Replace "~£30/mo" with a firm number or "from £30/mo".
- Align "what's coming" tenses: the application workspace and the builder are both "in cohort testing now" (not one "coming", one "testing").
- Nav: add a **Pricing** item.
- "How it works" step 4 currently implies the builder is part of the free flow; align it with the free / Apply split so the builder isn't promised for free.
- Deadline-reminders block and the reminder email: publish only once the alert crons are re-enabled with a working unsubscribe (existing 15 May task).

**Reuse as-is (already strong, keep as shared components so the two pages don't drift):**

- Founder story ("Built from the inside"), values ("How we work"), who-it's-for (CIC-first, "Funding matched to your structure"), the AI-honesty section (promote it near the builder block).

**Reconcile the cohort-era sections (the main gap in v2):**

- The live page has two recruitment-heavy blocks ("Building this with a small group… hand-picking 20–30… free for six months" and "Help us build something better… free for six months") plus a cohort-only hero CTA. At GA these conflict with "sign up free + paid ladder."
- Demote the cohort to a **secondary** CTA; reframe these blocks as community/social-proof or slim to a line, and remove the "free for six months" framing from the public page.
- **Clean up the two meanings of "free":** finding funding is free forever for everyone; the founding cohort got early access to the paid tiers. One clear message, no overlap.
- Stats strip: change "Free — during beta, founding cohort access" to something true at GA (e.g. "Free — finding funding, always").

## 5. Rollout sequence

1. Build `/launch` + the `LANDING_PUBLIC` flag + `/join/[partner]` links + waitlist + `acquisition_source` attribution.
2. Complete the section-3 hardening.
3. **Batch 1 — SEUK:** publish `/join/seuk`. Monitor signups, per-org inference cost, and the funnel daily.
4. **Batch 2+ — Impact Hub, community foundations, etc.:** issue each partner link; release public waitlist in batches as cost/capacity allow.
5. **Full public:** flip `LANDING_PUBLIC` so `/` serves the new page. Keep partner links live for ongoing attribution.

---

## Open item still to settle

Apply-at-GA: this brief keeps the builder cohort-only and Apply non-purchasable at launch (matches the v2 copy and the safest cost posture). Note this contradicts the June plan's "Apply is first purchasable at GA with a 14-day trial as the conversion machine," so the plan's month-1 revenue framing should move with it. Revisit when the builder is hardened and the trial mechanism is live.
