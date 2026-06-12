# Reasoning eval harness — design

**Status:** design, v1. 12 June 2026. Companion to `build-spec.md`; the case format is in `golden-set/schema.md`.

The handover makes this the non-negotiable prerequisite: the reasoning core is judgment-paced iteration work, and iteration without a fixed measure is drift. Nothing of the kind existed in the repo before this session (see `README.md` prerequisite report). This harness is how "is it getting better?" stops being a feeling.

---

## 1. What is being measured

Two layers, deliberately different in character:

**Hard gates — deterministic, zero-tolerance, machine-checked.** Integrity properties that must hold on every run of every case forever. A hard-gate failure is a bug, not a quality signal. These run without any LLM judge and are cheap enough to run constantly.

**Judgment rubric — scored, threshold-based, LLM-judged with human spot-check.** The adviser-quality dimensions from the MCP-capture bar. These are what the iteration loop actually iterates on.

The split matters: fabricating a deadline and leading with the wrong constraint are different failure classes. The first can never be traded against anything; the second is the gradient the prompt work climbs.

## 2. Hard gates (G1–G7)

Checked against the structured `AgentRunOutput` (build-spec §6.3) + the briefing pack the run was given. All are pack-relative: the eval never needs the live database.

| Gate | Property | Check |
|---|---|---|
| **G1 citation validity** | Every `facts[].source.ref` resolves to a real pack element (catalogue field, engine verdict, brief citation snippet, org-model field) and the claim is consistent with the referenced value | resolve ref → compare claim against value (exact for dates/amounts/status; snippet-containment for brief text) |
| **G2 no fabrication** | Every opportunity/funder named anywhere in the output exists in the pack | id check + name scan of narrative/why text against pack names |
| **G3 eligibility consistency** | No recommendation for an opportunity the engine marked `ineligible` (blocker); every `rule_outs[]` reason_code for engine-ruled items matches the engine's issue codes | join output ↔ pack verdicts |
| **G4 load budget** | ≤5 recommendations, ≤2 questions, narrative ≤120 words, every recommendation has a non-empty 2–3 sentence `why` | counts |
| **G5 null honesty** | Where pack values are null/`amountUndisclosed`/`isRolling`/`between_rounds`, the output preserves that semantics — no invented deadlines, amounts, or open-statuses | scan claims touching null-bearing fields |
| **G6 arithmetic fidelity** | Every number in the output that the pack computed (gap, run-rate, concentration shares, totals) matches the pack's value; no novel derived numbers | numeric extraction + match |
| **G7 promise lint** | No guarantee language ("you will win", "guaranteed", "certain to receive") and no claimed capabilities outside the boundary (relationship introductions, submission on the user's behalf) | regex/term list, maintained alongside the system prompt |

Case files can add case-specific deterministic assertions (`must_rule_out` with reason codes, `must_not_recommend`, `must_surface` flags) — see schema.

## 3. Judgment rubric (R1–R7)

Scored 1–5 per dimension by an LLM judge, anchored with descriptions and required evidence quotes. Cases declare 2–4 `rubric_focus` dimensions that carry double weight for that case.

| Dim | Question the judge answers |
|---|---|
| **R1 constraint-first** | Does the narrative lead with the genuinely binding constraint for this org (from the pack's arithmetic and context), not a generic opener or a list? |
| **R2 sequencing** | Is there a real ordering argument (credibility ladder, deadline windows, unrestricted-before-restricted, decision timelines), correctly grounded? |
| **R3 rule-out quality** | Are near-misses ruled out for the right reasons, specific enough that the user doesn't re-research them? |
| **R4 fact/judgment separation** | Is everything in `facts` genuinely factual and sourced, everything strategic genuinely in `judgments` — no judgment smuggled as fact, no fact hedged as opinion? |
| **R5 consultant test** | Would a senior UK fundraising consultant agree with the recommendation set and its priorities? Flag anything naive, generic, or sector-tone-deaf. |
| **R6 kind challenge** | Where the case warrants it, does the agent push back constructively and invite challenge — rather than comply silently or lecture? |
| **R7 load-reduction feel** | Does the output read as relief (few things, clearly why, what to do) rather than homework (long, hedged, option-dump)? |

**Judge setup:** judge model = `claude-sonnet-4-6` initially; judge prompt versioned alongside the agent prompt; judge must quote output evidence for every score ≥4 or ≤2 (anti-leniency). When the generator and judge are the same family, bias is real but bounded for rubric-anchored scoring; the standing mitigation is the human loop: **Paul reviews a 100% sample for the first three eval rounds, then ≥25% ongoing**, recording agree/disagree per dimension. Judge-human disagreement >20% on a dimension means the anchor text gets rewritten before further iteration trusts that dimension.

## 4. Architecture

```
docs/goal-agent/golden-set/
  schema.md                # case format (human reference)
  cases/GS-*.json          # the cases (versioned, reviewed in PRs)
  fixtures/                # pinned catalogue snapshots (generated, committed)
scripts/agent-eval/
  run.ts                   # runner CLI
  graders/gates.ts         # G1–G7 deterministic graders
  graders/judge.ts         # rubric judge harness
  fixtures-build.ts        # read-only snapshot builder (resolves pinned_refs)
  reports/                 # per-run JSON + markdown reports (gitignored? no — committed, they're the regression record)
```

- **Runner modes:**
  - `--assemble-only` — context assembly + pack validation, no model call. Fast loop for context work.
  - `--stub` — canned outputs through the graders; proves harness mechanics (build step 1).
  - `--full` — assembly → reasoning pass → gates → judge. The real thing.
  - `--consistency N` — run each case N times (default 3), report per-case variance.
- **Offline by construction.** The runner touches no live database and no live site: org/goal/pipeline/facts come from the case file; catalogue context comes from fixtures. This honours build-in-isolation and makes results reproducible against catalogue churn (the daily crawl mutates `scraped_grants`; an eval that floats on live data can't distinguish prompt regressions from data drift).
- **Fixtures.** Two kinds, per case: **synthetic** rows (inline in the case or shared in `fixtures/synthetic-*.json`) for integrity cases that need exact known values; **pinned** rows (`pinned_refs` by title+funder, resolved once by `fixtures-build.ts` via a read-only SELECT into committed snapshot files) for realism cases that should reason over real catalogue shape. Pinned snapshots are refreshed deliberately (a versioned act), never implicitly. Fixture rows are `GrantOpportunity`-shaped post-normalisation, each with eligibility verdicts **pre-computed by actually calling `runEligibilityChecks`** at fixture-build time so gates have engine truth to compare against.
- **Replayability.** `agent_runs.context_digest` + `raw_output` (build-spec §5.2) let any production run later be converted into a case. The harness is the front door for "this real run was bad" → regression test.

## 5. Scoring and reporting

Per case-run: hard gates pass/fail (any fail = case fails, report names the gate) → rubric scores → case score = weighted mean with `rubric_focus` doubled. Case passes if all gates pass and score ≥ 4.0 with no dimension < 3.

Per suite-run report (committed to `reports/`): pass/fail per case, per-dimension means, deltas vs previous report for the same prompt_version lineage, cost per run, token counts. Regressions (any case pass→fail, any dimension mean −0.5) are named loudly at the top.

## 6. The consistency bar

The handover's bar is *consistency* for heartland situations, not best-of-N. Definition:

> **Heartland-consistent:** every case in the heartland family (GS-01, GS-02, GS-07, GS-14, GS-16) passes — gates and rubric — on **3 consecutive full runs** (temperature as production), with the *substance* of the top recommendation stable across runs (same opportunity or same action_type+target; wording may vary).

Substance-stability is judged by a cheap LLM check ("are these two top recommendations the same advice?") with human confirmation in the early rounds. The whole suite must additionally hold 100% on hard gates across all runs — gates have no consistency allowance.

This is the Phase 2 exit gate (build-spec §11). "Good enough to demo" is one good run; the bar is the boring reliability that justifies a paid companion.

## 7. Workflow

- **Every prompt change** = new `prompt_version` = full suite run before the change merges to the agent branch. The report is the review artefact.
- **Red-team additions:** when iteration reveals a new failure mode, the fix lands *with* a new case that would have caught it (same discipline as the repo's regression habit, finally with somewhere to put it).
- **Cadence tie-in:** suite state joins the Friday weekly review alongside funnel and mcp_query_log.
- **Cost:** full suite ≈ 16 cases × 3 runs × (1 reasoning + ~7 judge calls compressed to 1 judge pass per run) — instrument it like production; the eval budget is real money and the per-run cost numbers double as early cost-to-serve data.

## 8. Seeding rationale (what the 16 cases cover and why)

Sources: active-cohort profiles A–F (`docs/mcp-first-encounter-test-queries.md` — real engagement-thresholded users, anonymised), the strategy brief evidence log (Jen 3 Jun, Emma 31 May, David 28/31 May, Philomina 5 Jun), and the MCP set's deliberately-thin areas. The MCP set tests *discovery queries*; this set tests *goal-level reasoning* — the cases reuse the cohort's real situations but pose the Companion's job (plan, prioritise, sequence, watch), not the search job.

| Family | Cases | What it proves |
|---|---|---|
| heartland | GS-01 concentration risk · GS-02 kind challenge on a big-bid urge · GS-07 mixed-income rebalance · GS-14 flood control · GS-16 pacing arithmetic | The Jen-archetype consistency bar: constraint-first, sequencing, load-reduction, correct arithmetic |
| cohort | GS-03 Brighton CIC structure+geo · GS-04 Newham £700k depth · GS-05 micro-org size floor · GS-06 pre-revenue stage gates | The agent reasons correctly across the real user span (structure, geography, size, stage) |
| integrity | GS-08 hidden-criteria not-a-fit · GS-15 null honesty · GS-13 off-goal request | Fail-toward-honesty under the exact conditions that produce hallucination |
| scope-honesty | GS-09 Manchester sport · GS-10 Cardiff Welsh-language | Honest thinness beats confident fabrication in known catalogue gaps |
| collaborative | GS-11 correction persists · GS-12 standing constraint | The loop is real: corrections carry forward, excludes never resurface |

Known gaps to fill in later rounds (deliberate, not oversight): multi-turn conversation depth beyond single corrections; strategy-upload extraction (Phase 3 — needs its own harness); digest/proactive selectivity (Phase 5); adversarial inputs (conflicting constraints, hostile prompts); outcome-calibrated scoring (needs real outcome data — the §5.6 capture exists precisely so this becomes possible).
