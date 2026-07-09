# Adviser ground-truth run — Institute of Imagination (9 July 2026)

A blind, end-to-end test of the in-app adviser: build a real organisation's funding
plan through the goal-setting conversation, then compare the resulting candidate set
against a **real fundraiser's actual pipeline** for the same organisation.

## Setup

- **Baseline build:** commit `24227a4` (adviser boundary line). No code, catalogue, or
  selection changes during the run — the adviser ran on exactly this build.
- **Model:** `claude-sonnet-4-6` (both chat and strategist lanes, per `orchestrator/config.ts`).
- **Test org:** TEST_OWNER's *Institute of Imagination* (`f1f9c904`), **profile faithfully
  mirrored** from the real fundraiser Devi's account (`7c89f4ff`) — nulls included (Paul's
  call: identical inputs isolate reasoning quality from input quality). Profile-only at
  start: 0 goals, 0 pipeline. Mirror covered structure, income, location, reach, sectors,
  beneficiaries, niche tags, funding-type prefs, grant range, and mission; never pipeline,
  goals, identity, or flags.
- **Ground truth:** Devi's **32-item pipeline** on `7c89f4ff` (read-only; not examined until
  the adviser's output had been captured, to keep the comparison blind).
- **Profile note:** the matcher reads `years_operating` (null in the real account), not
  `years_trading`; `org_stage` also null. Both are real-setup gaps, faithful in the mirror.

## Headline

1. **Precision at the top is excellent** — the adviser's highest-ranked candidates are the
   funders a human expert actually pursued, including the one she *won*.
2. **The recall gap is real but localised and tractable** — it decomposes into sector-tag
   quality on children's/education funders (the dominant lever) and community-foundation
   catalogue depth, with a design flag on dimension weighting. It is **not** a broad
   catalogue hole (coverage is ~94%, and 2 of the missing are the fundraiser's own private
   entries).
3. **The mix step converges to the right answer, but only under pushback.** Its defaults and
   disclosure are weak; its honesty and responsiveness are strong.

---

## 1. Goal-setting conversation

### 1.1 The mix arc — the main conversational finding

The mix moved across four turns, dragged down only by the user's pushback:

| Turn | Recommendation | What drove it |
|---|---|---|
| 1 | **70% unrestricted** / 30% project | Derived from qualitative purpose descriptions + a "unrestricted is hard, so weight it heavily" heuristic. **Inverted** from reality. |
| 2 (given magnitudes) | 55% / 45% | Correct arithmetic from an inflated core estimate (⅓ core + ⅙ coordinator). |
| 3 (corrected magnitudes + coordinator reallocated to project) | 30% / 70% | Right allocation, but the headline % was under-explained and looked like an error. |
| 4 (challenged on the arithmetic) | **honest admission → re-trace → 30/70 with a 10% programme buffer surfaced → deferred to the user's 25/75** | The number *was* traceable (core 25% + a 10% unrestricted buffer on the programme line); it just hadn't been shown. |

