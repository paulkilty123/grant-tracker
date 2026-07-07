# Mix rulebook v0.1 + stage weights — review pack

**Status: DRAFT, awaiting Paul's line-by-line review. Both tables are ship gates** (design spec §9): the rulebook gates the mix recommendation going live to users; the stage weights gate the weighted-pipeline figure being presented as trustworthy. The build is not gated — `recommend_mix` and `STAGE_WEIGHTS` are live in code at these draft values.

**How to mark up:** per row — `OK` / corrected split / corrected reasoning / `CUT`. Add rows for categories the draft misses. The code (`src/lib/agent/tools/mix.ts` RULEBOOK, `src/lib/agent/context.ts` STAGE_WEIGHTS) is updated from this document after review, and the version strings move off `-draft`.

**Vocabulary (fixed by the spec, not under review):** mix is expressed in funding character — `unrestricted`, `project`, `capital`, `investment`. Sources (corporate, contracts, trusts) are attributes of opportunities within the mix.

---

## 1. The rulebook: purpose category → mix split → stated reasoning

The reasoning column is delivered VERBATIM by the Companion as the firm, rule-derived register — it is product copy, not an implementation note.

| # | Category | Example purposes | Mix split | Reasoning the Companion states | Review |
|---|---|---|---|---|---|
| R1 | `core` | rent, utilities, admin, "keeping the lights on" | unrestricted 100 | "Core running costs point at unrestricted funders — harder to win, but each award covers months of running costs rather than one activity." | |
| R2 | `programme` | delivery of a named programme or service | project 85 · unrestricted 15 | "Programme delivery maps to project funding, with a slice of unrestricted to keep overhead recovery honest." | |
| R3 | `staffing` | new posts, salaries | unrestricted 50 · project 50 | "Posts split by what the role serves: delivery posts sit in project budgets; organisational posts need unrestricted income." | |
| R4 | `capital` | equipment, vehicles, building work | capital 100 | "Equipment and building costs sit with capital funders — a distinct funder population from revenue grants." | |
| R5 | `capacity` | systems, training, organisational development | project 70 · unrestricted 30 | "Capacity building is fundable as a defined project by infrastructure funders; some support it through unrestricted grants." | |
| R6 | `working_capital` | cashflow ahead of contracted income (venture) | investment 100 | "Working capital ahead of contracted income is repayable-finance territory: describe the landscape and signpost readiness support; the decision to borrow is never advice this tool or its caller gives." | |
| R7 | `other` | anything that fits no category | — no rule (deliberate) | — routes to the fallback below | |

**Open questions on the rows:**
- R2/R5: are 85/15 and 70/30 the splits you actually advise, or placeholders to replace wholesale?
- R3: should staffing instead *ask* (delivery post vs organisational post) rather than fix 50/50? That would be a rulebook feature (a clarifying sub-question), not just a number change.
- R6: is `investment 100` right for v1, or should working_capital route entirely off-rulebook until the venture fork ships (it is gated behind the SI catalogue audit anyway)?
- Missing categories? (e.g. reserves building, match funding for a confirmed grant, deficit recovery.)

## 2. Off-rulebook fallback behaviour (Layer 2 — also reviewable)

- A purpose whose category has no rule (today: `other`) comes back marked `off_rulebook: true` with no mapping and no reasoning.
- The Companion must present its own reasoning for those purposes **explicitly as its judgment, not a standard mapping** (steering in the tool description + orchestrator prompt; CV-07 polices the register).
- Every firing logs a `mix_fallback_fired` event (categories + rulebook version) — the rulebook grows from real usage exactly as the catalogue does.
- The blended `recommended_mix` covers only rule-derived purposes; fallback purposes are additional to it, never silently folded in.

## 3. Blending mechanics (decisions embedded in code — confirm or correct)

| # | Mechanic | Current behaviour | Review |
|---|---|---|---|
| B1 | Weighting | Each purpose's mapping is weighted by its approximate amount | |
| B2 | Missing amounts | A purpose with no stated amount is weighted at the MEAN of the stated amounts (equal weight if none are stated) | |
| B3 | Rounding | Largest-remainder to integers summing exactly 100; zero-percent components dropped | |
| B4 | Totals | `purposes_total` (sum of stated amounts) returned so the Companion can state the total verbatim | |

## 4. Stage weights (the weighted-pipeline figure)

Caption shown wherever the figure renders: **"weighted = amount × stage likelihood"**. V1 weights are fixed and visible; learned weights are a brain feature later.

| Stage | Weight | Reads as | Review |
|---|---|---|---|
| identified | 0.10 | "a 1-in-10 chance while it's just a lead" | |
| applying | 0.30 | "3-in-10 once you're writing it" | |
| submitted | 0.50 | "a coin flip once it's in" | |
| won | 1.00 | counted in full (also feeds derived secured) | |
| declined | 0.00 | contributes nothing | |

**Open questions:** is 0.5 at submitted too generous for competitive national funds (sector benchmarks often sit nearer 0.25–0.4)? Should `identified` count at all — 0.1 across a fat top-of-funnel can inflate the weighted figure an anxious user leans on?

## 5. Sign-off

- [ ] Rulebook rows R1–R7 marked up and final
- [ ] Fallback behaviour confirmed
- [ ] Blending mechanics B1–B4 confirmed
- [ ] Stage weights confirmed
- [ ] Code updated from this doc; versions move off `-draft` (`mix-rules-v0.1-draft` → `mix-rules-v1`); evals re-run

Once signed off, this document is the canonical statement of the rulebook; the code is its implementation.
