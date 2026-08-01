# Shoots MCP build brief — August pass

Purpose: take the Grant Tracker MCP server to Shoots, current spec, with the free/paid
line implemented, ready for directory submission by mid-August. Executor: Claude Code
(Opus 5, effort xhigh for phases 2-4; Sonnet 5 acceptable for phases 1 and 6).
Reviewer: Claude chat session (Fable 5) — bring diffs for phases 2, 3, and 4 back
for review before merging.

Read-only reference: the 30 July audit (mcp-server-audit-2026-07-30.md) is the map
for everything below. File paths and line numbers cited there.

## Placeholders — RESOLVED 2026-08-01

- [x] Final host: `https://www.shootsfunding.co.uk/api/mcp/v1/mcp`, **www-canonical**.
      Verified 1 Aug: domain registered (Nominet: registrant details pending
      validation, i.e. fresh), apex and www both resolve to Vercel, apex returns
      **308** to `https://www.shootsfunding.co.uk/`, www serves 200. Same
      behaviour as granttracker.co.uk — address www directly for bearer traffic,
      since a cross-host redirect drops the `Authorization` header.
- [x] Contact address: `hello@shootsfunding.co.uk` — **decided, not yet live.**
      Mail is not set up as of 1 Aug. `MCP_CONTACT_EMAIL` therefore stays on
      `hello@granttracker.co.uk` until mail works; it is a separate env var from
      the origins precisely so the two can move independently.

> **Live state note (1 Aug).** shootsfunding.co.uk is already attached to the
> same Vercel project, so `https://www.shootsfunding.co.uk/api/mcp/v1/mcp`
> answers *today* — but every protocol surface it returns still declares
> granttracker.co.uk (401 `resource_metadata`, and the discovery document's
> own `resource` field). Under RFC 9728 that is a resource-identifier mismatch:
> a client connecting via shootsfunding discovers a resource identity of
> granttracker. Impact is nil while the domain is unadvertised, but **do not
> point a reviewer or test client at the shootsfunding endpoint before the
> cutover env flip.** After the flip the mismatch mirrors onto granttracker,
> so decide then whether that host keeps serving MCP or 308s across.

## Hard constraints — apply to every phase

1. NEVER rename: `gt_oat_` / `gt_ort_` / `gt_mcp_` token prefixes;
   `grant_tracker_url` response field; `buildGrantTrackerUrl` function.
   These are wire-format and stored-data identifiers. Change the domain VALUES
   they emit, never the identifiers themselves.