**Final goal mix: 25% unrestricted / 75% project** (the fundraiser's judgment, accepted by the adviser).

The org's real split, for reference: core/overhead ~20–25% (unrestricted); programme delivery
the bulk (project); the expansion **coordinator is project-attachable** (it leads a fundable
expansion programme), which the adviser initially resisted then accepted.

### 1.2 What the adviser did well

- **Coordinator mapping.** After a clarifying question, it mapped the organisational coordinator
  to unrestricted (not the "programme coordinator → project" label trap), and when told the post
  leads a fundable expansion programme, it **reallocated it to project** — respecting the org's
  reality over its default rule.
- **Sophisticated, true advice.** Full-cost-recovery framing ("build overheads into each project
  budget"), the 10% un-recovered buffer, and the core-anchor + FCR + multi-year cultivation
  strategy are all fundraiser-credible.
- **Inconsistency honesty (the contract's most important rule) worked live.** When it could not
  reconcile the 30% against its own components, it said so plainly — *"I should not attempt to
  explain the gap… the figures don't reconcile from the data I have"* — rather than confabulate.
- **Confirm turn held**, and it **deferred** the 25-vs-30 judgment to the user instead of imposing.

### 1.3 Findings

- **F1 — the mix step does not ground in £ magnitudes up front (HIGH).** It derives proportions
  from qualitative purpose descriptions plus a difficulty heuristic, producing an *inverted* 70%
  first pass that only corrected under two rounds of pushback. **Fix:** the mix step should ask for
  the rough £ split across purposes before recommending, and derive the mix from magnitudes.
- **F2 — the programme buffer is under-disclosed (LOW).** The 10% unrestricted sliver on project
  delivery was the entire source of the 30-vs-25 gap and was buried until challenged. **Fix:**
  state and quantify it in the first component breakdown so the headline % self-reconciles.
- **F3 — honesty + responsiveness are a genuine strength (keep).** Lock the inconsistency-honesty
  and deference behaviours in as regression cases.

---

## 2. Confirm-vs-written integrity — clean

The stored goal exactly matches what the adviser confirmed (closing the earlier CGK
confirm-vs-written date-bug loop):

- target £400,000 · start **2026-07-09** (today, correctly grounded — no year-early bug) · end 2029-06-30
- `mix_targets: {project: 75, unrestricted: 25}` (the user's 25/75, not the adviser's 30/70)
- purposes: workshops (programme, £200k) · core staff+overheads (core, £100k) · coordinator
  (**staffing, £100k, refinement "delivery post"** — the project-reallocation captured in the record)

---

## 3. The plan (briefing)

Top-3 briefing moves were all **project** (Paul Hamlyn, Kusuma, Jerwood), consistent with the
75% project mix.

- **F4 — the briefing under-represents the unrestricted slice (MEDIUM).** All three headline moves
  are project; nothing surfaced the 25% core need. Cause: the `unrestricted_track` consideration
  fires at `unrestricted >= 30` (`considerations.ts`), and IoI is 25%. The **conversational** adviser
  handled the core slice well when asked (Swire Core Grant, John Lyon's, Eranda, honest landscape
  context) — so this is a **curation gap, not a capability or coverage gap.** **Fix:** surface ≥1
  core/unrestricted move on the briefing when the goal has an unrestricted target and eligible core
  candidates exist; reconsider the 30% threshold.
- **F5 — de-duplicate by funder in the surfaced set (LOW).** Paul Hamlyn and National Lottery each
  appear twice in the top 20 (multiple programmes). Collapse to one per funder in the moves.
- **F6 — novel-suggestion false positives (LOW–MEDIUM).** Alongside good picks the fundraiser didn't
  have (Youth Music, Arts Council, UK Youth/Pears, Joseph Rank), it surfaced questionable ones:
  **Jerwood Foundation** (funds artists/arts orgs, not children's education — a `creative`-tag
  over-reach), **Legal Education Foundation**, and **Kusuma Trust** whose "£3–5,000k" range is almost
  certainly an amount-parse artefact the adviser leaned on ("broadest-range prospect").

---

## 4. Blind comparison — adviser candidates vs Devi's 32

Full ranked catalogue for IoI: **643 rows.** Top-40 surfacing **cut ≈ score 57.**

| Outcome | Count | Notes |
|---|---|---|
| **Surfaced** (rank ≤ 40, score 58–73) | **12** | includes the winner and every core funder it later named |
| **Near-miss** (rank 41–63, score 50–56) | **5** | 1–7 points under the cut |
| **Deep-miss** (rank > 80) | 13 | of which **2 are correctly-demoted non-cash** (see below) ⇒ ~11 genuine |
| **Not catalogued** | 2 | the fundraiser's own **private** entries (Blagrave, Postcode Society) — not a gap |

**Precision at the top is validated by ground truth.** The adviser's highest-ranked candidates
*are* what an expert pursued:

- **#1 Paul Hamlyn** · **#4 Swire** · **#5 Eranda** · **#7 John Lyon's** · **#8 Julia Rausing** — all in Devi's pipeline
- **National Lottery Community Fund (~#11) is the one she WON** — the matcher surfaced the eventual winner

**The 2 "deep-miss" that aren't misses:** Pro Bono Economics (score 56 but rank 530) and Charterpath
are demoted because they are **non-cash (in-kind/support)**, correctly de-prioritised against a cash
gap. The cash-first re-rank working as designed, not a recall failure. Genuine grant-recall miss is
therefore **~16, not 18.**

**Near-misses (the fast-fix group):**

| Funder | rank | score | to cut |
|---|---|---|---|
| DCR Allen Charitable Trust | 43 | 56 | −1 |
| The Clothworkers' Foundation | 45 | 56 | −1 |
| Barbara Ward Children's Foundation | 46 | 55 | −2 |
| Baring Foundation | 60 | 50 | −7 |
| Garfield Weston Foundation | 63 | 50 | −7 |

---

## 5. Recall diagnosis — why the under-scorers lose

Per-dimension breakdown (max: location 15, **themes 35**, beneficiaries 20, grantSize 10,
funderType 8, eligibility 12):

| Funder | total | **themes** | benef | loc | sector tags |
|---|---|---|---|---|---|
| Paul Hamlyn (rank 1) | 73 | **28/35** | 8/20 | 9/15 | `[creative, education]` ✓ |
| John Lyon's (rank 7) | 69 | 18/35 | 8/20 | 15/15 | `[education, young_people]` |
| **Barbara Ward Children's (rank 46)** | 55 | **4/35** | **14/20** | 9/15 | `[community, health, mental_health]` ✗ |

**Barbara Ward is the finding in one row.** It matches IoI's *beneficiaries better than Paul Hamlyn
does* (14/20 vs 8/20 — both hit "children"), yet ranks **45 places lower**, purely because its
**sector tags are health/mental_health** instead of education/creative, scoring **4/35 on the
dominant themes dimension** against Paul Hamlyn's 28. A genuine children's funder, mis-tagged on
*sectors*, loses ~24 points on the heaviest dimension despite a stronger match on *who it funds*.
BBC Children in Need shows the identical pattern (themes 4/35).

### Findings

- **F7 — sector-tag quality is the binding constraint on recall (HIGH; dominant lever).** Themes is
  35 of 100 and entirely tag-driven; mis-tagged children's/education funders sink there. This is the
  brief-quality → tag-quality → match-quality chain, now **quantified against a real pipeline: a
  ~2-point theme tag is the difference between rank 46 and surfacing.** **Fix:** re-classify the
  near-miss funders (Barbara Ward et al.) with correct sectors — quick per-funder wins — and treat
  systematic classifier under-tagging as the primary recall lever.
- **F8 — themes may be over-weighted for beneficiary-defined orgs (MEDIUM; design).** Themes (35) is
  ~2× beneficiaries (20). For an org whose identity *is* its beneficiary (children's, older-people,
  disability), a perfect primary-beneficiary match with an imperfect sector match still scores mid.
  **Consider:** a stronger primary-beneficiary weight, or crediting beneficiary-adjacent sectors.
- **F9 — community-foundation catalogue depth (MEDIUM).** East End Community Foundation is *not* a
  scoring bug — location scored 15/15. It scores low because the catalogue holds only a small **£10k
  Canary Wharf-administered programme** (not EECF's core grants), that programme tags beneficiaries as
  `general_public` (not children), and £10k is below IoI's £20k floor. **Fix:** add the main CF
  programmes, properly tagged — reinforces the existing London borough / community-foundation work.

---

## 6. Prioritised fixes

| # | Finding | Severity | Fix | Effort |
|---|---|---|---|---|
| F7 | Sector-tag quality → recall | **High** | Re-classify near-miss funders; systematic classifier pass | Med (per-funder low) |
| F1 | Mix step doesn't ask for £ magnitudes | High | Ask for the £ split; derive mix from magnitudes | Low–Med |
| F4 | Briefing under-represents unrestricted | Med | Surface ≥1 core move; revisit 30% threshold | Low |
| F8 | Themes over-weighted vs beneficiaries | Med | Rebalance / beneficiary-adjacent credit (needs eval) | Med |
| F9 | Community-foundation catalogue depth | Med | Add EECF-type core programmes, tagged | Med |
| F6 | Novel-suggestion false positives | Low–Med | Fix Jerwood/Kusuma tags/amounts; check `creative` over-reach | Low |
| F5 | De-dup surfaced set by funder | Low | Collapse to one grant per funder in moves | Low |
| F2 | Programme buffer under-disclosed | Low | Quantify the 10% sliver in the first mix breakdown | Low |

## What went right (lock in as regression cases)

- Confirm-vs-written integrity + correct date grounding.
- Inconsistency-honesty and deference in the mix debate.
- Top-of-list precision validated against a human expert, winner included.
- Coordinator reallocation respecting org reality over the default rule.

## Appendix — reproduction

Read-only scripts (`scripts/agent-eval/`): `ioi-profile-audit.ts`,
`mirror-ioi-profile.ts`, `ioi-comparison.ts`, `ioi-rank-devi.ts`, `ioi-diagnose.ts`.
Adviser flag on IoI via `companion-flag.ts`. Devi's real org read-only throughout.
