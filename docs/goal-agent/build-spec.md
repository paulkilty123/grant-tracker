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

Notes: `constraints` here are *goal-level* (what the org won't take money for). Org-level learned context lives in `org_facts` (5.3). ~~`secured_amount` is derived-but-cached: recomputed from pipeline won-stage amounts on read where cheap, stored for the dashboard.~~ **SUPERSEDED 9 Jul 2026 (decision, Paul — see §14.3.8):** secured is always **derived on read, never cached**; the stored scalar is killed (kept at most as a computed field in payloads). Off-pipeline secured income (grants won before Grant Tracker, income outside the tracked pipeline) is represented as **pipeline items with `stage='won'` and a source marker** (`manual` / `pre-existing`), not an override field — one representation, one arithmetic path, no snapshot-staleness bug class, provenance and event logging inherited for free, and corrections to secured history are new records, not mutations (supersede-not-delete). Lands with the design-spec package's goals migration.

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

- **Models:** default `claude-sonnet-4-6` (already in use in the codebase for reasoning-grade tasks); `claude-opus-4-8` as the quality fallback if Sonnet misses the bar on eval. Model id is a config constant in `src/lib/agent/llm.ts`, recorded per run. Cheap subtasks (e.g. summarising a long user correction into a fact row) use `claude-haiku-4-5`. (Fable 5 was briefly considered as a free-window scaffolding option; access was suspended 12 Jun 2026, so the deployable set is Sonnet / Opus / Haiku and tier economics must be costed against those.)
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

> On external/web intelligence specifically: **live web search in the reasoning path stays excluded** (cost, the unverified-data trust problem, and it competes with generic AI on breadth — the one battlefield the strategy declines). But the *underlying need* — an agent that reasons with awareness of the sector, not just the database — is real and maps to the central brain's eventual "sector layer." The shape that captures it without the risk is specified as design headroom in §12; the only thing built now is the seam.

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

---

## 12. Design headroom: external/sector intelligence (post-core, not built now)

Captures a decision (14 Jun 2026) so the architecture leaves room without spending build time. **Nothing in this section is built in v1.** The reasoning core hits its §11 consistency bar first; this is a v1.x / brain-Phase-2 increment. What gets done *now* is only the seam (12.4) so adding the feature later is additive, not surgery.

### 12.1 The need, disaggregated

"Let the agent use outside information" is three different things with three different homes. Conflating them is the trap.

| Type | Example | Right home | New build? |
|---|---|---|---|
| **New funding schemes / large announcements** | a new £20m Sport England fund | catalogue ingestion → NR gate → published rows; agent reasons over it as verified data | No — this is catalogue freshness. The 2026-06-12 gap audit + programme sweep *are* this capability run manually (web-research subagents → verify on funder site → stage to NR). Systematise the discovery feed, don't add a runtime web agent. |
| **Funder-specific intelligence** | funder paused, changed priorities, new route in | `funder_brief` freshness, same ingestion pipeline | No — same pipeline, becomes verified + cited normally. |
| **Sector-wide trends / policy** | IVAR open-and-trusting shift, AI-application-volume crisis, funder consolidation, Procurement Act, Charity Digital Skills report | **a curated sector-signals store in the brain** (12.2) | Yes — but post-core, and never as live web search. This is the genuinely new category: not catalogue-shaped (no amount/deadline/eligibility), and it's what a good consultant carries that the agent currently can't. |

The strategy already values type 3 — the brief's evidence log is full of it. The question was never *whether* but *where it lives in the architecture*.

### 12.2 The shape: curated sector-signals store, not a scanner

Reuse the catalogue pattern exactly: **offline discovery → human gate → dated, sourced, verified store → agent reasons over the store, never the live web.**

Proposed additive table (sketch; same "not applied this session" convention as §5):

```sql
create table public.sector_signals (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  approved_at   timestamptz,                      -- null until human-gated (the NR equivalent)
  status        text not null default 'draft',    -- draft | active | expired | retracted
  kind          text not null,                    -- trend | policy | funder_posture | macro
  claim         text not null,                    -- the one-line intelligence item
  source_name   text not null,
  source_url    text not null,
  published_date date,                            -- when the source said it
  review_by     date,                             -- staleness horizon; past it → not retrieved as current
  scope_sectors      text[] default '{}',         -- empty = applies broadly
  scope_regions      text[] default '{}',
  scope_funder_types text[] default '{}',
  confidence    text                              -- how settled the trend is (publisher-level, not org-level)
);
```

Discovery is agent-assisted (the same sweep mechanism already proven), drafting candidates into the queue; Paul approves; approved rows go `active`. **Signals are org-agnostic** — patterns about the landscape, never one org's competitive specifics. This is the central brain's "patterns not playbooks" rule applied early, and it makes the store a clean seed of the brain's eventual sector layer.

### 12.3 The hard line that keeps it safe

A sector signal may **only** enter reasoning through the existing `judgments[]` channel (§6.3) — never `facts[]`, never as the basis of a confident recommendation, never overriding a verified value. This is the brief's "firm on facts, transparent on judgment" discipline applied verbatim: "here's a development worth watching, per [source], [date]." The agent degrades honestly on staleness ("as of March 2026"), exactly as it does on nulls.

This is also the answer to the QC question: quality control is not a new mechanism. It is (a) the **same human gate** as the catalogue NR flow, plus (b) the **same fact/judgment guardrail** the reasoning core already enforces. Two existing disciplines, no third.

### 12.4 The seam to build now (the only v1 cost)

So the later feature is additive, reserve these now and leave them unused:

- **Briefing pack (§6.1):** reserve a `sector_signals: []` slot in the pack shape. In v1 it is always empty. When the store exists, assembly retrieves `active`, in-`review_by`, scope-matching signals into it.
- **Output contract (§6.3):** allow a `judgments[]` entry to carry an optional `signal_ref` (id into `sector_signals`), parallel to how `facts[].source.ref` traces to the pack. Absent in v1 output; present once signals flow.
- **Eval (eval-harness.md):** the gates that police this already exist in shape — extend **G7 (promise lint)** and **R4 (fact/judgment separation)** to cover "sector claim stated as fact" as a failure, and add a small **staleness gate** (a signal past its `review_by` must not be presented as current). Add 1–2 golden cases when the feature is scheduled, e.g. "agent cites a sector trend as if it were a verified fact" → must fail; "agent uses a relevant in-date trend correctly as marked judgment" → must pass.

### 12.5 Recommended first increment (when it's time)

Cheapest version first, almost zero engineering and zero runtime risk: a small hand-curated set of current sector-context notes (you already have them in the evidence log), dated and judgment-tagged, loaded into the **cacheable system-prompt prefix** (§6.2). That gives the agent a consultant's awareness of the moment immediately. The `sector_signals` table + agent-assisted discovery (12.2) is the *scaling* mechanism you add only once the curated version has proven its worth — same crawl-walk-run the catalogue took.

---

## 13. Tool layer + deferred follow-ups

The agent's interface to data/state is the named tool layer `src/lib/agent/tools/` — one layer, two surfaces (in-app orchestrator + gated MCP), envelope on every call (entitlement · authorship · surface-discriminated capture log · provenance). Discipline is in CLAUDE.md → *Goal Agent — Tool Layer Discipline* and enforced by the eslint override on `tools/**`. Built: `add_to_pipeline`, `update_pipeline_item`, `get_plan_state`, `get_briefing`, `assess_opportunity_against_plan`, `get_funding_goal`, `set_funding_goal`. Descriptions live in `tools/index.ts` `TOOL_REGISTRY` (canonical MCP steering); `contract.ts` holds the four load-bearing rules once, from which `reason.ts`'s prompt is derived.

**Resumption order (next session).** The layer is validated in isolation (envelope smoke 13/13; live strategist end-to-end against the real `goals` table + 647-row catalogue, `scripts/agent-eval/live-strategist.ts`). Next: (1) **orchestrator wiring first** — mount the tools behind an in-app route and validate against a live org in-app; (2) **then** the gated MCP exposure (exposure step, not a second build). Do not invert this order — the in-app path is where the tool contract gets shaken out cheaply before an external client depends on it.

Deferred follow-ups (signposted, not fixed):
1. **Client-agnostic `pipeline.ts` refactor.** `src/lib/pipeline.ts` is browser-client-bound, so the server tools re-implement the writes. The two are cross-commented ("keep in sync"). Refactor `pipeline.ts` to accept an injected client so both surfaces share one implementation, then delete the duplication.
2. **Candidate-diff in `get_briefing`.** Plan-delta already derives from the capture-layer event log (no `agent_runs` dependency); candidate-level "new since last briefing" needs `agent_runs.context_digest` (§5.2) — add when the agent tables land.
3. **`goals` / `org_facts` tables (§5.1, §5.3).** ✅ APPLIED to prod via migration 034 (idempotent, org-scoped RLS, no delete policy on `goals`). `set_funding_goal` supersedes rather than hard-deletes. Read tools auto-lift out of the onboarding path once a goal exists.
4. **`agent_tool_called` event** is now reserved and emitted by the read tools — the demand-intelligence signal for the brain (what orgs ask the strategist, from which surface). Emit it from the write tools too when convenient, and from every future tool by default.
5. **Concentration flag must carry its threshold.** `arithmetic.concentration` reports `topFunderShare` / `topOpportunityShare` as bare fractions — the reasoning surface can say *that* it fired but not *why*. Attach the firing threshold (and the share that crossed it) to the flag's provenance / engine metadata so the strategist can explain the trigger, not just assert it. Applies wherever the concentration flag surfaces (`get_plan_state`, `get_briefing`, `assess_opportunity_against_plan`).
6. **Candidate-diff must be per-surface.** When candidate-level "new since last briefing" lands (item 2), compute it against `agent_runs` **scoped by surface**, so an MCP client's last briefing and the in-app briefing keep independent watermarks — otherwise the same opportunity gets marked "new" twice (once per surface) or once and then silently suppressed for the other. `agent_runs` already carries the surface via its capture context; key the diff on `(org_id, surface)`.
7. **Per-connection org selection (designed, not built).** `resolveOrgAndTier` (src/lib/mcp-entitlement.ts) binds an MCP connection to ONE org — highest entitlement (companion > apply > plain), tie-broken oldest. Multi-org owners switch org by moving the `companion_access` flag (one companion org at a time). The future multi-org / consultant story — hold companion on several orgs and pick per-connection — needs org choice captured at **OAuth consent time** (bound into the token) or an explicit org selector, NOT a tool param (org identity must stay un-spoofable). Not this month; the "move the flag" mechanism holds until then.
8. **Surface the bound org in MCP responses ("connected as [org]").** (Logged 8 Jul 2026, from a two-flags incident: two companion orgs on one account meant MCP silently bound the *oldest* while the in-app briefing followed the active-org cookie to a *different* org — a surface mismatch invisible to the user.) The org an MCP connection resolves to should be stated back in responses (e.g. a "connected as [org name]" line on the first turn or a bootstrap/whoami affordance), so a binding mismatch is visible rather than silent. Pairs with item 7 (the real fix is per-connection selection; this is the cheap honesty layer meanwhile). Not a build now — a §13/§14 note; land it whenever the MCP surface next reopens (exposure step / §14.2).
9. **Stale assistant-chat context after a reset / rewrite.** (Logged 8 Jul 2026, ACC archetype session.) When an org's goal/pipeline state is reset or rewritten out from under a live assistant conversation, the model can reference now-deleted rows as phantom "lost" pipeline items carried in pre-reset conversation context. Handled honestly in the wild (the model flagged the discrepancy rather than confabulating), but it is the stale-context UX problem: conversation memory outlives the state it describes. Same family as the `refetchStaleBriefing` rule (§14.3.6) and item 8 — the surface should make the freshness/identity of what it is describing legible (e.g. a thread invalidation or "your data changed since this conversation started" signal on detecting a state generation bump). No build now.

---

## 14. In-app goal agent v1 — the conversational orchestrator (workstream scoped 7 Jul 2026)

**Sequencing constraint:** month-2 build. Nothing here displaces launch-critical work (signup hardening, Stripe, trial); only cheap scaffolding runs alongside month-1 work.

### 14.1 V1 scope (exhaustive)

1. **Web-session ToolContext boundary** — ✅ BUILT (`src/lib/agent/boundary.ts`). Same flags→tier mapping as the MCP path (`tierForOrgFlags`, shared in `mcp-entitlement.ts`), same entitlement gate. One documented divergence: web binds to the ACTIVE org (cookie, oldest fallback — the app convention) and resolves tier for that org; MCP binds highest-entitled (§13.7 pending).
2. **Conversational orchestrator** — ✅ SKELETON BUILT (`src/lib/agent/orchestrator/`): multi-turn streaming tool loop over the tool layer (dispatch + Anthropic tool defs derived from `TOOL_REGISTRY.input_schema`, now the canonical machine-readable param schema); system prompt derived from `contract.ts` (elaborates, never contradicts); model routing lanes `chat`/`strategist` (default PROVISIONAL — pending Paul's pick; both lanes inherit `AGENT_MODEL` until then); per-turn token/cost instrumentation via the new `agent_turn_completed` event; server-side per-org daily turn/token caps + global kill-switch budget, read back from the capture layer (`orchestrator/budget.ts`). Route: `POST /api/agent/chat` — `AGENT_ENABLED` flag + `AGENT_ORG_ALLOWLIST`, companion-tier, budget-checked, SSE. Validated end-to-end by `scripts/agent-eval/live-orchestrator.ts` (throwaway org, 4 scripted turns, cleanup; first run 7 Jul: ~£0.06/4-turn session on Sonnet 4.6).
3. **Briefing-first surface** — design spec LANDED 9 Jul 2026 (Drive: `companion-v1-design-spec` — the canonical text for the briefing page, goal setup, and plan page; build order in its §9). **Steps 1–2 of that order are BUILT (10 Jul):**
   - *Schema (spec §7):* migration 036 authored — `goal_purposes` (org-keyed, re-parented on goal supersede so pipeline purpose references survive adjustments) + `pipeline_items.purpose_id` / `.source` — **AWAITING PAUL: apply via SQL editor** (no DDL access from here; all purpose code fails soft until applied). Secured **derive-on-read is LIVE** (`getGoal` sums pipeline won; off-pipeline secured materialises as a `pre_existing` won item; the stored scalar is written as 0 and read nowhere) — §14.3.8's bug is fixed and CV-04 now asserts the healthy absorption (£70,000/£180,000 verbatim). `STAGE_WEIGHTS` extracted + `WEIGHTED_FORMULA_CAPTION` carried in the plan-state payload; per-purpose progress derives on read into `get_plan_state.purposes`.
   - *Tools + steering (spec §2/§5/§6):* `recommend_mix` (Layer 1 rulebook in `tools/mix.ts`, amount-weighted blend, funding-character vocabulary, `purposes_total` for verbatim totals, off-rulebook components returned for labelled Layer-2 judgment + `mix_fallback_fired` capture event). **⚠️ RULEBOOK IS DRAFT (`mix-rules-v0.1-draft`) — Paul's line-by-line review session is a SHIP GATE for user-facing mix recommendations.** `update_goal_purposes` (add/edit/retire — the "side project = purpose" write path). `set_funding_goal` gains `purposes`, carries them forward on adjustment. Goal-lifecycle steering in the orchestrator prompt (one-strategy principle, offer-a-purpose, adjustment confirm + report-from-refetch, pivot line, multi-entity → multi-org). Sixth contract constant `noRepayableFinance`.
   - *Evals:* suite extended to 8 cases, **8/8 green** — CV-02 is now the full three-turn setup conversation (purposes asked → mix recommended in character vocabulary + confirmed → goal written with purposes and constraints carried through), CV-05 advice boundary, CV-06 parallel-goal steering, CV-07 mix register, CV-08 inconsistency honesty on a synthetic broken mix (CV-04's organic seed healed by derive-on-read).
   - *Step 3, thread persistence — BUILT 10 Jul:* migration 037 authored (`agent_threads` one-active-per-org + `agent_messages` append-only replay substrate, select-only RLS, server-side writes) — **AWAITING PAUL: apply alongside 036**. `orchestrator/threads.ts` (getOrCreate / windowed replay with tool-pair-safe trimming / appendTurn with per-turn usage / drawer view). The chat route now replays from the server thread and persists each turn — client-supplied history is honoured only as a stateless fallback pre-037, which also closes the fabricated-tool-result injection caveat. `GET /api/agent/thread` serves the drawer view. Replay window 40 messages; summarising the older tail is a logged follow-on.
   - *Purpose assignment write path (10 Jul):* `add_to_pipeline`/`update_pipeline_item` accept `purpose_id` (org-ownership-checked; the column only touched when assigning, so pre-036 deploys keep working). One steering line added (assign when obvious, never interrogate).
   - *Verification:* `scripts/agent-eval/schema-smoke.ts` — no-model smoke that proves 036 purposes end-to-end (persistence, off-pipeline secured materialisation, per-purpose derivation, re-parenting with stable ids across adjustment, add/retire) and 037 threads (stable active thread, replay, boundary-safe windowing, drawer view). Self-gates with SKIPPED + the exact migration file when not applied. **Run state 10 Jul: both sections SKIPPED — 036 was reported applied but the REST probe shows `goal_purposes` and `pipeline_items.purpose_id` absent from prod; re-apply and re-run.**
   - *Step 4, briefing page — BUILT 12 Jul (`/dashboard/briefing`):* a third consumer of the tool layer — the page resolves a web ToolContext and renders DETERMINISTICALLY from get_briefing/get_plan_state/get_pipeline (model prose never carries numbers; the model enters only via the drawer). Sections per spec §3.1: judgment summary line (worth-count + changes-count, never match counts); exactly four metric cards (amounts-not-set amber sub-label + Add amounts link); goal bar (secured/weighted/gap segments, mix chips, weighted-formula caption, gap-exclusion note); Worth your time (top 2 candidates + deterministic considerations, max 3, single lime accent, reasons-why chips, verification chrome from url_status/url_last_checked — "checked against funder site", never "verified" — amber unverified badge otherwise, thin-coverage honesty line, honest quiet-day empty state); Since you last looked (event-log deltas with "via Claude" surface attribution, driven by a gt_briefing_seen cookie stamped after render); Companion ask bar → dismissible right drawer (server thread via GET /api/agent/thread, SSE turns via POST /api/agent/chat, tool-call chips, "scaffolds and strategy only" boundary line). No-goal state renders the degraded payload as content (§8) pending step 5's full setup page. NAV GATING per Paul's requirement: layout computes companionSurface (AGENT_ENABLED + tier) server-side → sidebar swaps Dashboard→Briefing; /dashboard redirects flagged users to the briefing; flag off = byte-identical everywhere. Verification chrome threaded additively: url_status/url_last_checked → EnrichedGrant → PackCandidate → FitCard.record_check. Deliberate deferrals: "Full plan detail" link + Plan nav item land with step 6; drawer renders plain text (markdown rendering = polish follow-on).
   - *Step 5, goal setup flow — BUILT 12 Jul:* the no-goal briefing state IS the setup page (spec §3.2/§8): conversation column (~58%) + "Your plan, assembling" panel, three confirm chips at the recommendation turn ("Sounds right" lime / "Adjust the mix" outline / "Why unrestricted?" education hook), scripted profile-first opener seeded into the server thread (idempotent; excluded from model replay by the tool-pair-safe window; server-composed, not model output). The panel renders ONLY from streamed whitelisted tool results (loop `tool_done` now carries slimmed data for recommend_mix / set_funding_goal / get_plan_state / get_briefing) — purposes + mix appear at the recommendation turn with an awaiting-confirm badge, target/deadline/"This means" (run-rate + "N eligibility-checked matches, re-ranked for this mix" + See-your-briefing) at the write. Chat mechanics extracted to a shared `useAgentChat` hook so drawer and setup can't drift. **Known softening vs spec (accepted):** target/deadline rows sit at "—" until the goal writes — user-stated values have no deterministic source before a tool has produced them; the honest fix is the what-if/dry-run follow-on, not client-side prose parsing.
   - *Step 6, plan page — BUILT 8 Jul (`/dashboard/plan`):* the analytical depth one click from the briefing (spec §3.3), a fourth consumer of the tool layer — deterministic render of get_plan_state + get_pipeline, gating identical to the briefing, no-goal → redirect to the setup page. Sections: full-size goal bar (weighted formula caption + the per-stage weights table inline, per §7); mix pipeline-versus-target (bars = each slice's share of active pipeline value, dark tick at the target share; amber absence notes — "Nothing yet addresses the £X slice" — gated on attributability so they are only claimed when composition genuinely derives; honest states for legacy no-mix goals, unassigned value, and pre-036 deploys); progress by purpose (secured/weighted against ~approx amounts, tildes preserved); pipeline by stage (declined items stay visible with their triage reason, read from notes); deadlines-ahead timeline (today → goal date, fixed deadlines only, overdue and beyond-goal-date called out, rolling excluded with the spec's caption). Tool-layer additions (all additive): get_plan_state gains `mix` (MixProgressBlock — composition attributed via purpose assignments through the refinement-aware rulebook mappings; `attributable` flag; unattributed value surfaced, never silently dropped); get_pipeline rows gain notes/outcome_notes; both registry descriptions updated (the orchestrator's get_plan_state panel slimmer whitelists named fields, so the new block does not leak into the setup panel stream). Nav: Plan joins the sidebar for companionSurface users (flag off = byte-identical); the briefing goal bar gains the deferred "Full plan detail" link. "Adjust your goal" opens the same conversation — a window event (CompanionOpenLink) opens the shared drawer, honouring §5's edit-goal-is-a-conversation rule. **Found+fixed while building: the briefing goal bar double-counted won amounts** — inPipelineWeighted includes won at weight 1.0 and the bar stacked the full weighted segment next to secured, overstating visual progress against "the gap must never flatter"; the open segment is now weighted−secured on both surfaces (legend figures were always verbatim and unchanged). tools-smoke extended with seven pure buildMixProgress checks (20/20 green).
   - *Spec §9 build order: COMPLETE.* Designed follow-ons stand as logged: what-if/dry-run on get_plan_state, drawer markdown rendering, replay-tail summarisation, R8b `accepts_match` enrichment.
   **Stated principle (carried from 14.3.4):** the briefing page renders all load-bearing arithmetic directly from tool results — model prose never carries load-bearing numbers on that surface.
   **Designed follow-on (agreed 10 Jul): what-if / dry-run mode on get_plan_state** — compute arithmetic against hypothetical goal values (target, deadline) WITHOUT writing, so the Companion can honestly quote "what would £350k mean" and pre-write adjustment impact. V1 behaviour stands meanwhile: confirm intent in words, write, re-fetch, report the new figures verbatim.
   **Ship gates — CLEARED 11 Jul 2026:** rulebook reviewed line by line and implemented as `mix-rules-v1.0` (record: `docs/goal-agent/mix-rulebook-review.md`): R2 → 90/10 with FCR reasoning; R3/R5 restructured as ask-with-refinement (rules carry a clarifying question + refinement logic; answers persist on `goal_purposes.refinement`); R5/R6 recommend opportunity types (programme, in_kind, investment) alongside the split; R6 landscape widened (incubators/accelerators, impact investment) with the advice boundary unchanged; NEW R8 match_funding — purpose rule + strategist half (steering line + deterministic briefing `considerations` entry on a recent win). Stage weights FINAL: identified 0, applying 0.25, submitted 0.40, won 1.0 — **principle: the gap must never flatter; conservative beats optimistic everywhere the arithmetic surfaces.** CV-02 extended to the R3/R5 follow-up questions per the gate condition.
   **Follow-on (R8b, logged 11 Jul):** match-friendly funders can't yet be identified from catalogue data — candidate enrichment field (e.g. `accepts_match`) for the catalogue/tagging backlog; until then the match consideration names no candidates.
4. **Eval harness, conversational cases** — ✅ BUILT 9 Jul 2026 (`scripts/agent-eval/conversational.ts` + `conversational-cases.ts`; run live, ~4p/full suite; reports committed as the regression record). Four cases, each a throwaway org + scripted turns + programmatic graders: **CV-01** draft-refusal (scaffold counter-offer, no application prose), **CV-02** mix inference (goal set only from stated values — target/date/mix/constraints asserted on the actual tool input), **CV-03** absent-field honesty (nulls relayed as not-recorded, never filled), **CV-04** inconsistency honesty (T4 seed — tests the `inconsistencyHonesty` constant: mismatch flagged plainly, no confabulation, no invented mechanism). Plus a **number lint** on every case — the conversational G6: every £ figure in assistant text must be traceable to a tool result or the user's own words (rounded/blended/model-computed figures fail). First full run 4/4 after one prompt elaboration (CV-04 initially surfaced hedged invented mechanisms — "timing lag", "sync delay" — fixed with a state-the-mismatch-and-stop line in the orchestrator prompt, then re-verified). Known lint limitation: set-membership can't catch semantic misattribution (a derived figure that coincidentally equals an in-set figure, or a % attributed to the wrong base) — LLM-judge territory, later.

### 14.2 Explicitly out of v1 (designed follow-ons, logged)

- **Web research/search tools** in the agent path (stays excluded per §10/§12 — the sector-signals store is the sanctioned shape).
- **Builder integration** (`action_type='apply'` link vocabulary stays reserved; no coupling).
- **Proactive delivery / alerts** (digest, email, nudges — Phase 5; also blocked on alert opt-out UX).
- **MCP changes of any kind** — the orchestrator consumes the same tool layer; exposure changes wait until the in-app path has shaken the contract out.

### 14.3 Tool-layer awkwardness exposed by the conversational loop (flagged 7 Jul 2026)

1. ✅ FIXED 8 Jul — **No pipeline read tool.** `get_pipeline` built through the full envelope (repository `getPipelineItems`, apply-tier, registry + dispatch). Live run T4 confirms the conversational outcome loop: "mark the Community Resilience Grant won" → get_pipeline → update_pipeline_item → briefing re-fetch. (MCP registration deliberately deferred with the rest of the exposure step.)
2. ✅ FIXED 8 Jul — **Briefing FitCards too thin to sequence from.** FitCards now carry amount_min/max, amount_undisclosed, deadline, is_rolling, next_open_date, open_status, warning_codes. Live run T2/T3 sequenced from briefing data alone (deadlines, open statuses, amounts) with zero assess round-trips. Also a hard dependency of the briefing-page candidate cards — satisfied ahead of the design spec.
3. **Param schemas now live in three places**: `TOOL_REGISTRY.input_schema` (canonical, added this session), the MCP route's hand-written zod schemas, and the `params` display strings. Follow-on: derive the MCP zod from the canonical schema when MCP changes reopen.
4. **The G1–G7 render gates don't exist on this surface.** `reason.ts`'s structured output is validated before display; streamed conversational prose can't be. `neverRestateNumbers` is prompt-level only here. Mitigations (now a stated principle, 14.1.3): the briefing page renders arithmetic from the tool result (deterministic), never from model prose; conversational eval cases (14.1.4) carry the number-discipline assertions; a post-hoc number-lint over the final text is possible but can't gate a live stream.
5. ✅ FIXED 8 Jul — **`assertScaffoldOnly` now recurses** into arrays/objects (depth-capped), so nested strings (`constraints[].text`, jsonb blobs) can't smuggle prose past the guard.
6. ✅ FIXED 8 Jul — **Briefing staleness policy** decided and encoded: `generated_at` on the briefing payload + the `refetchStaleBriefing` contract constant (older than 15 minutes, or any write since → re-fetch). Lives in `contract.ts` so the orchestrator prompt and the MCP get_briefing description carry it identically; `reason.ts` pins the original four rules explicitly, keeping the one-shot prompt byte-identical to the eval baseline. Live run: T3 reasoned from freshness correctly, T4 re-fetched after a write unprompted.
7. **`get_briefing` cost per call.** Every call rescoring the full active catalogue (~650 rows) is fine at cohort scale but conversational threads multiply calls; memoise per-turn or cache per-org-day when usage grows.
8. **(8 Jul, exposed by T4): outcomes don't move the plan arithmetic.** `goals.secured_amount` is a snapshot taken at set_funding_goal time; a later won-stage transition changes the *weighted pipeline* figure but not secured/gap. **DESIGN DECIDED 9 Jul (Paul), implementation lands with the design-spec package:** secured is always derived on read, never cached; off-pipeline secured income enters as pipeline items with `stage='won'` + a source marker (`manual`/`pre-existing`), not an override field; `goals.secured_amount` dies as a stored scalar (computed payload field at most). See the §5.1 supersession note. Until the package lands, the strategist's gap goes stale after wins. The model's confident wrong explanation for the anomaly ("the £30,000 was already reflected in your secured figure") drove a fifth contract constant — `inconsistencyHonesty` (fail-toward-honesty as a machine rule: say the data doesn't reconcile and stop) — added 9 Jul to `contract.ts`, the orchestrator prompt (via contractBlock), and the get_plan_state / get_briefing descriptions; `reason.ts` stays pinned to its four until the next prompt rev. Eval case CV-04 tests the constant, not just the incident.

### 14.4 Model routing decision — DECIDED 8 Jul 2026 (Paul)

**Option A: Sonnet 4.6 on both lanes.** Reasoning: one variable at a time while the conversational eval baseline lands (same model reason.ts is tuned on), and the margin maths holds — the ~25–30%-of-revenue figure applies only to the heavy-user tail at cohort pricing; median sessions and full-price Companion sit comfortably. Revisit option B (Haiku chat lane + Sonnet strategist) **only after** conversational evals exist to catch tool-loop regressions. Lanes stay env-switchable (`AGENT_CHAT_MODEL` / `AGENT_STRATEGIST_MODEL`); both inherit `AGENT_MODEL` = `claude-sonnet-4-6`, which is now the recorded default, not a provisional one.

Measured reference costs (live harness, Sonnet 4.6): 4-turn session £0.059 (7 Jul); 5-turn session with enriched FitCards + outcome loop £0.130 (8 Jul) — ~2–3p/turn.