2. No anonymous access. The 401-for-unauthenticated behaviour is load-bearing
   (Claude's connector probe requires it to trigger OAuth discovery). Do not add
   an unauthenticated tier under any framing.
3. Rate limiting stays fail-open for MCP (deliberate, documented decision).
   In-app AI surfaces stay fail-closed. Do not "fix" this.
4. No thinning of result quality anywhere. Eligibility summaries stay full length
   for all tiers. Restrictions are quantity-based and always declared in the
   response text, never silent.

## Phase 1 — brand cutover (Sonnet 5)

The six rewrite points from the audit, plus config:

- [ ] `upgrade-notes.json` — rewrite all notes for Shoots (see phase 5 for content)
- [ ] `route.ts` — ATTRIBUTION constant, serverInfo name/title, WWW-Authenticate
      realm, and the four long tool descriptions. While rewriting descriptions:
      REMOVE the "surface Grant Tracker by name when presenting results"
      instruction and any equivalent steering. Descriptions describe what tools
      do; they do not instruct clients to promote the brand.
- [ ] `mcp-oauth.ts` — OAUTH_ISSUER and OAUTH_RESOURCE to the new origin (these
      drive both .well-known documents; nothing else should need touching for
      discovery)
- [ ] `opportunity-adapter` — DEFAULT_BASE_URL to the new origin
      (function name stays `buildGrantTrackerUrl`; field stays `grant_tracker_url`)
- [ ] `tools/index.ts:164` and `goal.ts:130` — the two stray literals
- [ ] `mcp-middleware.ts` — DELETE the dead `authRequiredResponse()` function
      entirely. Do not migrate its strings.
- [ ] Prefer moving these to a single env-driven config (e.g. `MCP_PUBLIC_ORIGIN`,
      `MCP_BRAND_NAME`) so the granttracker → shootsfunding flip is one env change
      per environment, not a code change
- [ ] `docs/mcp-client-setup.md` — rewrite: remove the OpenAPI shim section and
      bearer-key instructions (path orphaned since June), document the OAuth
      connect flow only, Shoots naming throughout

Acceptance: `rg -i "grant.?tracker|granttracker" src/` returns only the three
protected identifiers and their call sites.

## Phase 2 — spec migration (Opus 5, xhigh)

- [ ] Bump `@modelcontextprotocol/sdk` to the latest version supporting
      protocol 2026-07-28. Check `mcp-handler` compatibility; if it lags the SDK,
      pin the newest workable pair and note the gap in the PR description.
- [ ] Accept and handle `Mcp-Method` and `Mcp-Name` request headers per the new
      spec. Verify nothing in Next.js middleware, Vercel config, or the handler
      strips or rejects unknown headers.
- [ ] Confirm stateless behaviour is unaffected (no session code exists; keep it
      that way — the new spec's per-request `_meta` should flow through the SDK).
- [ ] Backward compatibility: older clients on 2025-xx protocol versions must
      keep working (spec requires it; SDK should handle version negotiation —
      verify, don't assume).

## Phase 3 — OAuth hardening (Opus 5, xhigh) — diff review required

All changes confined to `mcp-oauth.ts` per the audit:

- [ ] Return `iss` on authorization responses (RFC 9207)
- [ ] Bind issued client credentials to the issuer that minted them; reject
      reuse across issuers
- [ ] DCR remains the registration mechanism. CIMD is explicitly OUT of scope
      (twelve-month window; separate project).
- [ ] The issuer change invalidates existing tokens/registrations. Acceptable:
      Paul is the only user. Verify his reconnection works post-deploy; no
      migration shims.
- [ ] **Old-origin retirement (decided 1 Aug).** At cutover, every MCP surface
      on granttracker.co.uk 308s to its shootsfunding equivalent — the MCP
      endpoint itself and both `.well-known` documents. granttracker stops
      being an MCP identity entirely rather than serving metadata that
      declares a different resource (which would mirror the pre-cutover
      mismatch onto the old host). Gated on the same env flip as the issuer
      change, so identity moves in one step and there is never a window where
      the two hosts disagree about who the resource is.

## Phase 4 — tiers, limits, and the free/paid line (Opus 5, xhigh) — diff review required

Routing:
- [ ] Extend the binary companion/other gate to three-way: companion / apply /
      free. The TIER_TOOLS entitlement map already defines apply's tools —
      make the routing honour it.
- [ ] Register `get_pipeline` on the MCP route (built but never registered).
      Apply and companion tiers.
- [ ] Free tier keeps exactly the current five catalogue tools.
- [ ] `tools/list` must reflect the caller's tier (it already differs by caller;
      extend to the third branch).

Rate limiting:
- [ ] Move rate-limit enforcement AFTER tier resolution (currently before —
      this is the prerequisite for everything below).
- [ ] Free: 50/hour abuse ceiling + 75 searches/calendar-month quota on the
      search tool. Quota exhaustion returns a declared, friendly message with
      the Match price and app link — a normal tool response, not an error.
- [ ] Paid tiers (match/apply/companion when they exist over MCP): no monthly
      quota; keep generous abuse ceilings (current 100/hr, 1000/day fine).
- [ ] Per-IP limit unchanged.

Result shaping (free tier only):
- [ ] Search returns the 10 strongest results with `total_matching` always
      declared. Paid tiers keep current behaviour (50 max per call).
- [ ] `get_provider_intelligence`: free callers receive a summary form (identity,
      broad funding areas, typical amounts, geography — a few sentences).
      Full depth for apply/companion. Add a result cap for all tiers (currently
      uncapped).

## Phase 5 — upgrade notes (Sonnet 5, copy from this brief)

Rewrite `upgrade-notes.json` as contextual, factual, specific:

- Search results (free): "Showing the 10 strongest of {total_matching} matches.
  All {total_matching}, scored against your organisation's profile, are in the
  Shoots app — shootsfunding.co.uk."
- Attempted pipeline action (free): "Saving to a pipeline with deadline tracking
  is part of Apply (£18/month, 7-day free trial) — shootsfunding.co.uk/pricing."
- Provider intelligence (free): "This is the summary view. Full funder
  intelligence is available in the Shoots app."
- Quota reached: "You've used your 75 free searches this month. Unlimited
  searching starts at £12/month — shootsfunding.co.uk/pricing."

Tone: factual, no exclamation marks, no "unlock", British English, sentence case.

## Phase 6 — signup inside the OAuth authorize page (Opus 5; Shoots design tokens)

- [ ] The authorize page must offer account creation, not only sign-in. Flow:
      email + password (or magic link if that's the existing auth pattern) →
      account created on free tier → straight to the consent screen → redirect
      back to the client. No detour to the main site, no email-verification
      blocking the flow (verify async afterwards).
- [ ] Shoots design system (the locked tokens), mobile-friendly, one line on
      what a free account gets.
- [ ] Marketing consent checkbox, UNTICKED by default: "Send me occasional
      emails about new funding opportunities and Shoots updates. Unsubscribe
      any time." Store the consent flag + timestamp.
- [ ] Small print under the form: "By creating an account you agree to our
      terms of service and privacy policy. Connecting through an AI client
      shares your funding searches with that client; see the privacy policy
      for how this works." (Link both.)
- [ ] Legal copy source: "Shoots legal amendments — MCP pass (August 2026)"
      in Paul's Google Drive. The privacy policy and terms updates in that doc
      ship in the same deploy as this page.

## Phase 7 — smoke test (the reviewer journey)

With a fresh Claude account that has never seen the connector:
- [ ] Add the connector → 401 → OAuth discovery → authorize page renders
- [ ] Create a new account in the flow → consent → redirect completes
- [ ] Free tier: search works, 10-result shaping + declared total present,
      provider intelligence returns summary, pipeline tools absent from
      tools/list, attempted saves produce the upgrade note
- [ ] Upgrade the test account to apply in the DB: pipeline tools appear,
      add/update/get_pipeline all work, search returns up to 50
- [ ] Paul's companion account: all 14 tools including newly registered
      get_pipeline
- [ ] Disconnect, reconnect: revocation enforced, re-auth clean
- [ ] Older-protocol client still connects (backward compat)
- [ ] `rg` acceptance check from phase 1 passes on the deployed build

## Post-cutover cleanup (after the September flip, not before)

- [ ] **Tighten `oauth_clients.issuer` / `oauth_tokens.issuer` to NOT NULL.**
      Migration 046 left them nullable deliberately — NOT NULL would have broken
      whichever of {schema, code} landed second on the phase 3 deploy. The
      guarantee is held in code meanwhile (`issuerMatches()` fails on NULL).
      Safe to tighten once a `count(*) filter (where issuer is null)` returns 0
      on both tables and the deploy has settled. Verified 0 at apply time.
- [ ] **Drop the retired-origin redirect once the old domain is retired for
      real**, or keep it indefinitely if granttracker.co.uk stays registered as
      a courtesy redirect. Decision, not a task.
- [ ] **Phase 2 spec migration** — deferred, not cancelled. Trigger: the
      `mcp_request_received` events showing `protocol_era = 'modern'`, or the
      v2 package line reaching a soak we judge reasonable. Query:
      `select payload->>'protocol_era', count(*) from events
       where event_type = 'mcp_request_received' group by 1;`

## Explicitly out of scope for this pass

CIMD migration; ChatGPT/Gemini/Perplexity testing and submissions; the app
redesign beyond the authorize page; Stripe and the terms commercial rewrite;
the recency embargo (dropped entirely); any change to fail-open rate limiting;
the 1,500-opportunity fetch-cap rework (monitor only).
