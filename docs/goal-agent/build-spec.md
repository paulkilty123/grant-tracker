# Goal agent build spec — reasoning core + brain architecture

**Status:** build contract, v1. 12 June 2026.
**Scope:** v1 build plan Phases 1–2 (foundations + reasoning core). Onboarding, surfaces, proactive layer (Phases 3–5) are referenced only where they constrain architecture.
**Governing docs:** agent handover (`docs/strategy/agent-build-handover.md`), strategy brief Part two, v1 build plan, functional boundary, tier map. Where this spec and those conflict, those win.

---

## 1. What is being built

The reasoning core of the Companion (Strategise) tier: a goal-driven reasoning pass that takes the persistent org model + a defined goal + the outputs of the existing deterministic engines, and produces a small number of prioritised, sequenced, cited recommendations — plus the collaborative loop that lets the user challenge, correct and constrain it, with corrections persisting.

What it is **not**: a chat product, an application builder, a CRM, the central brain, or a replacement for the matcher/eligibility engines. It wraps the engines; it does not rebuild them.

The quality bar (from the handover and build plan): the MCP-capture bar, consistently — lead with the real constraint, sequence, rule out with reasons, firm on facts / transparent on judgment — measured against the eval harness (`eval-harness.md`), to the consistency bar for heartland (Jen-archetype) situations.

---

## 2. Isolation and branching (report-back per handover)

The live site must keep working throughout. Approach:

- **Branch:** all agent work on a dedicated branch (suggested: `agent/v1-core`), never `main`. Vercel preview deployments are the test surface. Switchover = merge + promote, previous deployment kept as instant rollback.
- **New code in new directories only:**
  - `src/lib/agent/` — context assembly, reasoning pass, output contract, collaborative loop, cost instrumentation.
  - `src/app/api/agent/` — the agent API routes (run, feedback, facts).
  - `scripts/agent-eval/` — the eval runner (see `eval-harness.md`).
  - No edits to existing live routes, the landing page, or `src/lib/matching.ts` / `src/lib/eligibility.ts` beyond *additive* exports if strictly needed (prefer adapters in `src/lib/agent/`).
- **Feature flag:** `AGENT_ENABLED` env var + per-org allowlist (cohort orgs first). Server-side check in every `src/app/api/agent/*` route; no agent UI renders unless flagged. Flag off = production byte-identical behaviour.
- **Database:** all schema changes additive and reversible (new tables only, no column mutations on existing tables — one nullable column exception noted in §5.6). Applied via a Supabase branch first, merged when the agent branch merges. **No schema is applied as part of this spec session.**
- **Model spend isolation:** agent inference behind its own env-keyed client wrapper (`src/lib/agent/llm.ts`) so cost instrumentation and caps (§8) apply only to agent traffic and can be killed independently.

---

## 3. Architecture overview — three layers and a brain

```
┌─────────────────────────────────────────────────────────────┐
│ SURFACES (Phase 4+, not this spec)                           │
│ goal dashboard · agent view in find-funding/pipeline ·       │
│ contextual conversation · email digest · (future) auth'd MCP │
├─────────────────────────────────────────────────────────────┤
│ REASONING CORE (this spec, Phase 2)                          │
│ context assembly → reasoning pass → recommendation set       │
│ + collaborative loop (challenge / correct / constrain)       │
├─────────────────────────────────────────────────────────────┤
│ DETERMINISTIC ENGINES (existing, reused as-is)               │
│ computeMatchScore (matching.ts) · runEligibilityChecks       │
│ (eligibility.ts) · funder_brief w/ citation snippets ·       │
│ grants-normalise · pipeline · interactions                   │
├─────────────────────────────────────────────────────────────┤
│ BRAIN (persistent state)                                     │
│ org model (organisations + org_facts) · goals · agent_runs · │
│ recommendations · outcome links · consent · events           │
└─────────────────────────────────────────────────────────────┘
```

