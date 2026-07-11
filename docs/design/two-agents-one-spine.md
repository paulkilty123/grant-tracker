# Two agents, one spine

Grant Tracker · design note · 11 July 2026 · the phase-two thesis · companion to the Adviser v1 spec, the campaigns and document layer note (10 July), and the archetype test findings

**Status:** agreed design direction. **Origin:** after the full archetype test programme, Paul's verdict on the shipped adviser was that it does not yet feel materially better than matching, and that the cause is a conflation of two different jobs. This note names the split, evolves the purpose model that underlies both, and sets the phase-two build order. Nothing here changes the first-user onboarding plan: the skeleton ships to Jack honestly framed, and his real usage is raw material for both agents.

## 1. The diagnosis: one surface, two conflated jobs

The shipped adviser runs the strategy agent's frame (a plan, a read, sequenced moves) on the research agent's inputs (a two-field goal and a profile form), with neither agent's depth (no web research; no strategy-grade input). The result can neither research deeply nor strategise substantially, which is why it reads as matching with prose. The evidence is consistent across the test programme: every genuinely adviser-like moment (the Mohn Westlake threshold catch, trustee and portfolio-fit research) came from hybrid MCP sessions where live research surrounded the catalogue; every flat moment came from day-one briefings rearranging catalogue rows.

## 2. The purpose model evolves: funding needs, not cost centres

The current setup asks users to pre-split core from programme. Real fundraising does not work that way: a real need is "£100k for the schools programme, starting in six months, running a year", and that budget properly includes its share of overheads through full cost recovery. Core as a separate slice is only real for the residual: the standing costs no programme budget can absorb. The model therefore evolves:

- A purpose is a funding need: what for + how much + when (start and duration, the phased-need decision C14, now load-bearing) + whether overheads are budgeted in.
- Unrestricted is derived, not declared. The adviser computes the residual from what is programme-attachable and asks the one clarifying question that matters: "does that £100k include your overhead share, or is it delivery-only?" This is R1/R2 maturing from mappings into reasoning, consistent with the rulebook's own full-cost-recovery copy.
- The gap and run-rate phase over time. "£X needed by month six" replaces the flat monthly average as the binding constraint where timing exists; the average remains as context only.

This supersedes the stepper's current core/programme pre-split. The stepper's purposes step becomes needs-shaped (what, how much, when, overheads toggle); the recommendation step derives the mix from it.

## 3. The research agent

**Job:** "I need funding for X: go." For the user who knows what they want funded and wants to dive straight in.

**Scope:** a purpose (or campaign, per the 10 July note; the campaign lens is this agent's home). Discovery, assessment and ranking scoped to it.

**Depth:** the web-research layer: live funder research (thresholds, trustees, portfolio fit, timings) around the verified catalogue, with every finding flowing back as staged, human-reviewed enrichment. Research is capital expenditure on the moat, not per-session cost.

**Input:** modest: the purpose, optionally its case for support (document layer §3 of the 10 July note). Fast to first value.

**Evidence:** this is what the hybrid MCP sessions actually delivered, what cohort member Jen explicitly asked for, and what most users want most days.

## 4. The strategy agent

**Job:** a proper fundraising strategy, the document a director takes to their board, which evolves as reality changes and which the briefing then tracks against.

**Input** is substantial and staged: phased funding needs (§2), the org strategy document, budgets, funder history, constraints, gathered over a session or a week, not two minutes, with staged-and-confirmed extraction throughout.

**Output** is an artefact: a living strategy (targets, mix with reasoning, sequencing, named tracks, risks, review points) that renders as a shareable, board-ready document. This is the first artefact in the product a user would show someone else: a distribution feature wearing a strategy feature's clothes.

The briefing becomes its tracking surface: progress against the strategy, deviations flagged, the read grounded in a real plan rather than a two-field goal.

**Boundary note:** the strategy is advice and is legitimately adviser-authored (confirmed by the user, provenance throughout). The authorship boundary continues to apply to applications: the words a funder reads stay the user's.

## 5. The shared spine (what does not change)

Both agents run on the spine already built and tested: the goal and purposes schema, pipeline with purpose references, the verified catalogue and eligibility engine, the rulebook, the contract constants and their evals, the tool layer serving both surfaces, capture and provenance. This is a reorganisation of the experience, not a rebuild of the machinery. The briefing remains the home surface and becomes, over time, the place the two agents meet: the strategy tracked, the research on tap.

## 6. Sequencing

First user ships on the skeleton, now. Honestly framed ("early, and it gets smarter as you use it"). His usage is raw material both agents need; the strategy agent especially cannot be designed well without watching a real org's plan evolve. The time layer (vigilance, memory, compounding context) is built by real usage and cannot be tested into existence.

Phase two, part one: the research agent. Campaign lens + web-research layer + enrichment loop + case-for-support input. Nearer, cheaper, and the mode the tests keep proving.

Phase two, part two: the strategy agent. Purpose-model evolution (§2) + document layer + the board-facing strategy artefact + briefing-as-tracking.

Dependencies already in motion: semantic-similarity experiment (research agent's matching depth), document layer note (input pipeline), C14 phased need (now load-bearing rather than optional), plan-shaped-moves steering (interim fix for the current briefing's match-shaped feel).

## 7. Supersession notes

- The campaigns and document layer note (10 July) stands; the campaign lens is now explicitly the research agent's home.
- Adviser v1 spec §4 (the setup conversation) and the stepper's purposes step will be revised to the needs-shaped model when §2 is built; until then the current split ships as-is.
- C14 (phased need) is promoted from logged option to core dependency of the strategy agent.
- The one-active-goal principle (§5) is unaffected: one strategy, many needs and campaigns inside it, one arithmetic.

---

## Addenda (logged 11 Jul 2026, treated as part of this note)

Three additions since this note was written, per Paul:

### A. Research section experience

A dedicated **Research** nav item. Multiple threads, each focus-named to a purpose or an ad hoc question. Conversation surfaces opportunity cards with in-context actions (Add to pipeline / Save for later / Write me a brief). Live-researched finds carry **amber unverified provenance** and get **no pipeline action until verified**, with a "flag for catalogue verification" path — the enrichment loop's front door. A pinned findings panel per thread acts as the thread's research log — a small new table, feeding `org_facts`/grounding.

Boundary clarification now canonical: briefs and approach notes are adviser-authored advice and legitimate; applications remain user-authored.

### B. Strategy page experience

Working-session intake → a living strategy page (adviser-authored summary, phased-needs timeline, named tracks with status, version history with "what changed", quarterly review cadence) → "Export for the board" as a rendered document. The briefing tracks against it.

### C. Rename: Briefing → Home

Same shallow-rename discipline as Companion → Adviser: user-facing strings and nav only — "Home" as the first nav item; internal identifiers/routes stay as they are or migrate at leisure. "My read", "Recommended moves" and the adviser rail keep their names. Queue it with the next UI-touching deploy rather than as its own.

**Priority order unchanged:** B12/B13 and the eval-grader hardening remain the near queue; phase two starts research-agent-first after first-user onboarding, per §6 above.

---

*Grant Tracker · two agents, one spine · internal design note*
