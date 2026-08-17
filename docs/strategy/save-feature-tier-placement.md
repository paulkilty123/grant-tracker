# Save / bookmark / dismiss — tier placement decision

**Status:** decision note, 14 June 2026. Sharpens the `functional-boundary.html` free/paid line with current competitor evidence and a refined split. Reads with `trial-value-integrity.md` (same value-shape logic), `tier-customer-map.html` (Apply tier), and the matching-tier-ladder memory.

---

## Decision

**Save / bookmark / dismiss — and persistent visible reviewed-status — stay on the FREE tier.** The paid lever is the *vigilance and workflow* on top of saved grants, not the act of saving. This confirms the functional-boundary line ("unlimited bookmarks/saves" free; pipeline workflow paid) and refines where exactly the cut falls.

## The who-does-the-work split, applied to the full spectrum

Real user demand (Considered Capital WhatsApp group, 13-14 Jun 2026 — see evidence below) asks for three things on a spectrum. The line falls cleanly:

| Capability | Tier | Why |
|---|---|---|
| Save / bookmark a grant to a list | **Free** | User doing their own work |
| Dismiss / hide an unsuitable grant | **Free** | User's own judgment + click |
| Persistent, visible saved/dismissed **status** so you don't re-review the same grants | **Free** | Remembering what you've looked at is table stakes for a usable database, not "the assistant working for you". This is the "complete, not crippled" free experience. |
| Pipeline stages + application tracking + history | **Apply (paid)** | The system holding your workflow |
| Deadline **vigilance** on saved items ("closes in 5 days", "just reopened") | **Apply (paid)** | The assistant exercising vigilance on your behalf |
| Reasoned re-prioritisation of the saved list; project matching; the builder | **Apply (paid)** | Genuine "system works for you" |

Both sides are concrete and easy to understand (the attraction of paywalling save in the first place) — but only the paid side passes the who-does-the-work test.

## Why save stays free (the case against paywalling it)