**The brain in v1 is the persistent per-org layer only.** The central brain (cross-org learning) is explicitly not built; v1's whole obligation to it is clean capture + consent foundations (§5.7, §10), per the strategy brief ("get it right and the compounding starts quietly from day one").

Key architectural commitments, from the brief:

1. **One persistent org model, every surface reads and writes it.** No surface-local state that the agent can't see.
2. **Facts come from engines and verified fields; judgment comes from the model.** The LLM is never the source of a deadline, an amount, an eligibility verdict, or a funder claim. It composes, prioritises, sequences and explains over verified inputs.
3. **Reasoning persists.** Every run, every recommendation, every correction is a row, not an evaporating completion.

---

## 4. The deterministic floor (what already exists, verified 12 Jun 2026)

| Asset | Location | What the agent gets from it |
|---|---|---|
| Match scoring | `src/lib/matching.ts` — `computeMatchScore(grant, org, feedback?) → MatchResult` | 6-dimension score + breakdown + reasons. Used to shortlist candidates, never as the final ranking the user sees (the agent re-prioritises against the goal). |
| Eligibility engine | `src/lib/eligibility.ts` — `runEligibilityChecks(opp, org) → EligibilityVerdict { status, issues[{code, severity, message}], reason }` | Pure module, no I/O. The **only** permitted source of eligibility claims. Issue codes become the agent's rule-out reason codes. |
| Funder briefs + citations | `scraped_grants.funder_brief` JSON: `what_they_fund`, `who_can_apply`, `decision_timeline`, `open_status`, `how_to_apply`, … plus `citations.{field} = { snippet, confidence }` | Verbatim source snippets per field — the citation primitive. The agent cites these snippets; it never paraphrases a brief field without carrying its citation. |
| Normalised grant shape | `src/lib/grants-normalise.ts` → `GrantOpportunity` (incl. `amountUndisclosed`, `isRolling`, `nextOpenDate`, `eligibleStructures`, `minOrgIncome`/`maxOrgIncome`, si_/prog_/ik_ fields) | Honest-absence semantics already modelled (`amountUndisclosed` ≠ unknown; `isRolling`; `open_status='between_rounds'`). The agent must surface these as-is, never fill them. |
| Org profile | `organisations` table / `Organisation` type (`src/types/index.ts:141`) — legal_structure, impact_sectors, niche_tags, excluded_niche_tags, beneficiary_groups, annual_income_band, funding_type_preferences, mission, … | The org half of the org model. Extended, not replaced, by §5. |
| Pipeline | `pipeline_items` (stages identified→applying→submitted→won/declined, amounts, deadlines, outcome_date/notes) | Pipeline state for gap/pacing arithmetic; `won`/`declined` stages are the outcome substrate (§5.6). |
| Capture layer | `src/lib/events/` (taxonomy v1, `emit.ts`), `events` table (migration 024) | The instrumentation rail. Agent events are added to this taxonomy (§8), not a parallel system. |
| Debug endpoints | `/api/debug/match`, `/api/debug/eligibility` | Existing per-case inspection; the eval harness complements (not replaces) these. |

Known engine artefacts to respect (from session memory; do not "fix" them mid-build): three independent `primaryDomainMismatch` veto paths in matching.ts; structure-mismatch caps at 44; uniform ~30% scores usually mean a wrong `legal_structure` in the profile, not a catalogue problem.

---

## 5. Data model — proposed additive schema (NOT applied this session)

All new tables, `public` schema, RLS scoped by `org_id` like existing tables. Names final unless implementation finds a conflict. From 30 Oct 2026 Supabase policy, new tables need explicit GRANTs — bake into the migration.

### 5.1 `goals`

The compass. One active goal in v1 (schema supports many for the Fuller tier later — headroom, not build).

