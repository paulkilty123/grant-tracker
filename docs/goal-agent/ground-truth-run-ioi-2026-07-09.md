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

## 7. Post-run empirical results (F-list execution, 9 Jul)

### F7 re-tagging proven null → F8 is the unified lever
Applying accurate, brief-grounded corrections to the named near-misses (Barbara Ward +`young_people`,
BBC Children in Need +`young_people`; durable admin+pinned provenance) moved recall by **zero**
(12/5/13/2 unchanged) and did **not** drop the Jerwood false-positive. That is the finding: the
near-misses are genuine **beneficiary-not-theme** matches, and Jerwood is a coarse-**theme** over-reach
— **both** caused by themes being over-weighted (35/100) and coarse. **Re-tagging cannot fix either
without misrepresenting funders.** On inspection only 2 of the 6 named funders had genuine sector
mis-tags; the rest (DCR Allen, Garfield Weston, Clothworkers, Baring) were already correctly tagged or
*accurately* partial. **F7 (re-tagging) is not the recall lever; F8 (weighting) is — now proven, not
asserted.** Jerwood's beneficiary was corrected to `general_public` anyway (it funds artists) — accuracy
over recall.

### F7 systematic pass — sized
**89 of 643 active grants (14%)** are under-tagged (5 zero-sector, 84 single-sector) — a *different*
population from the IoI near-misses (which had 2–4 sectors). Worth doing for broad recall; it will not
move a Devi-style benchmark.

### F8 — scoring-variant harness + result
`scripts/agent-eval/scoring-harness.ts`: **one benchmark, many candidate scorers.** A variant is a
`MatchWeights` config passed to the **real** `computeMatchScore` (caps/freshness/IDF all apply —
faithful, not an approximation), ranked through the same cash-first ordering. Metrics **both
directions** (recall@40 + top-10 retention + winner-surfaced) and an **overfitting guard** on CGK + ACC
(top candidates stay sensible; no non-cash / size-mismatch resurgence). `computeMatchScore` gained an
optional `weights?` param; **`DEFAULT_MATCH_WEIGHTS` = current values, so production is byte-identical.**

Weight sweep (themes vs beneficiaries):

| variant | recall@40 | top-10 | winner rank | guard |
|---|---|---|---|---|
| baseline t35/b20 | 11/28 | 5 | #11 | reference |
| **t25/b30** | **13/28** | **6** | **#9** | holds |
| t20/b35 | 12/28 | 4 | #7 | ACC drifts |

**`t25/b30` (themes 35→25, beneficiaries 20→30) lifts *both* directions** — recall +2, top-10 +1,
winner *into* the top 10 — while CGK/ACC hold. Over-shifting (t20/b35) breaks precision. **PROVISIONAL
pending benchmark #2:** n=1 is the risk, so the winning weights are **not** shipped —
`DEFAULT_MATCH_WEIGHTS` is unchanged. **Jack's onboarding is benchmark #2 waiting** — his real pipeline
vs the adviser's plan, same protocol; confirm t25/b30 there before touching production weights.

### F6 amount audit
Two clear sub-£100-minimum artefacts fixed to undisclosed (**British Film Institute £1**, **South
Lanarkshire Council £75**; durable admin+pinned). The ratio heuristic over-flags — genuinely wide public
funders (National Lottery, UK Sport, Screen Scotland) left untouched; the £250–£500-minimum batch logged
for per-row judgment in normal verification. No bulk edits.

## 8. MCP live steering test (10 Jul) — F1 fails on MCP, two real fixes shipped

Ahead of Jack's onboarding, the MCP promotion (`agent/v1-core` → `main`, purposes-based goals +
`recommend_mix` + `update_goal_purposes` + whoami/date-grounding) was verified with a scripted repeat
of the IoI mix failure, run from a fresh Claude chat against the promoted prod endpoint: the F1
amounts-first probe, confirm-before-write, mix-component disclosure, and a draft-refusal probe.

### Result: F1 fails on MCP — description-only steering doesn't hold

The model wrote the goal immediately from unquantified purposes: no amounts question, no
`recommend_mix` call, no confirm turn. Same failure class as the original IoI mix bug (inventing
proportions instead of asking), reproduced through a *different* mechanism: MCP has no orchestrator
system prompt to carry the in-app FIRST-RUN SETUP discipline (one question per turn, no premature mix,
confirm-before-write) — only the tool descriptions in `TOOL_REGISTRY` steer an external client, and
prose steering alone did not hold for setup procedure, even though it held for other rules (see below).
**Values in a description are followed; process needs enforcing in code.**

### Fix 1 — structural setup gate, not prose

