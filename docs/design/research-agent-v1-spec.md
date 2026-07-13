# Research agent v1: build specification

Grant Tracker · build spec · 11 July 2026 · implements §3 of the two agents, one spine note · mockup: the Research section (11 July session)

**Status:** ready to build, gate-disciplined as ever. **Sequencing:** proceeds during the first-user onboarding pause; B12/B13 and the eval-grader hardening land ahead of or alongside it; the first user's return re-interrupts this work, by design. Nothing here touches the free surface or the MCP tool set in v1.

## 1. What it is

A dedicated Research section: the adviser as a focused funding researcher. The user opens a thread scoped to a purpose, a campaign, or an ad hoc question ("funding for the schools programme"), converses with full research depth, and acts on findings without leaving the thread. Threads persist; pinned findings form each thread's research log and feed the adviser's grounding. This is the mode the archetype tests kept proving: every genuinely adviser-like moment came from live research around the verified catalogue.

## 2. The safety-line supersession (explicit, controlled)

This spec deliberately supersedes a recorded hard line. The earlier scoping recorded: web search stays out of the runtime reasoning path; enrichment is an offline, human-gated pipeline. The research agent reverses the first half: runtime web research is its core capability. The reversal is safe because the controls that made the line necessary are now built into the design:

- Research fires on request or defined trigger, never reflexively. The user asks, or an unverified record is about to carry a recommendation. No ambient searching.
- The provenance register is mandatory in the UI. Catalogue-verified content carries its chrome; live-researched content carries the amber researched-live, not-yet-in-catalogue treatment. The two are never visually or verbally conflated. Researched claims in prose must identify themselves as researched.
- The human gate moves to where it matters: the catalogue. Live findings never write to catalogue rows. A researched funder or corrected fact flows to staged `needs_review` for human sign-off (the enrichment loop's front door). Research is capital expenditure on the moat: found once, verified once, kept forever.
- Unverified finds get restricted actions. No add-to-pipeline on a not-yet-in-catalogue find; Save, Pin, Research deeper, and Flag for verification only. Pipeline entry follows verification.

Record this supersession in the build spec's decision log with this reasoning, so the original line's intent (no unaudited web content contaminating the verified layer) is visibly preserved.

## 3. Workspace mechanics

**Threads:** `agent_threads` gains an optional `focus`: a purpose reference or a free-text focus label. Multiple concurrent threads per org; the existing one-active-thread constraint is lifted for research threads (scoped by kind or equivalent). Thread tabs named focus-first ("Schools programme · £110k").

**Pins:** a small new table (thread ref, org ref, title, body/snippet, source kind: catalogue / researched / adviser-judgment, optional opportunity ref, `created_at`). Pins render as the thread's log panel; pin content becomes grounding input for the adviser (`org_facts`-adjacent; decide storage vs read-through with schema conservatism). Pins are user-curated: the adviser may suggest a pin, never silently create one.

**Action chips on opportunity cards:** Add to pipeline / Save for later / Write me a brief / Pin / Research deeper. These are UI over existing tool calls where they exist (`add_to_pipeline`), small new ones where not (save-for-later is a pipeline item at a pre-identified stage or a saved list, implementer's call with reasoning; brief generation below).

**Briefs:** "Write me a brief" produces an adviser-authored funder brief or approach note: what they fund, fit against the purpose, how to approach, watch-outs, every claim carrying its provenance kind. Stored against the thread (and pinnable). Boundary, now canonical: briefs and approach notes are advice and legitimately adviser-authored; application text remains user-authored. The scaffold guard is untouched.

## 4. The research capability

**Mechanism:** web search + fetch tools available to the orchestrator in research threads only (a thread-kind capability flag), never in the briefing generation path or the standard drawer in v1.

**Behaviour steering:** catalogue first, research when asked or triggered; when research contradicts or extends a catalogue record, state the discrepancy explicitly and flag it (the distributed-QA behaviour, now first-class); never present a researched figure with catalogue-grade confidence.

**Enrichment flow:** a flag-for-verification action creates a `needs_review` staging entry carrying the source URLs and the claimed fields, tagged to the originating thread. Verification standard unchanged: checked against the funder's own source before activation.

### 4.1 Cost controls (all four levers, from day one)

- **Per-org research budget:** N research actions per month (set the provisional N from the archetype sessions' token data; generous, mostly invisible, hard-capped). Over budget: the adviser says so plainly and continues catalogue-only.
- **Research-once-keep-forever:** researched funder profiles cached against the funder (with `fetched_at`), reused across threads and orgs until stale; the staging pipeline is the permanent version.
- **Model routing:** existing lanes apply; research synthesis runs the strategist lane, thread chatter the cheap lane.
- **Instrumentation:** per-thread and per-org token/cost metering through the existing capture layer, reported like briefing generation. Real per-session number wanted after the first week of use.

## 5. Surfaces

In-app only in v1. The MCP surface keeps its current tool set; the research capability travels to MCP only after the cost controls and provenance treatment have proven themselves in-app (and that exposure is its own gated decision). The everywhere-launcher may open a research thread contextually ("look at this fund for me" from an opportunity page starts or resumes the relevant thread); include if cheap, defer if not.

## 6. Evals before ship

- **Provenance grounding:** researched claims must self-identify; a live-researched fact presented with catalogue confidence fails.
- **The unverified-find pattern:** a not-in-catalogue funder surfaced must carry the amber treatment and restricted actions; an add-to-pipeline offer on one fails.
- **Discrepancy honesty:** planted conflict between a catalogue row and a live source → the discrepancy must be stated and flagged, not silently resolved either way.
- **Budget behaviour:** over-budget thread → plain statement + catalogue-only continuation, no silent degradation.
- Existing suites stay green throughout; the scaffold guard's cases extend to the brief artefact (a brief containing application-style first-person ask text fails).

## 7. Out of scope for v1

- The strategy agent (its own spec, after the purpose-model evolution is designed).
- MCP exposure of research (§5).
- Automatic/background research (vigilance-triggered research belongs to the watching layer, later).
- Case-for-support document input (document layer note §3; the thread accepts it when that pipeline exists).

## 8. Build order and gates

1. Threads + pins schema (migration discipline as ever). — DONE (migration 038)
2. Research capability flag + steering + cost levers. — DONE (migration 039)
3. The Research section UI per the mockup. — DONE
4. Action chips + briefs. — DONE (migration 040)
5. Enrichment staging flow. — DONE (migration 041), verified live 2026-07-13. `flag_for_verification` stages via `stampNewGrant()` into `scraped_grants` (is_active=false, source `system:research-flag-<date>`, never `admin:`) — the same table and Needs Review workflow every other addition uses, deliberately not the smaller `funders` table, which the admin UI doesn't surface at all. `agent_flagged_findings` is the "tagged to the originating thread" audit trail. Explicit-user-request only, never automatic; the model says "staged for review," never "verified" or "in the catalogue." No UI chip for this by design — the mockup's researched-live card only lists Save for later / Research deeper / Pin; flagging is conversational-only.
6. The eval set → ship to Paul's orgs behind the existing gates. — NOT STARTED.

**Ship-gate, decided 2026-07-13 (step 3 review), CLOSED same day (step 4):** cards used to render live only, not reconstruct on a thread reload. Closed by factoring PANEL_RESULT_SLIMMERS out of loop.ts into orchestrator/panel-slimmers.ts, shared by the live loop and threads.ts's loadThreadView, which now resolves each turn's card-worthy tool_use ids against the following stored tool_result row and re-slims through the identical mapping. Verified live via research-smoke.ts (a stored synthetic get_briefing turn reconstructs the same card data a live turn would show).

**Confirmed correct, not a hack (step 3 review):** "Save for later" on a researched-live (not-yet-catalogued) card creates a pin rather than a `grant_interactions` row — there is no catalogue id to attach one to yet. This is logged, intended behaviour, not a stand-in to revisit; it stays this way until the enrichment staging flow (step 5) gives a researched find a real catalogue home.

**Resolved 2026-07-13 (step 3 review):** the mockup's opportunity card called "Add to pipeline" *"forest solid, the primary"*. CLAUDE.md's locked button-hierarchy rule wins — that chip is lime fill, and the mockup's wording on this one point is superseded.

Every deploy through the standing gate: regression suites, accent check, free-surface fingerprint, named rollback.

First-user return interrupts: when he's back, his onboarding takes priority over whatever step is in flight.

---

*Grant Tracker · research agent v1 build specification · internal*
