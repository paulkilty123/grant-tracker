# Grant Tracker MCP v1 — At a Glance

**Status:** Spec locked, ready for build
**Build window:** 19-25 May 2026
**Soft launch:** 2-3 June 2026
**Public launch:** 9 June 2026 (or shortly after)

---

## What it is

A read-only MCP server exposing Grant Tracker's UK funding catalogue and provider intelligence to Claude, ChatGPT, Gemini, and any other MCP-compatible agent. Users discover funding via natural conversation with an agent; when they want to act on it (save to pipeline, track deadlines, deeper eligibility checks, insider application guidance), they convert to the Grant Tracker web app.

## Five tools

1. **`search_funding_and_support`** — discovery; lists matching opportunities by filter
2. **`get_opportunity_detail`** — full picture on a specific opportunity by ID
3. **`get_provider_intelligence`** — funder/investor/programme operator/in-kind provider profile
4. **`get_taxonomy`** — reference data (sectors, regions, structures, funding types, beneficiary groups)
5. **`health_check`** — system diagnostic

## Architecture in three sentences

Read-only adapter pattern over `scraped_grants`, with `src/lib/opportunity-adapter.ts` translating to the v4 external contract. Stateless tools that return stable opportunity IDs for follow-up calls. Streamable HTTP transport, identical behaviour across all MCP clients, no client-specific code.

## Non-negotiables

- **Multi-funding-type breadth.** Grants + programmes + investment + in-kind. All four ship in v1. Grants-only would match Kindora's scope and surrender the positioning moat.
- **Honest 0-result handling.** When no results match, return 0 with a structured diagnostic and adjacent suggestions. Never pad with weak matches. This is the explicit differentiation point against Kindora's `country` fallback behaviour.
- **GT-primary URLs.** Every result has both a Grant Tracker URL and the funder's direct URL. Grant Tracker URL is presented first. UTM-tagged on all GT URLs.
- **Layered attribution.** Structured attribution object, both URLs, upgrade_note field, tool descriptions stating expectation, UTM parameters. No single layer is enforceable; layered together, attribution is robust.
- **Tool descriptions as the product surface.** Each description hits the four patterns: disambiguation (when to use vs alternatives), composable recipes (how to chain tools), data quality guidance (known issues and how to handle), conversion note (what the app does beyond the MCP).

## V1 includes

- All five tools
- All four funding types
- Match-quality signal: numeric score + matched-signals list (not full 6-dimension exposure)
- Honest 0-result with `likely_cause` and `adjacent_suggestions`
- API key auth with anonymous fallback (10/hr per IP)
- Per-key rate limits (100/hr, 1,000/day)
- UTM parameters on all GT URLs
- Per-API-key segmentation for `utm_source` (Claude/ChatGPT/Gemini channel attribution)
- Context-aware `upgrade_note` (3-4 variants per tool)

## V1 explicitly excludes

- One-shot personalised matching against agent-provided org profile (v2)
- `list_tools` runtime documentation (v2 if needed)
- Analytics tools equivalent to Kindora's `get_funder_stats` / `get_990_summary` (no equivalent data)
- Pro tier API keys (introduce when high-volume usage appears)
- `gt_insight` per-result field (skip entirely)
- Corporate partnership intelligence (feature doesn't exist yet)
- Funder-side marketplace access via MCP (separate product)
- Frame impact reporting integration via MCP (separate product)

## Funder_brief field split

**MCP returns (the "is this a fit" content):**
who_can_apply, what_they_fund, priorities, exclusions, geographic_focus, typical_award

**App-only (the "how to win this" content):**
funder_tips, how_to_apply (curated version), strong_application, decision_timeline

## Pre-launch dependencies (non-MCP work)

1. Bridge page quality audit — LCP <2s, mobile-first, clear save-to-pipeline CTA
2. Regional programme catalogue gaps — Wales, NI, Yorkshire tagging
3. Unverified URL hygiene — process the 67 unchecked-URL active rows
4. `upgrade_note` content authoring — 12-15 distinct copy variants
5. ToS for API key issuance — attribution requirement, no commercial re-aggregation, kill switch
6. MCP server hosting + Redis setup

## Build sequence

Adapter → auth → rate limiting → `health_check` → `get_taxonomy` → `search_funding_and_support` → `get_opportunity_detail` → `get_provider_intelligence` → integration testing → bridge page audit → soft launch → public launch.

## Distribution honesty

Claude is the only directory v1 targets (decided 2026-05-20). The MCP server remains compatible with ChatGPT and Gemini for developers who self-configure, but no consumer-directory submissions are made on those platforms. Launch comms: "available in the Claude MCP directory; supported for developers self-configuring in any MCP-compatible client".

## The competitive picture (as of 12 May 2026)

- Kindora UK-native open grants: ~5-10
- Kindora UK funders: 0
- Grant Tracker UK active opportunities: ~465
- Order-of-magnitude advantage on UK coverage
- Kindora has grants + RFPs only; Grant Tracker covers four funding types
- Kindora pads sparse UK results with global programmes via `country` filter (the specific design weakness to differentiate against)

---

**Full spec:** `mcp-spec-v1.md`
**Spec supersedes:** all prep memories for build decisions