`set_funding_goal` now refuses to write a **first** goal (`ctx.surface === 'mcp'` and no active goal
exists) — `SetupSurfaceError`, mapped to a `setup_requires_app` MCP error directing the user to sign in
at granttracker.co.uk. Adjustments to an *existing* goal are unaffected — MCP remains the full adviser
for everything post-setup, per the fallback already agreed. `set_funding_goal` and `recommend_mix`
descriptions also gained a directing line, phrased surface-agnostically (`TOOL_REGISTRY` descriptions
are shared verbatim with the in-app orchestrator — see `orchestrator/dispatch.ts` — so an "on MCP…"
conditional would ask the in-app model to reason about a surface it isn't on; the new wording states the
mechanism as a fact instead: writing a first goal "over an external MCP connection" is refused).

### Fix 2 — purposes re-parenting bug (cross-surface, not MCP-specific)

Separately, and more seriously: a goal replacement that omits `purposes` **re-parents** the prior
goal's purposes onto the new goal row (by design, so pipeline `purpose_id` references survive an
adjustment) — but nothing checked whether the carried-forward amounts still made sense against the
**new** `target_amount`. Reproduced live: **£400,000 of purposes survived a replacement onto a
£300,000 goal**, with stale labels, and the model treated them as current. `set_funding_goal` now
computes `purposes_reconciliation_warning` on every write (fresh or carried-forward) — non-null when the
active purposes don't sum to within 10% of the target — and the description instructs the model to
surface it plainly rather than proceed as if it matches (`CONTRACT.inconsistencyHonesty`). Covered by 5
new `schema-smoke.ts` cases: the natural carry-forward mismatch is flagged, a fresh reconciling set
is not, and the MCP setup gate is proven both ways (blocked with no goal, allowed once one exists).

### The win, logged

`connected_org` and `as_of` (this session's whoami + date-grounding build) both surfaced correctly on
the failing path. More importantly: **the model's own post-hoc inconsistency-flagging held** — it
caught the £400k-on-£300k mismatch itself, unprompted, even though nothing forced it to. Procedure
(amounts-first, confirm-turn) needed code; honesty (say when something doesn't add up) held on prose
alone. The `inconsistencyHonesty` contract rule is surface-independent even where setup procedure isn't
— worth noting as a distinct finding, not folded into the failure.

### Outcome

MCP stays the full adviser for everything past initial setup. Initial goal setup is structurally
steered to the in-app guided flow, which already proved out at 9/9 in the conversational eval suite
(CV-09 specifically polices this discipline). IoI's test-org state (the superseded £400k goal, the
£300k goal, its stale purposes, and the test conversation thread) was reset to profile-only baseline
via `reset-test-org.ts` immediately after — ready for whatever Jack-prep work needs next.

### A caution on tool-description steering, and one flaky case found along the way

Shipping this pre-merge regression pass wasn't clean the first time: the first attempt at the
`set_funding_goal`/`recommend_mix` directing line broke CV-02, CV-07, and CV-09 — the model narrated a
fictional "check" and wrote a goal before asking about purposes, and separately over-generalised
`recommend_mix`'s MCP-only redirect into refusing to quote an exploratory in-app mix. Both tools share
one canonical description with the in-app orchestrator (`dispatch.ts`: "the in-app model and a future
external MCP client are steered identically") — an opening sentence that reframes what the tool does,
or a premise stated before its surface qualifier, reliably bled into in-app behaviour even when the
literal words said "on MCP." Fix: keep the original opening sentence completely intact, state any
surface-specific behaviour as a fact late in the string ("over an external MCP connection
specifically... this does not apply to the in-app conversation"), and — for `recommend_mix` — drop the
addition entirely once it was clear the harmless, read-only tool didn't need it: `set_funding_goal`'s
structural refusal alone fully blocks the harmful outcome (a bad write) regardless of whether
`recommend_mix` gets called speculatively first.

Chasing CV-07's continued failures after the `recommend_mix` revert surfaced a separate, useful fact:
CV-07 has a real **~45-50% baseline pass rate**, confirmed by running it 11 times across both the fixed
and the fully-reverted (pre-fix) description text — same rate either way. It predates today's work
entirely; the single sample validated yesterday (9/9) was luck, not a clean pass. Logged as a follow-on
(the model sometimes invents an unnecessary staffing clarifying question before calling `recommend_mix`
even when no purpose category needs refinement), not a blocker for this merge.

## What went right (lock in as regression cases)

- Confirm-vs-written integrity + correct date grounding.
- Inconsistency-honesty and deference in the mix debate — confirmed surface-independent by §8: held on
  the description-only MCP path even where setup procedure didn't.
- Top-of-list precision validated against a human expert, winner included.
- Coordinator reallocation respecting org reality over the default rule.

## Appendix — reproduction

Read-only scripts (`scripts/agent-eval/`): `ioi-profile-audit.ts`,
`mirror-ioi-profile.ts`, `ioi-comparison.ts`, `ioi-rank-devi.ts`, `ioi-diagnose.ts`.
Adviser flag on IoI via `companion-flag.ts`. Devi's real org read-only throughout.
