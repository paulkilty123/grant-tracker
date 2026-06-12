# Golden-set case schema

**Version 1.** Cases live in `cases/GS-*.json`, one file per case. The runner (`scripts/agent-eval/run.ts`, to be built) validates every case against this shape before running anything.

## Case anatomy

```jsonc
{
  "id": "GS-01",                  // stable id, never reused
  "version": 1,                   // bump on any material edit; reports key on id+version
  "family": "heartland",          // heartland | cohort | integrity | scope-honesty | collaborative
  "title": "Short human label",
  "provenance": "Where this case comes from (evidence-log entry, cohort member, memory note). Cases must be grounded, not invented.",
  "run_mode": "recommend",        // recommend  — standard reasoning pass
                                  // converse   — user_turn is a question/challenge against prior state
                                  // correct    — user_turn carries a correction/constraint; tests the loop

  // ── Inputs (the world the agent sees) ────────────────────────────────────
  "org": { /* Organisation-shaped subset; only fields the pack uses. Anonymised. */ },
  "goal": {
    "title": "...",
    "target_amount": 0,           // whole pounds
    "secured_amount": 0,
    "start_date": "YYYY-MM-DD",
    "end_date": "YYYY-MM-DD",
    "mix_targets": null,          // or { "grant": 60, ... } percentages
    "constraints": []             // [{ "kind": "wont_take" | "must_be" | "note", "text": "..." }]
  },
  "pipeline": [                   // PipelineItem-shaped subset
    { "grant_name": "...", "funder_name": "...", "stage": "applying", "amount_requested": 0, "deadline": "YYYY-MM-DD" }
  ],
  "org_facts": [                  // pre-existing learned facts (build-spec §5.3 shape)
    { "kind": "history", "fact": "...", "structured": { "funder": "...", "action": "exclude" }, "source": "user_stated" }
  ],
  "user_turn": null,              // string for converse/correct modes
  "as_of": "2026-06-12",          // frozen 'today' for all date arithmetic — cases must be deterministic in time

  // ── Fixtures (the catalogue the agent sees) ──────────────────────────────
  "fixtures": {
    "pinned_refs": [              // resolved to snapshots by fixtures-build.ts (read-only), committed
      { "title": "...", "funder": "..." }
    ],
    "synthetic": [                // inline GrantOpportunity-shaped rows for exact-value integrity tests
      { "fixture_id": "syn-xyz", "title": "...", "funder": "...", "fundingType": "grant", /* ... */ }
    ],
    "filler_pool": null           // optional: named shared pool from fixtures/ to make shortlists realistically crowded (GS-14)
  },

  // ── Expectations ─────────────────────────────────────────────────────────
  "expected": {
    "hard_gates": "all",          // G1–G7 always run; this field exists only to disable a gate with a reason, e.g. {"skip": ["G6"], "reason": "..."} — expected to stay "all"
    "assertions": [               // case-specific deterministic checks against AgentRunOutput
      // shapes:
      { "type": "must_recommend", "fixture_id": "syn-abc" },
      { "type": "must_not_recommend", "fixture_id": "syn-xyz" },
      { "type": "must_rule_out", "fixture_id": "syn-xyz", "reason_code_in": ["income_below_minimum"] },
      { "type": "must_flag", "flag_kind": "concentration" },
      { "type": "max_recommendations", "value": 5 },
      { "type": "must_apply_fact", "org_fact_index": 0 },         // fact must appear in learned[] and bind behaviour
      { "type": "must_not_mention", "terms": ["..."] },
      { "type": "must_acknowledge_thin_coverage", "about": "..." }
    ],
    "rubric_focus": ["R1", "R2"], // 2–4 dimensions double-weighted for this case
    "judge_guidance": "Case-specific instructions to the judge: what a 5 looks like here, what failure smells like. Written for a judge that has the full output + pack."
  },

  "notes": "Anything a future maintainer needs: why this case exists, what it once caught."
}
```

## Rules

1. **Grounded provenance.** Every case traces to a real cohort member, evidence-log entry, or observed failure. Synthetic *fixtures* are fine (exact values are the point); synthetic *situations* are not.
2. **Deterministic in time.** All date logic reads `as_of`. Fixture deadlines are written relative to `as_of` semantics and reviewed when snapshots refresh.
3. **Anonymised.** Cohort cases use the letter ids (A–F) and archetype names from the strategy docs; no real org names in `org` blocks beyond what's already public in the strategy docs.
4. **Assertions over prose-matching.** Checks bind to the structured output contract (ids, reason codes, flags), not to wording — wording is the rubric's business. `must_not_mention` is the narrow exception for fabrication-adjacent terms.
5. **Reason codes** align with `EligibilityIssue.code` from `src/lib/eligibility.ts` where the rule-out is engine-driven; agent-level codes (e.g. `excluded_by_org_fact`, `concentration_hold`) are defined in the output contract as they're implemented. Until the runner exists, codes in cases are normative targets — implementation reconciles them in build step 1.
6. **Synthetic fixture completeness.** Synthetic rows must carry every field a gate will check (deadline, amounts or `amountUndisclosed`, `isRolling`, `eligibleStructures`, `minOrgIncome` etc., funder_brief fields with `citations` snippets where a citation gate applies). A fixture missing a field a case asserts on is a case bug.
