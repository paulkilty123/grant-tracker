# Goal agent — build spec and eval harness

Spec-and-eval session output, 12 June 2026. Per delivery plan v2 week 1: "Goal agent: spec + golden set/eval harness FIRST (per agent handover sequencing)."

## What's in this directory

| File | What it is |
|------|------------|
| `build-spec.md` | The goal agent build spec: reasoning core + brain architecture, data model proposal, isolation plan, build guardrails. The build contract for the implementation sessions. |
| `eval-harness.md` | The reasoning eval harness design: hard gates, judgment rubric, runner architecture, consistency bar. The handover's non-negotiable prerequisite. |
| `golden-set/schema.md` | The golden-set case format: anatomy of a case, fixture strategy, assertion types. |
| `golden-set/cases/*.json` | 16 seeded cases, grounded in the active cohort profiles (members A–F from the MCP first-encounter set) and the strategy brief evidence log (Jen, Emma, David, Philomina archetypes). |

## Source documents (canonical, read in this order)

1. `docs/strategy/agent-build-handover.md` — design principles + sequencing. This directory exists because of its instruction: eval harness before reasoning iteration.
2. `docs/strategy/strategy-brief.docx` — Part two governs agent behaviour.
3. `docs/strategy/v1-build-plan.html` — phases; this spec covers Phase 1 (foundations) and Phase 2 (reasoning core).
4. `docs/strategy/functional-boundary.html` — free/paid line. Tier gating is launch-time; build ungated.
5. `docs/strategy/tier-customer-map.html` — the Companion (Strategise) tier is the agent's home.

## Prerequisite status report (the handover asks for this before building)

The handover says: confirm the state of the previously commissioned work before building on top of it. As of 12 June 2026, in this working tree:

- **Reasoning eval harness + golden set: did not exist.** Correction to this report's first draft: a **matcher regression suite DOES exist** — `src/app/api/admin/golden-queries/route.ts` (14 synthetic org scenarios, regex assertions over funder inclusion/exclusion and score thresholds, run weekly by the Tuesday cron in `vercel.json`). It was missed by file-pattern search because it lives as an API route, not a test file. It guards the *matcher*, not *reasoning quality* — results are not persisted and there is no expected-output comparison — so the reasoning eval remained the genuine gap. Other adjacent assets: the two debug endpoints (`/api/debug/match`, `/api/debug/eligibility`) and the MCP first-encounter query set (`docs/mcp-first-encounter-test-queries.md`, 14 prompts + cohort profiles, no captured responses in-repo). **This session designs and seeds the reasoning harness — that gap is now closed at the design level; the runner build is the first implementation task.**
- **Field-by-field data bar: partial, not documented as a bar.** Real data-fidelity work has shipped piecemeal (income gates on ~70 rows, structure re-tagging, location-tag backfill, future-deadline guards) but there is no field-by-field bar document. The eval harness's hard gates (null honesty, citation validity) operationalise the bar for the agent's purposes; a standalone data-bar doc remains open work.
- **Read-only data-shape audit: not found.** Known shape hazards are recorded in session memory and folded into `build-spec.md` §9 (build guardrails) so the agent build doesn't trip them. A formal audit doc remains open work.

None of the three blocks the reasoning-core build *start*, because the harness now exists at design level and the guardrails are explicit — but the iteration loop (Phase 2's judgment-paced work) must not begin until the runner is built and the seeded cases execute end to end.

## Hard constraints honoured by everything here

- **Build in isolation.** No live-site edits, new code in new directories, dedicated branch, feature-flagged, additive-and-reversible schema only (proposed in spec, applied later on a Supabase branch). Switchover is one deliberate reversible action.
- **This session:** spec and eval design only. No git push, no Supabase schema changes (another session is active in this repo).
