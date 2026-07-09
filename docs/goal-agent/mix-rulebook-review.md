# Mix rulebook — v1.0 (reviewed) + stage weights (final)

**Status: REVIEWED — Paul's line-by-line markup applied 11 Jul 2026. Both ship gates cleared** on implementation of this document: rulebook `mix-rules-v1.0` (code: `src/lib/agent/tools/mix.ts`), stage weights final (code: `src/lib/agent/context.ts`), CV-02 extended to cover the R3/R5 follow-up questions. Future changes go through this document first, then code, with a version bump. Candidate categories Paul may add later: reserves rebuilding, appeal costs — the `mix_fallback_fired` log tells us what else the wild asks for.

**Vocabulary (fixed by the spec):** mix is expressed in funding character — `unrestricted`, `project`, `capital`, `investment`. Sources (corporate, contracts, trusts) are attributes of opportunities within the mix.

---

## 1. The rulebook v1.0

The reasoning column is delivered VERBATIM by the Companion in the firm register — it is product copy.

| # | Category | Mix split | Behaviour + reasoning the Companion states | Review outcome |
|---|---|---|---|---|
| R1 | `core` | unrestricted 100 | "Core running costs point at unrestricted funders — harder to win, but each award covers months of running costs rather than one activity." | ✅ confirmed |
| R2 | `programme` | project 90 · unrestricted 10 | "Programme delivery maps to project funding — build full cost recovery into each budget so your overheads are covered within the grant itself; a small unrestricted slice covers what individual funders won't." | ✏️ split 85/15 → 90/10; reasoning rewritten (FCR, not overhead-via-unrestricted) |
| R3 | `staffing` | ask-with-refinement: delivery → project 100 · organisational → unrestricted 100 · mixed/skipped → 50/50 | Clarify: "Is that a delivery post or an organisational post?" Reasoning: "Posts split by what the role serves: delivery posts sit in project budgets; organisational posts need unrestricted income." | ✏️ restructured as ask-with-refinement |
| R4 | `capital` | capital 100 | "Equipment and building costs sit with capital funders — a distinct funder population from revenue grants." | ✅ confirmed |
| R5 | `capacity` | project 70 · unrestricted 30 **+ opportunity types: programme, in_kind** | Clarify: "Which areas need strengthening — for example finance, digital, governance, fundraising itself?" Reasoning: "Capacity building is funded through project grants and unrestricted capacity-building grants — and the right support is often not money: organisational-development programmes and in-kind support cover this ground too." | ✏️ ask-with-refinement + recommends opportunity types beyond the mix |
| R6 | `working_capital` | investment 100 **+ opportunity types: investment, programme** | "Working capital ahead of contracted income is repayable-finance territory. The landscape spans social investment, incubator and accelerator programmes (some carry funding), and impact investment (which may or may not take equity) — describe it and signpost; the decision to borrow or give equity is never advice this layer gives." | ✏️ held on-rulebook, landscape widened; advice boundary unchanged |
| R8 | `match_funding` | project 100 | "Match funding comes from funders comfortable co-funding alongside a lead award — they match against money already secured, so name the secured grant in the ask; a confirmed win expands what you can credibly request." | ➕ NEW — part (a), the purpose rule |
| R7 | `other` | — no rule (deliberate) | Routes to labelled Layer-2 judgment; every firing logged via `mix_fallback_fired` with the rulebook version | ✅ confirmed |

**R8 part (b) — strategist behaviour (the more valuable half):** after a win is recorded, the Companion raises match as a consideration — "other funders will match against secured funding, which can expand what the project delivers" — recommending it where the purpose fits. Implemented as an orchestrator steering line + a deterministic `considerations` entry on the briefing payload when a won-stage event exists in the last 30 days. **Logged gap:** match-friendly funders cannot yet be identified from catalogue data — a candidate enrichment field (e.g. `accepts_match`) recorded in build-spec §14 as a follow-on.

## 2. Off-rulebook fallback (Layer 2) — confirmed

Unmapped purposes come back `off_rulebook: true`; the Companion reasons about them explicitly as its judgment; every firing logs `mix_fallback_fired`; the blended mix covers rule-derived purposes only.

## 3. Blending mechanics — confirmed as drafted

B1 amount-weighted · B2 missing amounts weighted at the mean of stated amounts (equal if none) · B3 largest-remainder rounding to 100, zero components dropped · B4 `purposes_total` returned for verbatim totals. Ask-with-refinement components blend at their refined mapping once refined, default mapping until then.

## 4. Stage weights — FINAL

Caption everywhere the figure renders: **"weighted = amount × stage likelihood"**. **Principle (recorded in build-spec §14): the gap must never flatter — conservative beats optimistic everywhere the arithmetic surfaces.**

| Stage | Weight | Rationale |
|---|---|---|
| identified | **0** | a bookmark is not money |
| applying | **0.25** | |
| submitted | **0.40** | |
| won | 1.00 | counted in full; feeds derived secured |
| declined | 0.00 | |

## 5. Sign-off

- [x] Rulebook rows marked up and final (11 Jul 2026)
- [x] Fallback behaviour confirmed
- [x] Blending mechanics confirmed
- [x] Stage weights final
- [x] Code updated from this doc; `mix-rules-v1.0`; CV-02 extended to R3/R5 follow-ups; suite green
