# Goal-agent eval — stub run (build step 1)

Mode: `stub`  ·  cases: 16  ·  fixtures resolve: 16/16  ·  hard gates pass: 16/16  ·  assertions pass: 10/16

> Stub reasoner, no LLM. Hard gates are real; the rubric judge (R1–R7) and the correction loop land in build steps 4–5, so some assertions are expected-red here.

| Case | Family/Mode | Fixtures | Gates | Assertions | Notes |
|---|---|---|---|---|---|
| GS-01 | heartland/recommend | ok | 7/7 | 3/3 | 2 pinned ref(s) not in snapshot — running on synthetics + pool (see fixtures-build.ts) |
| GS-02 | heartland/converse | ok | 7/7 | 1/1 | — |
| GS-03 | cohort/recommend | ok | 7/7 | 2/3 | must_not_recommend |
| GS-04 | cohort/recommend | ok | 7/7 | 1/1 | — |
| GS-05 | cohort/recommend | ok | 7/7 | 3/3 | 2 pinned ref(s) not in snapshot — running on synthetics + pool (see fixtures-build.ts) |
| GS-06 | cohort/recommend | ok | 7/7 | 2/3 | must_rule_out |
| GS-07 | heartland/recommend | ok | 7/7 | 2/3 | max_recommendations |
| GS-08 | integrity/converse | ok | 7/7 | 2/3 | must_rule_out |
| GS-09 | scope-honesty/recommend | ok | 7/7 | 3/3 | 2 pinned ref(s) not in snapshot — running on synthetics + pool (see fixtures-build.ts) |
| GS-10 | scope-honesty/recommend | ok | 7/7 | 2/3 | must_rule_out |
| GS-11 | collaborative/correct | ok | 7/7 | 1/3 | must_apply_fact, must_apply_fact |
| GS-12 | collaborative/recommend | ok | 7/7 | 4/4 | 1 pinned ref(s) not in snapshot — running on synthetics + pool (see fixtures-build.ts) |
| GS-13 | integrity/converse | ok | 7/7 | 2/2 | — |
| GS-14 | heartland/recommend | ok | 7/7 | 2/2 | — |
| GS-15 | integrity/recommend | ok | 7/7 | 3/3 | — |
| GS-16 | heartland/recommend | ok | 7/7 | 2/2 | — |
