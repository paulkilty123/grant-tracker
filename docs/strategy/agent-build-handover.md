# Agent build — handover and starting point

Handover note for the Code session that begins building the goal-driven agent (the Companion). Read this first, then the attached files in the order below.

## What we are building, and why

The repositioning is settled: Grant Tracker is a goal-driven fundraising companion, not a grant database. Discovery and matching are inputs to the larger job, which is helping an organisation set a funding goal and reach it. The thing to build now is the reasoning core that powers that companion. It is the engine of the paid Companion (Strategise) tier, and getting its judgment quality right is the central technical task of this phase.

The MCP captures already prove the hardest part is reachable: data-grounded reasoning over the catalogue produces adviser-quality judgment. The full agent extends that proven reasoning with richer org context (the org model, the pipeline, goals) plus persistence and proactivity.

## Build in isolation — do not touch the live site

Critical constraint: the current production website and app must keep working throughout. Build the agent direction as separate, additive work that the live site never depends on, so the switchover happens only when Paul is ready.

- Work on a dedicated git branch, not main. Use Vercel preview deployments so the new build is testable at a preview URL while production stays on the current site. Switchover = merge to main and promote, with the previous deployment kept as an instant rollback.
- Put new code in new files and directories. Do not edit or replace the existing landing page or live routes. New surfaces live on their own paths (for example under an /app or /agent prefix, or behind a feature flag / env var) so nothing in production changes until the flag is flipped.
- Database changes must be additive and reversible. Use a Supabase branch for schema work; prefer additive migrations over destructive ones; the data-shape audit stays read-only. Nothing should break the schema the live app currently relies on.
- Keep a clean switchover path: the goal is that going live is a deliberate, single, reversible action (flip the flag or merge and promote), never a big-bang rewrite of the running site.

Report the branching and isolation approach back before building, so the boundary is agreed up front.

## Read these, in this order

1. grant_tracker_strategy_brief.docx — the canonical strategy. Read Part two (design principles) in full; it governs how the agent must behave.
2. grant_tracker_v1_build_plan.html — the phased build plan (foundations, reasoning core, onboarding, surfaces, proactive/trial). This is the roadmap; follow its sequencing.
3. grant_tracker_functional_boundary.html — the free vs paid matrix. Note: tier gating is a launch-time decision, not a build-time blocker. Build the capability; gate later.
4. grant_tracker_tier_customer_map.html — the four-verb ladder (Find, Apply, Strategise, Scale). The agent is the Strategise tier.

## The non-negotiable sequencing: data fidelity first

Per the v1 build plan and the prior commission to Code, the reasoning core must be built on a verified data floor, with an eval harness in place before the iteration loop begins. Concretely:

- Confirm the status of the previously commissioned work: the eval harness and golden set (seeded from MCP captures and cohort profiles), the field-by-field data bar, and the read-only data-shape audit. If not done, that comes first. Report back before building on top of it.
- The data bar is not completeness. Many nulls are legitimate (rolling deadlines, undisclosed amounts). The bar is: fix genuine gaps, and represent and handle legitimate absence honestly. Do not fabricate or infer to fill nulls.
- Watch the known matcher artefacts (veto paths, structure-mismatch caps, uniform low scores signalling a wrong profile) and the data-shape issues flagged earlier (mixed UUID/legacy ids in grant_interactions.grant_id; match_feedback.grant_id storing external_id).
- Citation and anti-hallucination guardrails are part of the core, not a later polish: the agent shows its reasoning and grounds claims in the catalogue.

## Design principles the agent must embody (from the brief, Part two)

- Load-reduction: the agent reduces work, it does not generate it. Surface the few things that matter, do not flood. The proactive layer must clear a high signal bar. If a feature makes the user do more overall, it is wrong.
- Value before effort; context accrued through use: onboarding must show value on minimal input and earn further context by being useful first. Never a large upfront ask. The richer org context (and the eventual living impact profile) accrues through use, not extracted upfront.
- Consultant-grade aspiration, with an honest boundary: aim for advice of the calibre a senior fundraising consultant would give on the analytical layer (audit, strategy, prospect research, bid review, diversification). Do not claim the human, relational or delivery layer. Internal test: would a senior fundraising consultant agree with this recommendation?
- Kind challenge: the agent challenges constructively and invites being challenged, like a good adviser, rather than only complying.
- Honesty: honest verdicts including "this is not a fit"; never overclaim or guarantee funding; fail toward honesty.

## Capture outcomes from day one

Build the data model so it records whether applications the agent helped with actually won. This single mechanism serves two ends: the credibility metric (funding won by users) and the central brain's learning substrate (what worked for orgs like this). Far easier to capture from the first user than to backfill.

## What NOT to build yet (design headroom only)

- The application builder is early v1.x, not now. It anchors the Apply tier and is the strongest demand signal, so spec it and keep schema headroom, but the reasoning core comes first.
- Team/Scale tier (seats, roles), the relationship/CRM layer, and reporting are later. Keep schema headroom (seats, roles, a relationship-shaped funding category) but do not build.

## Brand tokens (for any UI)

Forest green #173404, green #7CC242, lime #8ECB3C, warm cream #F5F1E8, page off-white #FAFAF7, ink #2C2C2A. Space Grotesk (headings, labels, figures), Plus Jakarta Sans (body). Sentence case, British English, no em dashes.

## First step for this session

Confirm two things before building: the branching and isolation approach (so the live site is protected), and the state of the data floor and eval harness (report before building). Once both are agreed and green, begin the reasoning core against the eval set, to the consistency bar for heartland situations (the Jen archetype), with citations and the load-reduction principle built in from the start.