```sql
create table public.goals (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organisations(id) on delete cascade,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  status          text not null default 'active',        -- active | achieved | abandoned | superseded
  title           text not null,                          -- "2026/27 operating year"
  target_amount   integer not null,                       -- pence or whole pounds: whole pounds, consistent with amount_min/max usage
  secured_amount  integer not null default 0,             -- updated from pipeline 'won' + manual entry
  start_date      date not null,
  end_date        date not null,
  mix_targets     jsonb,        -- { "grant": 60, "contract": 20, "corporate": 10, "investment": 10 } percentages; null = no mix target
  milestones      jsonb,        -- [{ "label", "amount", "by_date" }]
  constraints     jsonb,        -- [{ "kind": "wont_take" | "must_be" | "note", "text", "source": "wizard" | "conversation", "created_at" }]
  source          text not null default 'wizard'          -- wizard | upload | conversation
);
```

Notes: `constraints` here are *goal-level* (what the org won't take money for). Org-level learned context lives in `org_facts` (5.3). `secured_amount` is derived-but-cached: recomputed from pipeline won-stage amounts on read where cheap, stored for the dashboard.

### 5.2 `agent_runs`

One row per reasoning pass. Reasoning persists rather than evaporating per query (build plan Phase 1).

```sql
create table public.agent_runs (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organisations(id) on delete cascade,
  goal_id         uuid references goals(id) on delete set null,
  created_at      timestamptz not null default now(),
  trigger         text not null,            -- user_request | refresh | feedback_followup | digest | eval
  context_digest  jsonb not null,           -- the briefing-pack summary actually sent (§6.1): ids + hashes, NOT full text
  model           text not null,
  prompt_version  text not null,            -- pin prompts; the eval harness regresses on this
  input_tokens    integer,
  output_tokens   integer,
  cost_estimate_microgbp integer,           -- per-run cost instrumentation (build plan: cost controls from the start)
  status          text not null default 'complete',  -- complete | error | guardrail_blocked
  narrative       text,                     -- the run-level readout (the "lead with the real constraint" paragraph)
  raw_output      jsonb                     -- full structured output for audit/eval replay
);
```

### 5.3 `org_facts` — the learned half of the org model

What the collaborative loop writes. The visible, editable "what I've learned about you" is a straight render of this table — the consent-and-transparency design from the brief is a feature of the schema, not a UI afterthought.

```sql
create table public.org_facts (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organisations(id) on delete cascade,
  created_at      timestamptz not null default now(),
  kind            text not null,        -- correction | constraint | context | relationship | history
  fact            text not null,        -- "Declined by Esmée Fairbairn, Jan 2026, at stage 2"
  structured      jsonb,                -- optional machine-usable form: { "funder": "...", "opportunity_id": "...", "action": "exclude" | "deprioritise" | "note" }
  source          text not null,        -- user_stated | user_correction | inferred_confirmed
  status          text not null default 'active',   -- active | retracted (user can delete; deletion is honoured, row soft-retired for audit)
  last_applied_run_id uuid references agent_runs(id) on delete set null
);
```

Rules: the agent may **propose** a fact from conversation but it only becomes `active` when user-stated or user-confirmed (`inferred_confirmed`). Facts with `structured.action = 'exclude'` are hard filters in context assembly — an excluded funder never reappears as a recommendation (eval case GS-11 enforces this).

### 5.4 `agent_recommendations`

```sql
create table public.agent_recommendations (
  id              uuid primary key default gen_random_uuid(),
  run_id          uuid not null references agent_runs(id) on delete cascade,
  org_id          uuid not null references organisations(id) on delete cascade,
  goal_id         uuid references goals(id) on delete set null,
  created_at      timestamptz not null default now(),
  position        integer not null,         -- 1..5, sequence order
  action_type     text not null,            -- apply | prepare | investigate | hold | rebalance | relationship
  opportunity_id  uuid references scraped_grants(id) on delete set null,  -- catalogue UUID, nullable (mix/rebalance advice has no row)
  title           text not null,
  why             text not null,            -- the 2-3 scannable sentences (brief: primary v1 design priority)
  facts           jsonb not null,           -- claim ledger: [{ "claim", "source": { "kind": "catalogue_field" | "engine_verdict" | "org_model" | "brief_citation", "ref", "snippet" } }]
  judgments       jsonb not null default '[]',  -- [{ "claim", "basis" }] — transparently marked reasoning
  sequencing_note text,                     -- "after the X decision lands" / "before the Y deadline window"
  status          text not null default 'open',  -- open | accepted | dismissed | superseded | expired
  user_feedback   text,                     -- free text from dismiss/challenge
  pipeline_item_id uuid references pipeline_items(id) on delete set null  -- set when acted on (§5.6)
);
```

`rule_outs` are stored on the run (in `raw_output`), not as recommendation rows — they're explanation, not action. Each rule-out: `{ opportunity_id, reason_code (eligibility issue code or agent code), detail, source }`.

### 5.5 Consent foundations

One additive table; no behavioural use in v1 beyond recording it.

```sql
create table public.data_consent (
  org_id          uuid primary key references organisations(id) on delete cascade,
  agreed_at       timestamptz,
  version         text,                     -- consent copy version
  contribute_patterns boolean not null default false,  -- the central-brain question, asked honestly at agent onboarding
  export_requested_at timestamptz           -- permanence/export promise hook
);
```

The contribution question is asked once at agent onboarding in plain language; defaults to false; nothing cross-org is computed in v1 regardless. This exists so the central brain can later distinguish data that was contributed knowingly from data that wasn't — retrofitting consent is the thing the brief says cannot be done.

### 5.6 Outcome capture from day one (handover non-negotiable)

Mechanism, smallest honest version: `agent_recommendations.pipeline_item_id` links a recommendation to the pipeline item it produced; pipeline stages `won` / `declined` (+ `outcome_date`, `amount_requested`) already exist. **Funding won via an agent recommendation = join, not new infrastructure.** One nullable column on `pipeline_items` is the single permitted existing-table change: `source_recommendation_id uuid null` (the reverse link, set when "add to pipeline" is clicked from a recommendation — survives recommendation deletion via `on delete set null`). Both the credibility metric and the future brain's learning substrate read from this join.

### 5.7 Events (additive taxonomy entries, no schema change)

New event types in `src/lib/events/taxonomy.ts` (payload-shape rules already governed there, SCHEMA_VERSION bump not needed for additions): `agent_run_completed` (run_id, trigger, model, input_tokens, output_tokens, recommendation_count, duration_ms), `recommendation_shown`, `recommendation_accepted`, `recommendation_dismissed` (reason), `org_fact_added` (kind, source), `org_fact_retracted`, `goal_created`, `goal_updated`. Existing rules apply: catalogue UUIDs only, no PII, no full conversation text.

### 5.8 Schema headroom (design only, do not build)

- Multiple goals: already supported by `goals` being one-to-many.
- Seats/roles: keyed by `org_id` everywhere + `created_by` pattern from `pipeline_items`; no user-scoped agent state.
- Relationship-shaped funding category: `corporate_partners` table already exists; `action_type = 'relationship'` reserves the recommendation vocabulary. Nothing else.
- Application builder: `application_drafts` / `application_reviews` exist from builder v0.x; recommendations can link forward later via `action_type = 'apply'` + the existing builder path. No coupling now.

---

## 6. The reasoning core

### 6.1 Context assembly — the briefing pack (deterministic, no LLM)

`src/lib/agent/context.ts`. Pure function: `(org, goal, pipeline, org_facts, catalogue) → BriefingPack`. Fully testable without a model; the eval harness exercises it directly.

Assembly steps, in order:

1. **Goal arithmetic (computed here, never by the model).** Target, secured, in-pipeline (weighted and unweighted), gap, time remaining, required run-rate, mix actual vs mix target, concentration metrics (share of pipeline in single funder / single opportunity / amount band). These are *inputs* to the model, so its "lead with the real constraint" judgment starts from correct numbers. The model never does arithmetic the pack already did (eval gate G6).
2. **Candidate shortlist.** `computeMatchScore` over active catalogue for the org → top N (N≈40) by score, **then** `runEligibilityChecks` on each. Nothing engine-marked `ineligible` (blocker-severity) enters the candidate list as a candidate — it may enter the *rule-out annex* with its engine reason. Hard filters stay hard, soft signals stay soft (memory: filter-vs-rank silent exclusion class — every exclusion in assembly must be attributable to either an engine blocker or an `org_facts` exclude; log counts in `context_digest`).
3. **Per-candidate fact card.** For each shortlisted opportunity: verified fields (deadline / isRolling / nextOpenDate / open_status, amounts incl. `amountUndisclosed`, eligible structures, location_tag, funding type + subtype), eligibility verdict + issues, match breakdown reasons, funder_brief fields **with their citation snippets and confidence**. Null fields carried explicitly as null with their honest-absence semantics — never dropped (a dropped null invites the model to fill it).
4. **Org facts injection.** Active `org_facts`: excludes applied as filters (logged), notes/relationships/history appended to the org block.
5. **Pipeline state.** Current items, stages, deadlines, amounts; recently won/declined with dates.
6. **Coverage honesty block.** Catalogue-side thinness signals for the org's geography/sectors (reuse the MCP `coverage_note` machinery from `mcp-search.ts` where extractable). The model is told where the catalogue is thin so honest scope-limiting is grounded, not vibes.
7. **`context_digest`.** Ids + content hashes of everything sent, persisted to `agent_runs` — replayability for eval and audit.

### 6.2 Reasoning pass

`src/lib/agent/reason.ts`. One LLM call per run (v1; no multi-agent orchestration — cost and consistency both argue for one well-fed pass).

- **Models:** default `claude-sonnet-4-6` (already in use in the codebase for reasoning-grade tasks). Scaffolding/iteration during the Fable free window (ends 22 Jun) may use Fable; Opus as quality fallback if Sonnet misses the bar on eval. Model id is a config constant in `src/lib/agent/llm.ts`, recorded per run. Cheap subtasks (e.g. summarising a long user correction into a fact row) use `claude-haiku-4-5`.
- **Prompt layout for caching (§8):** static system prompt (versioned, `prompt_version`) → org model block (stable per org, cache-friendly) → goal + pipeline block → candidate fact cards → task instruction. Order chosen so the long-lived prefix is cacheable.
- **System prompt encodes the behaviour contract** (Part two, as instructions): lead with the real constraint; recommend at most 5 actions; sequence and say why this order; rule out near-misses with reasons; every factual claim must reference a provided source by id — if it isn't in the pack, it isn't a fact you may state; mark strategic judgment as judgment; honest verdicts including "nothing here moves your goal this month"; never guarantee funding; consultant test; kind challenge (push back constructively when the user's stated intent conflicts with the goal arithmetic, while respecting their decision); British English, sentence case.
- **Structured output (tool-enforced):** the model must emit the recommendation-set JSON (§6.3) via a forced tool call — not prose-then-parse. Memory lesson (silent catch hides max_tokens): log `stop_reason` and retry-with-larger-budget on `max_tokens` before failing; never swallow.

### 6.3 Output contract

```ts
interface AgentRunOutput {
  narrative: string                  // ≤120 words: the constraint-led readout
  recommendations: Recommendation[]  // 1..5, ordered
  rule_outs: RuleOut[]               // near-misses worth explaining, each with reason_code + source
  flags: Flag[]                      // risk/pacing/concentration flags, each fact-grounded
  questions: Question[]              // ≤2, only when answering would change a recommendation (just-in-time context, value-before-effort)
  learned: string[]                  // restatement of any org_facts applied this run (the visible loop)
}

interface Recommendation {
  action_type: 'apply'|'prepare'|'investigate'|'hold'|'rebalance'|'relationship'
  opportunity_id: string | null      // catalogue UUID or null for non-catalogue actions
  title: string
  why: string                        // 2-3 scannable sentences
  facts: Claim[]                     // every claim: { claim, source: { kind, ref, snippet? } }
  judgments: Claim[]                 // { claim, basis } — no source required, marked as reasoning
  sequencing_note: string | null
}
```

**Render-side enforcement (anti-hallucination is core, not polish):** the renderer (and the eval) validates before anything is shown or stored as `complete`:

- every `facts[].source.ref` resolves to something actually in the briefing pack (catalogue field, engine verdict, brief citation snippet, org-model field);
- every `opportunity_id` exists in the pack;
- eligibility-flavoured claims have `source.kind = 'engine_verdict'`;
- deadline/amount claims match the pack values verbatim (no "around", no inferred dates);
- counts: ≤5 recommendations, ≤2 questions.

Violations → run stored as `guardrail_blocked`, user sees an honest "I couldn't produce a reliable readout" rather than unverified output. Fail toward honesty.

### 6.4 Collaborative loop (v1 scope per brief: interrogate + correct + constrain)

`src/app/api/agent/feedback` + `src/lib/agent/facts.ts`.

- **Challenge ("why this?")** — answered from the stored run (`raw_output` facts/judgments expanded), deepening on request with a follow-up model call that may only cite the original pack. No new facts enter via a challenge.
- **Correct ("that's wrong / we already know them / we were declined")** — Haiku-summarised into a proposed `org_facts` row, shown for one-tap confirm, then `active`. Next run visibly confirms via `learned[]`. Corrections that contradict the *catalogue* (not the org) are routed differently: flagged as data feedback (existing `match_feedback`/feedback rails), because users correcting catalogue errors is QC signal, not org context.
- **Constrain ("don't show us X / we won't take Y money")** — `org_facts` with `structured.action = 'exclude'` (filter) or goal `constraints` (reasoning context), depending on scope; the wizard and conversation both write the same shapes.
- **Honest disagreement** — v1 keeps the simple form: when a user instruction conflicts with goal arithmetic, the agent complies in action and notes its view once, in `judgments`, without nagging (the nuance ladder beyond this is post-v1 per build plan).

### 6.5 Off-goal requests

The goal is the default lens, never a cage. Off-goal asks (equipment, capacity-building — Jen's CRM-search case) run the same pass with the task instruction switched to the ask, goal context retained for the "relating it back" sentence. Same citation rules. No separate code path beyond the instruction switch.

---

## 7. Design principles → enforced mechanisms

Every Part-two principle has a mechanism; none is left as prompt vibes.

| Principle | Mechanism | Checked by |
|---|---|---|
| Load-reduction | Hard cap 5 recommendations + ≤120-word narrative + ≤2 questions; "no-op is a valid run" (an honest "nothing new this week" beats noise) | Gate G4 + case GS-14 |
| Value before effort | Agent runs usefully off the existing light profile + goal wizard minimum; every additional context ask must be a `questions[]` item that would change a recommendation | Case GS-16; question-utility rubric |
| Firm on facts / transparent on judgment | Separate `facts[]` (source-required) vs `judgments[]` (marked) in the contract; render-side validation | Gates G1–G3, rubric R4 |
| Honesty / fail toward honesty | Null-honesty rules; coverage block; `guardrail_blocked` over degraded output; "not a fit" verdicts with engine citations; no funding guarantees (lint list in system prompt + grader regex) | Gates G5, G2; cases GS-08/09/10/15 |
| Kind challenge | Disagreement protocol (§6.4); challenge-inviting phrasing in outputs ("challenge this if it doesn't match reality") | Rubric R6; case GS-02 |
| Consultant test | LLM-judge rubric anchor question: "would a senior fundraising consultant agree?" | Rubric R5 |
| Context accrued through use | `org_facts` written from normal use (corrections, dismissals with reasons); no upfront forms beyond the 10-min wizard | Design review; no eval |

---

## 8. Cost controls and instrumentation (in from the start)

- **Prompt caching:** static system prompt + org block as cacheable prefix (§6.2 ordering). Target: repeated runs within a session hit cache on the bulk of input tokens.
- **Model tiering:** Sonnet for the reasoning pass, Haiku for summarisation subtasks, judge model for eval only. No Opus in the default path unless eval forces it.
- **Per-run accounting:** input/output tokens + cost estimate on every `agent_runs` row + `agent_run_completed` event. This is the data the tier prices get set against — it is product-critical, not ops hygiene.
- **Caps:** per-org daily run cap (config, generous: normal use never hits it — the functional boundary's "generous but bounded" rule) + global daily spend kill-switch env var. Background/digest triggers respect a stricter budget than user-initiated runs.
- **Server-side enforcement** (week-1 security theme: client-side limits don't count).

---

## 9. Build guardrails (repo-specific hazards, from session memory)

Mistakes this codebase has already taught; the agent build must not re-learn them:

1. **Id discipline.** `grant_interactions.grant_id` is text with legacy non-UUID ids; `match_feedback.grant_id` stores external_id; normalised `grant.id = external_id ?? id`. The agent layer uses **catalogue UUIDs only** (`scraped_grants.id`), converting at boundaries — same rule the events taxonomy already enforces (`toCatalogueUuid`).
2. **Push filters to the DB.** No `.limit(N)` + JS post-filter in context assembly; no post-filter reading columns missing from the SELECT (silent pass-through).
3. **No JS shadow files.** New agent modules are `.ts` only; check for stale `.js` siblings if an edit ever has no effect.
4. **Detect-only-adds.** Any extractor/merger in the agent path (e.g. fact summarisation) must explicitly null on no-match, never silently keep stale values.
5. **Enum drift.** Any TS union persisted to Postgres (run status, fact kind, action_type) ships with a matching CHECK constraint or enum in the same migration; verify `enum_range` before extending.
6. **Next.js page exports.** Agent UI pages export only default + metadata; helpers go to `src/components/` or `src/lib/agent/`.
7. **Crons.** Hobby tier = daily-only schedules; the digest (Phase 5) plans for daily, never sub-daily, and any cron change is verified with `vercel --prod` CLI (silent-rejection trap).
8. **Scraped-field volatility.** The agent never writes to `scraped_grants` (crawler would overwrite anyway); catalogue corrections route through existing merger/admin rails.
9. **TypeScript clean before every commit** (`npx tsc --noEmit`), commit after every file change, on the agent branch.

---

## 10. What is NOT in this build (headroom only)

Per handover and build plan exclusions: application builder integration (link vocabulary reserved only), CRM/relationship layer (one `action_type` reserved), team/seats/roles, central brain computation of any kind, sector insights, funder-side anything, live web search in the agent path, contracts-as-funding-type, multiple goal templates beyond mixed-income operating fundraising, authenticated MCP agent surface (the MCP stays the free catalogue-reasoning surface; the agent's MCP surface is a future phase).

---

## 11. Sequencing and definition of done

Order of implementation (each step lands on the agent branch, tsc-clean, behind the flag):

1. **Eval runner** (`scripts/agent-eval/`) executing the seeded golden set against a stub reasoner — proves harness mechanics before any model call. *Gate: all 16 cases load, fixtures resolve, hard-gate graders run.*
2. **Migrations authored** (not applied to prod; Supabase branch) for §5 tables.
3. **Context assembly** (`src/lib/agent/context.ts`) + unit-style eval of goal arithmetic and filter attribution against golden-set fixtures.
4. **Reasoning pass + output contract + render-side validation.** First full eval run; baseline scores recorded.
5. **Collaborative loop** (facts API + correction flow). Cases GS-11/12 pass.
6. **Iteration loop** — the judgment-paced weeks: prompt versions regressed against the harness, heartland cases to the consistency bar (eval-harness §6). *This is where elapsed time lives; do not start it before steps 1–5 are green.*

**Definition of done for the reasoning core (Phase 2 exit):** full golden set passes hard gates at 100% across 3 consecutive runs; heartland family (GS-01/02/07/14/16) meets the consistency bar; per-run cost instrumented and within budget envelope; flag-off production verified byte-identical; Paul has reviewed a transcript pack of all 16 case outputs and signed off the bar subjectively (the consultant test is ultimately his call, then the cohort's).