1. **Competitive wedge.** Considered Capital is a **£225/year paid** grant database whose own subscribers are publicly begging for save/favourite/dismiss-and-remember, which it lacks. Grant Tracker's *free* tier having it is the sharpest funnel weapon available against a named incumbent, demand validated in their own group: *"the free tool does what you're paying £225/year for, and remembers what you've reviewed."* Paywalling it buries the wedge and adopts the database-paywall model the strategy explicitly rejects (matcher ~70% reproducible → discovery is acquisition gravity, not a revenue line).
2. **Save feeds Apply, doesn't cannibalise it.** Save and Apply are complements. Every grant a free user saves is raw material Apply acts on (track it, get reminded, build the application). More free savers = more users holding the thing that makes Apply worth buying. Withhold save → fewer users with anything for Apply to work on.
3. **Moat-building behaviour.** Saved data is accrued context = the switching-cost moat (Philomina's data-permanence point). You *want* free users investing saves; paywalling suppresses the exact behaviour that builds both moat and funnel.
4. **Don't undersell Apply.** If "save a bookmark" were Apply's headline, the tier reads as "£25 to bookmark?". Apply must earn its price on the builder, project matching and deadline vigilance — the hard, recurring, system-works-for-you things. The free save list is the on-ramp to those.
5. **GA binding risk is too little adoption, not too much giving-away** (consistent with `trial-value-integrity.md`). Shrinking the funnel to protect a small Apply uptick is the wrong trade at this stage.

## Practical notes for the GA build list

- **Likely a surfacing job, not new infrastructure.** Per CLAUDE.md the `grant_interactions` model already records `saved` and `dismissed` actions. The high-demand fix — a visible reviewed/favourited/dismissed status in the matches list so users stop re-clicking the same grants (Mollie's literal complaint) — is probably UX surfacing, not a new build. Confirm what the current matches UI exposes; if status isn't shown, it's a cheap, high-demand, incumbent-beating fix.
- **Limits:** the only acceptable cap is a high, generous storage backstop ("cap high, never at feels-broken"). Not worth adding at GA — saves are cheap to store and a cap adds anxiety for zero conversion benefit.

## Evidence

Considered Capital WhatsApp group (paid grant database, £225/year, built on Softr), 13-14 Jun 2026. Members request: save favourite applications to a list/tab; X out unsuitable ones; a status column in the database marking favourited vs dismissed. Verbatim: *"My memory is terrible so every week I'm just clicking on the same ones that I've already reviewed."* Two members reacted ❤️. Confirms strong, unmet demand for save/dismiss/remember among users already paying a competitor that can't deliver it.

---

## Competitive teardown — Considered Capital "Live Funding Database" (14 Jun 2026)

Screenshots of their grant card + detail page reviewed. Read confirms the same conclusion as the save decision: their £225/year product is the commoditised manual-filter layer Grant Tracker gives away free, and **GT's `funder_brief` data model is already richer than what they charge for.** Their real advantages are presentation, not data.

### What it is
Manual-filter database: sidebar filters (amount / funding type / social issue / sector / legal structure), scannable cards, click-through to a detail page. No org-profile matching, no eligibility verdict against the user's org, no save/dismiss/memory (the WhatsApp pain). The "~70% reproducible structured filtering" the strategy declines to charge for.

### Their three good ideas, with the "do we already have the data?" verdict
1. **Status pills as scannable badges + top filters** — Open / Closing Soon / Opening Soon / Rolling / Closed / Invite Only / Recently Added. **Pure surfacing for GT — all inputs already held:** `open_status` (open/closed/between_rounds/unknown), `is_rolling`, `is_invite_only`, `next_open_date_parsed`, `deadline`. "Closing soon" = deadline within N days; "Opening soon" = between_rounds + next-open date. → **GA build-list candidate (cheap, do it):** makes the free card visibly richer than their paid one; same lifecycle vocabulary the agent's pacing reasoning needs later. Confirm how cleanly the current card surfaces it.
2. **Eligible vs Ineligible Costs** (can use for: staff / core / equipment / training / consultant; can't: sports / retrospective / political / fundraising / overseas / medical / alcohol+animal). Best content idea — spending-type exclusions cause post-effort rejections (Philomina pattern). **Half-covered:** `funder_brief.exclusions` ("what they explicitly will NOT fund or who cannot apply") = the ineligible side, stored as free text not a structured list. The missing axis is structured *cost-type eligibility* (what the money may be spent on; `what_they_fund` is causes/projects, not cost types). → **GA quick win:** surface the existing `exclusions` field on the card/detail. **Backlog:** structured cost-type eligibility as a possible `funder_brief` extension — note the enrichment-quality cost (detect/extraction lessons), and `exclusions` already delivers most of the user value.
3. **Calm, well-labelled detail layout + "Helpful notes" context block** — presentation lesson, not data.

### Where GT is already ahead
Structurally absent from their product: org-profile matching; eligibility *verdict* against the user's org (not "here are the structures, eyeball it"); save/dismiss/memory; multi-funding-type breadth (theirs is grant-centric); per-field source citations; finer legal-structure + sector taxonomy. GT's `funder_brief` also carries `priorities`, `strong_application`, `funder_tips`, `typical_award`, `how_to_apply`, `decision_timeline` — most not shown on their detail page.

### The data-quality tell (don't be intimidated by polish)
Their Groundwork Grassroots Grants card (People's Postcode Lottery community grant) is tagged target sectors **"Engineering or Manufacturing"** and **"Healthcare"**, social issue "Workers' Rights" — auto-tagging misclassification the clean layout hides. Their taxonomy reads generic, not charity-tuned. Direct evidence for the verified/audit-grade wedge: polish ahead of accuracy, and accuracy is what now separates products (the "grounded/verified" claim is commoditising — real fidelity is the differentiator).

### Strategic frame
Every field on their £225 detail page that GT's **free** card matches or beats undermines "why pay for a database." Make the free grant card *visibly superior to the paid incumbent on the same screen* (status pills + surfaced exclusions get there cheaply); paid tiers earn their price on what they structurally can't build (matching depth, vigilance, the builder, the agent). Reinforces the save-free decision above.

### Pulls for the GA build list
- **Status pills** (cheap, do it) — surface `open_status` / `is_rolling` / `is_invite_only` / deadline-proximity / `next_open_date` as scannable badges + filters.
- **Surface `funder_brief.exclusions`** on the card/detail (cheap, high-value — prevents wasted applications).
- **Backlog:** structured cost-type eligibility as a `funder_brief` extension (mind the enrichment-quality cost).
