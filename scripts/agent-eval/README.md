# Goal-agent eval runner (build step 1)

The reasoning eval harness from `docs/goal-agent/eval-harness.md`, step 1: prove
the mechanics against a **stub reasoner** before any model call. Offline by
construction — no live DB, no live site.

## Run

```bash
# stub reasoner → G1–G7 hard gates + case assertions (default)
npx tsx scripts/agent-eval/run.ts

# just build the briefing pack per case (no reasoner)
npx tsx scripts/agent-eval/run.ts --assemble-only

# one case
npx tsx scripts/agent-eval/run.ts --case GS-01

# (optional, deliberate) refresh pinned catalogue snapshots — read-only SELECT
npx tsx scripts/agent-eval/fixtures-build.ts
```

Reports are written to `reports/latest-stub.{json,md}` and committed (they are
the regression record).

## What step 1 proves (its gate)

All 16 golden cases load and validate, every case's fixtures resolve into a
briefing pack, and the G1–G7 hard-gate graders + the case assertions run
end to end. `npx tsx scripts/agent-eval/run.ts` exits 0 when that holds.

## What is real vs stubbed here

| Piece | State |
|---|---|
| Case loader + schema validation (`cases.ts`) | real |
| Filler pools + pinned snapshots (`fixtures/`, `fixtures-build.ts`) | real (pinned = best-effort read-only) |
| Briefing-pack builder (`pack.ts`) | **stand-in** for `src/lib/agent/context.ts` (build step 3) |
| Eligibility (`eligibility-stub.ts`) | **stand-in** for `runEligibilityChecks` (wired in step 3) |
| Reasoner (`stub-reasoner.ts`) | **stub**, no LLM — real pass is `src/lib/agent/reason.ts` (step 4) |
| Hard gates G1–G7 (`graders/gates.ts`) | real |
| Rubric judge R1–R7 (`graders/judge.ts`) | placeholder — build step 4 |
| Correction/constraint loop | build step 5 — so `must_apply_fact` on correct-mode cases is expected-red now |

Assertions that depend on the reasoning pass or the collaborative loop are
expected to be red in stub mode; the point of step 1 is that the machinery
**runs and reports**, not that a stub passes the judgment bar.

## Files

```
scripts/agent-eval/
  run.ts                 CLI + reporting
  cases.ts               golden-set loader + schema validation
  pack.ts                stand-in briefing-pack builder (→ context.ts, step 3)
  eligibility-stub.ts    stand-in verdict (→ runEligibilityChecks, step 3)
  refs.ts                claim-source ref convention (shared by reasoner + G1)
  stub-reasoner.ts       deterministic stub output (→ reason.ts, step 4)
  fixtures-build.ts      pinned_refs → committed snapshots (read-only)
  graders/gates.ts       G1–G7 + case assertions
  graders/judge.ts       R1–R7 placeholder (step 4)
  reports/               committed run reports
```

Shared contract types live in `src/lib/agent/types.ts` (imported only by this
runner in step 1; no production route imports it, so flag-off is byte-identical).
