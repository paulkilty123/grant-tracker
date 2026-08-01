# MCP Server Audit — 2026-07-30

Read-only audit. No code was changed. All facts below are cited `file:line` against `~/dev/grant-tracker` on branch `main`, current as of this date. Four independent research passes fed this: platform/spec, auth tiers/tool inventory, rate limits, and brand-surface grep.

---

## Surprises worth reading first

1. **Apply tier is invisible on MCP.** The tier gate is one binary switch — `route.ts:853`, `tier === 'companion' ? companionHandler : freeHandler` — with no `apply` branch. A paying Apply subscriber connecting over MCP gets the exact same 5 catalogue tools as a free user or a bare API key. Nothing extra.
2. **An API key can never reach the companion (Adviser) tools, even one issued by a companion-tier account owner.** Tier is never written at key issuance and never resolved for key-based calls (`authCtx.tier` stays `undefined` on that path). Companion access is OAuth-only in practice, regardless of who owns the key.
3. **The self-serve bearer-key path was quietly orphaned on 9 Jun 2026** (commit `508e3c2`) — the issuance UI dead-ends (sign-in redirects to dashboard instead of issuing a key), and the public `/mcp` page now presents OAuth only. But `docs/mcp-client-setup.md` still documents the bearer key as *the* credential example, and the `ALLOWED_UTM_SOURCES` set on that orphaned path (`developer_mcp`/`claude_mcp`/`chatgpt_mcp`/`gemini_mcp`) implies it was meant to be the ChatGPT/Gemini self-configure route. That route no longer has a working front door.
4. **Rate limiting fails OPEN.** If Upstash is unreachable or misconfigured, `enforceRateLimits()` returns `{allowed: true, enforced: false}` — an outage removes *all* throttling from MCP. The three adjacent in-app AI surfaces (ai-search, autofill-grant, org-autocomplete) deliberately fail **closed** (503) for the opposite reason — protecting against unmetered Anthropic spend. This asymmetry is intentional per the code comments, but it's worth knowing which one applies where.
5. **`get_provider_intelligence` has no result cap at all** — no `.limit()` on the query. A funder/community-foundation with many active dated funds under one name returns every matching row, unbounded.
6. **`get_pipeline` is built, policy-entitled to Apply+Adviser, and simply never wired onto the MCP route.** It's unreachable via MCP under any tier today, despite being a genuine, working function.
7. **Brand attribution is baked into the tool *description* text itself**, not just response metadata — the descriptions literally instruct the connecting model to "surface Grant Tracker by name when presenting results." That's active steering embedded in the protocol surface, not passive labeling.
8. **The good news, confirmed rather than assumed:** nothing in the auth/transport code is Claude-specific. OAuth 2.1 + DCR + PKCE + Streamable HTTP is generic and spec-compliant; the design doc locks in "no client-specific code paths" as a principle, and the code matches it. The gap for ChatGPT/Gemini/Perplexity is testing and distribution, not code — see §1.
9. The rate-limit "counter race" logged in memory turned out to be cosmetic (a display field only, not enforcement) and was already mitigated in a May 2026 commit — still holding as of this audit.

---

## 1. Platform support

**Transport.** One route, `src/app/api/mcp/v1/mcp/route.ts`, built on `mcp-handler@1.1.0` wrapping `@modelcontextprotocol/sdk@1.26.0`. Streamable HTTP only, POST-only, and stateless in practice:
- `mcp-handler` derives `/sse` and `/message` (legacy HTTP+SSE) endpoints internally, but no Next.js route file exists at those paths under `src/app/api/mcp/`, so they 404 before the library's SSE branch is ever reached — dead code, unreachable.
- `GET` and `DELETE` are hard-405'd by `mcp-handler` itself (`node_modules/mcp-handler/dist/index.js:280-303`), ahead of the SDK's own session-stream/termination logic. Route.ts's own comment describing GET/DELETE session semantics is stale relative to what actually runs.
- No `sessionIdGenerator` is passed into `createMcpHandler` (`route.ts:749`), so the SDK runs in stateless mode: a fresh `McpServer` + transport per POST, no `Mcp-Session-Id` ever issued or checked. This is a deliberate design choice per `docs/mcp-spec-v1.md:102-106` (§3.3, "stateless tools, stable IDs"), not an oversight — and it happens to already match where the 2026-07-28 spec is heading (see §2).

**Auth methods.** Two, one demoted:
- **OAuth 2.0 + Dynamic Client Registration (RFC 7591) + mandatory PKCE S256** — `src/lib/mcp-oauth.ts`, routes at `src/app/oauth/{register,authorize,token,revoke}`. This is the canonical, only-documented path today.
- **Static bearer API keys** (`gt_mcp_…`) — still validated at the protocol layer (`mcp-middleware.ts:112-139`), but orphaned as a self-serve path since commit `508e3c2` (9 Jun 2026): the issuance UI dead-ends, and the public `/mcp` docs no longer mention it. Backend validation is "unused, harmless" per that commit's own message.
- **Anonymous access is fully removed** (2026-05-21) — any unauthenticated call gets a 401. There is no free/unauthenticated MCP tier at all today.

**Client-specific code: none found.** Grepped all auth/routing code for `claude.ai`, `openai.com`, `chatgpt.com`, `gemini`, `perplexity.ai`, and User-Agent sniffing. The only client-referencing artifact anywhere is `ALLOWED_UTM_SOURCES` (`src/app/api/mcp/keys/issue/route.ts:16-21`) — a labeling enum on the now-orphaned key-issuance path, not a gate. `validateRedirectUri()` is generic RFC 6749 hardening (https-only, no localhost/private-IP in prod, no fragment) with **no hostname allowlist** — any client can register any public https `redirect_uri` via DCR. `docs/mcp-spec-v1.md:108-114` locks this as a design principle: *"No client-specific code paths."* The code matches it.

**Discovery documents** (`.well-known/oauth-authorization-server`, `.well-known/oauth-protected-resource`) are generic RFC 8414 / RFC 9728 metadata — no vendor allowlist in either. `/oauth/register` accepts arbitrary `redirect_uris` (up to 10/client), rate-limited 5/hr/IP, capped at 20 active clients/IP.

**Readiness per client:**

| Client | Works today? | What's actually missing |
|---|---|---|
| Claude (Desktop / claude.ai / Claude Code) | Yes | Nothing — only client actually tested. Directory submission assembled and (per prior memory) sent to Anthropic, awaiting approval. |
| ChatGPT | Should work at the protocol layer — nothing code-side blocks it | Never tested. Directory submission **explicitly dropped 2026-05-20** ("distribution focus, not compatibility" — this was a deliberate decision, already in memory). `docs/mcp-client-setup.md` is stale: still shows the orphaned bearer key as the credential example and describes an "OpenAPI shim" fallback that predates native MCP support. |
| Gemini | Same as ChatGPT | Same directory-drop decision, same untested status. |
| Perplexity | No code obstacle — but genuinely never considered | `perplexity` does not appear anywhere in the repo. Not tested, not excluded, just never in scope. |

**Bottom line:** you did build for more than Claude — the auth/transport layer is generically spec-compliant with no Claude-only assumptions anywhere in the code. What's actually Claude-only is the *testing and distribution* effort: only Claude Desktop has a smoke-test sheet, only Claude has a directory submission in flight, and the docs that would help a ChatGPT/Gemini integrator self-configure are stale (pointing at a bearer-key flow that no longer has a working front door).

---

## 2. Spec version

**What's implemented today:** no `protocolVersion` string is hardcoded anywhere in app code — version negotiation is fully deferred to `@modelcontextprotocol/sdk@1.26.0`, which supports `['2025-11-25','2025-06-18','2025-03-26','2024-11-05','2024-10-07']` and defaults to `2025-03-26` if the client doesn't specify. `2026-07-28` is not in that list — this SDK build predates it. Architecturally, the app's own design choices (stateless tools, DCR-based registration, no `iss` validation) match the `2025-03-26`/`2025-06-18` generation, even though the underlying SDK is technically capable of negotiating up to `2025-11-25`.

Going through the five 2026-07-28 breaking changes you listed:

| Change | Status here | Impact |
|---|---|---|
| **Stateless core** (drop `initialize`/`initialized` + `Mcp-Session-Id`) | **Already unaffected.** No `sessionIdGenerator` is configured; the app never adopted sessions. Genuinely nothing to migrate here — you're ahead of this one by accident of prior design. | None expected, pending confirming the new handshake wire-format. |
| **`Mcp-Method` / `Mcp-Name` required headers** | Confirmed absent from both app code and the installed SDK. | Small, contained fix — likely an SDK bump plus a thin shim in `route.ts`'s `handle()`. Auth/entitlement logic doesn't read headers directly today, so this shouldn't ripple. |
| **DCR deprecated in favour of CIMD** | **This is the big one.** DCR (`/oauth/register`, RFC 7591) is the *sole* registration mechanism — wired through the consent-screen UI (which reads `client.client_name` for display), its own Redis-backed abuse limiter, and the `oauth_clients` schema. | Comparable in scope to redoing the original OAuth build (which itself was a two-session effort — commits `fd7e712`, `76bf755`). Not a header tweak; a second auth-flow build. |
| **RFC 9207 issuer (`iss`) validation** | Not implemented — no `iss` parameter anywhere in the authorize/token flow. | Moderate, additive, confined to `mcp-oauth.ts`. |
| **Client credentials bound to their issuer** | `oauth_clients` has no issuer column; tokens are opaque sha256-hashed bearer strings (not JWTs), so there's no `iss` claim mechanism to begin with. Only one issuer exists in the whole product (`OAUTH_ISSUER` is a single hardcoded string), so there's no live mix-up-attack surface today. | Schema + validation work confined to `mcp-oauth.ts` + one migration. Low real-world exposure given single-issuer reality. |

**Rough cost read:** the headline change (stateless core) is a non-event for you specifically. The header requirement is cheap. The two OAuth-hardening items (issuer validation, credential binding) are moderate and localized. The one genuine rebuild is DCR → CIMD — that touches the registration endpoint, the consent UI, the abuse controls, and the client-storage schema all at once, and is realistically its own project, not a patch.

---

## 3. Auth tiers — what unauthenticated vs. authenticated actually gets

**Unauthenticated: nothing.** There is no anonymous MCP tier anymore (removed 2026-05-21, specifically because Claude Desktop's connector probe needs a hard 401 to trigger OAuth discovery — a 200-with-limits response was making it silently skip OAuth). Every tool call requires a valid `gt_mcp_…` key or `gt_oat_…` OAuth token, or it gets a 401.

**Two authenticated paths, and they resolve tier completely differently:**

- **API key (`gt_mcp_…`):** `tier` is never set on this path — `authCtx.tier` stays `undefined` regardless of the issuing user's actual subscription. It always routes to `freeHandler` (`route.ts:844-853`). The key-issuance table itself has no tier/entitlement column (`src/app/api/mcp/keys/issue/route.ts:85-94`). An API key is tier-blind by construction — there is no way for a key to reach anything beyond the 5 free catalogue tools, ever, no matter who owns the account behind it.
- **OAuth (`gt_oat_…`):** resolves the real signed-in user, then queries the live `organisations` table (`apply_access`, `companion_access`) and maps to a tier — `companion_access` → `companion`, else `apply_access` → `apply`, else `free` (`src/lib/mcp-entitlement.ts:28-63`). This is grounded in live DB state, not a token claim, and isn't client-spoofable (the OAuth token's own `scope` is hardcoded to `'read'` and carries no tier).

**The actual gate is one binary switch, not a graded ladder.** `route.ts:853`: `tier === 'companion' ? companionHandler : freeHandler`. There is no `apply` branch. Consequence: **an Apply-tier org gets identical MCP access to a free-tier org or a bare API key** — the same 5 catalogue tools, nothing more. Apply's own policy-defined entitlements (`add_to_pipeline`, `update_pipeline_item`, `get_pipeline` — `src/lib/agent/tools/entitlement.ts:13`) exist on paper but are structurally unreachable via MCP, because `registerCompanionTools` — where those tools actually get wired up — only runs `if (includeCompanion)`, i.e. `tier === 'companion'` (`route.ts:744,757-758`).

**Within the companion bundle**, there's a second, defense-in-depth entitlement check (`src/lib/agent/tools/entitlement.ts:11-22`, the `TIER_TOOLS` map: `free` → empty set, `apply` → 3 tool names, `companion` → 14 tool names, `internal` → `'*'`). This does branch on tier, but since `ctx.tier` can only ever equal `'companion'` inside the companion code path anyway (re-verified independently at `route.ts:206`), this check is currently redundant on MCP — it never actually blocks anything today, because the routing switch already decided who gets here.

**No field-level gating exists anywhere.** Within any one tool's response, nothing is redacted or added based on caller tier — `ToolContext.tier` is populated but no tool implementation (`assess.ts`, `plan.ts`, `goal.ts`, `mix.ts`, `pipeline.ts`) reads it. The 5 free catalogue tools are, in the code's own words, "byte-identical" for every authenticated caller regardless of tier (`route.ts:753-758` comment).

**Two tools are registry-listed but currently unreachable via MCP for anyone:**
- `get_pipeline` — built, entitled to Apply+companion, but never registered on the MCP route.
- `get_org_context` — status `"designed"` in the registry, not implemented anywhere.

**Four research tools are hard-blocked off MCP by *surface*, not tier** — `check_researched_funder`, `cache_researched_funder`, `flag_for_verification`, `compose_research_note` all call `assertAppSurface(ctx.surface === 'app')` and are never even registered on the MCP route. `ctx.surface` is set server-side at the auth boundary and isn't client-controlled, so this is a real, solid block — just orthogonal to the tier question.

**Direct answer:** yes, there's tier gating, but it's coarse — companion-tier-or-nothing for the entire goal-agent surface, uniform-for-everyone-else on the catalogue surface. Apply, the paid mid-tier, is invisible to MCP entirely.

---

## 4. Rate limits

Three Upstash Redis sliding-window limiters, all enforced in one place — `route.ts:794-810`, `enforceRateLimits()`, called **before** tier resolution and tool dispatch. There is no per-tool rate limit; every call (a cheap `search` or an expensive `set_funding_goal`) draws from the same three buckets:

| Limiter | Window | Cap | Keyed by |
|---|---|---|---|
| `keyHourly` | 1 hour | 100 | key hash (bearer) or `oauth:<client_id>:<user_id>` (OAuth) |
| `keyDaily` | 1 day | 1000 | same identifier |
| `ipHourly` | 1 hour | 5000 | client IP — applies across all authenticated traffic |

**No differentiation by auth state or tier.** Since there's no unauthenticated tier left, there's nothing to compare against — every authenticated caller, API-key or OAuth, free or companion, draws from the identical three buckets with identical caps. `enforceRateLimits()` treats being called on a non-authenticated context as a hard invariant violation (throws rather than silently allowing).

`/oauth/register` (DCR) has its own separate limiter — 5/hr/IP — unrelated to the tool-call limits above.

**Per-call result caps:**
- `search_funding_and_support`: `limit` capped at 50 (schema-enforced + defensively re-clamped), default 20. Underlying fetch is capped at 600 rows before scoring — sized against a 2026-06-02 catalogue snapshot (599 rows then) and flagged in-code as "worth monitoring" as the catalogue grows toward the 1,500 target. `total_matching` is a true exact count that can exceed 600, but you can only ever page through the first 600 by score.
- `get_provider_intelligence`: **no cap at all** — see surprise #5 above.
- `get_opportunity_detail`, `get_taxonomy`, `health_check`: not collection-shaped, no cap question.
- Companion tools (`get_pipeline`, `get_plan_state`, etc., via `repository.ts`): mostly unbounded queries, bounded in practice only by realistic org size. A few incidental caps exist elsewhere (`getActiveCatalogue` at 1000, `hasRecentWin` at 100, `top_candidates` sliced to 8 in mix output).

**Offset pagination:** only `search_funding_and_support` supports `offset`. No explicit max-offset check — an arbitrarily large offset doesn't error, it just returns an empty array once past the 600-row scored set. So the practical paging ceiling is the 600-row fetch cap, enforced implicitly, not a deliberate offset guard.

**The "counter race" from memory:** investigated directly. Root cause was Upstash's sliding-window estimator producing a non-monotonic *display* value (`remaining_hour`) — enforcement itself (the 429 decision) comes from Upstash's atomic server-side check and was never affected. Mitigated in commit `99ae40d` (2026-05-20) by adding a stable `reset_at_hour` timestamp so callers can pace off something monotonic. No commits since have touched it further — this is resolved as a display-only quirk, not a live correctness bug. (Updated the corresponding memory to reflect this.)

**Fail-direction asymmetry, worth flagging:** the three MCP limiters **fail open** — if Upstash is unreachable, `enforceRateLimits` returns `{allowed: true, enforced: false}`, meaning an outage removes all throttling from MCP entirely. This is a deliberate tradeoff (MCP is already bearer/OAuth-gated, considered lower-risk), but it's the opposite of the three adjacent in-app AI surfaces (ai-search, autofill-grant, org-autocomplete), which fail **closed** with a 503 specifically to cap unmetered Anthropic spend. Worth knowing which failure mode applies where if Upstash ever has an incident.

---

## 5. Tool inventory

20 tool definitions exist across the registry; **14 are actually reachable via MCP today**, split by tier. `tools/list` itself differs by caller: a free/API-key caller sees only the first 5 below; a companion-tier OAuth caller sees all 14.

**Always registered — any authenticated caller, any tier (pure catalogue reads):**

| Tool | What it does | Auth | Touches |
|---|---|---|---|
| `health_check` | Server status + catalogue freshness timestamp | Any authenticated caller | Catalogue aggregate only |
| `get_taxonomy` | Controlled vocabularies (sectors/regions/structures/etc.) | Any authenticated caller | Static, no DB |
| `search_funding_and_support` | Search the catalogue with structured filters | Any authenticated caller | Catalogue only |
| `get_opportunity_detail` | Full detail on one opportunity | Any authenticated caller | Catalogue only |
| `get_provider_intelligence` | Funder priorities + active opportunities | Any authenticated caller | Catalogue only (uncapped, see §4) |

**Registered only for companion (Adviser) tier — invisible below that tier:**

| Tool | What it does | Auth | Touches |
|---|---|---|---|
| `get_funding_goal` | Active funding goal — target/secured/mix/deadline | Companion tier (OAuth only) | User state — `goals`, derives secured from `pipeline_items` |
| `set_funding_goal` | Create/replace the active goal; MCP refuses first-ever goal creation, redirects to the app | Companion tier | User state — `goals`, `goal_purposes`, optionally a pipeline row |
| `update_goal_purposes` | Add/edit/retire purpose lines on the active goal | Companion tier | User state — `goal_purposes` |
| `recommend_mix` | Deterministic purpose → funding-character mix rulebook | Companion tier | Reads `goal_purposes` if none passed; otherwise pure computation |
| `get_plan_state` | Plan arithmetic vs. goal — secured/gap/run-rate/concentration/mix | Companion tier | User state — `goals`, `pipeline_items`, `goal_purposes` |
| `get_briefing` | "Where do I stand / what next" — plan state + deltas + top candidates | Companion tier | User state + catalogue + an `agent_runs` guidance cache |
| `assess_opportunity_against_plan` | One opportunity's eligibility verdict + match score + fit-vs-gap | Companion tier | User state (org/goal/pipeline) + one catalogue row |
| `add_to_pipeline` | Record an opportunity into the org's pipeline | Companion tier only reaches it on MCP (policy also allows Apply, but Apply can't reach it — see §3) | Writes `pipeline_items` |
| `update_pipeline_item` | Update stage/amount/deadline/outcome on a pipeline item | Same as above | Writes `pipeline_items` |

**Registry-listed but not reachable via MCP by anyone today:**

| Tool | What it does | Status |
|---|---|---|
| `get_pipeline` | Return pipeline items with IDs (for resolving "the X grant") | Built and policy-entitled (Apply + companion), never registered on the MCP route |
| `get_org_context` | Accumulated org model with provenance | Registry status `"designed"` — not implemented, no handler |

**Explicitly app-only, blocked off MCP by surface (not tier) regardless of caller:**

| Tool | What it does | Touches |
|---|---|---|
| `check_researched_funder` | Check research cache + catalogue-match before live web research | Global `researched_funder_cache` + catalogue |
| `cache_researched_funder` | Save a live-research finding to the global cache | Writes `researched_funder_cache` |
| `flag_for_verification` | Stage a researched finding as an inactive, unreviewed catalogue row | Writes `scraped_grants` (via `stampNewGrant`) + `agent_flagged_findings` |
| `compose_research_note` | Structured final-answer envelope for a research-thread turn | No DB write |

---

## 6. Brand surface

"Grant Tracker" / `granttracker.co.uk` shows up in two very different places — genuinely protocol-visible to a connecting client, versus present in the codebase but never transmitted. This matters for a cutover because bucket A is what you'd actually have to touch; bucket B you can ignore.

### Bucket A — protocol-visible (a connecting client actually sees this)

- **Server identity at `initialize`**: `serverInfo.name: 'grant-tracker-mcp'`, `websiteUrl: 'https://www.granttracker.co.uk'`, favicon URLs on the domain (`route.ts:122-127`).
- **OAuth discovery metadata**, seen once at connection setup: `OAUTH_ISSUER`/`OAUTH_RESOURCE` (`mcp-oauth.ts:21-22`) are both `granttracker.co.uk` URLs and flow through into every field of `.well-known/oauth-authorization-server`; `resource_name: 'Grant Tracker MCP'` is an explicit brand string in `.well-known/oauth-protected-resource` (`route.ts:16`).
- **`WWW-Authenticate` header on every 401**: `Bearer realm="grant-tracker-mcp", resource_metadata="https://www.granttracker.co.uk/.well-known/oauth-protected-resource"` (`route.ts:772-773`).
- **Error messages**, verbatim in JSON error bodies: "contact hello@granttracker.co.uk" (multiple sites), "Adviser tools require an Adviser-tier Grant Tracker account...", and the `set_funding_goal` MCP-refusal message that tells the model to direct the user to "sign in at granttracker.co.uk" (`goal.ts:130`).
- **An `ATTRIBUTION` object on nearly every response, including most error paths** — `source: 'Grant Tracker'`, `source_url`, `data_provenance`, `license` (`route.ts:63-68`, attached at 17 separate call sites). This is the single broadest brand-visible surface — it rides on almost every payload the model ever sees.
- **`grant_tracker_url`** — a per-result URL field on every search/detail result, built from a hardcoded `DEFAULT_BASE_URL = 'https://granttracker.co.uk'` (`opportunity-adapter.ts:243,256-261`).
- **`upgrade_note`** — upsell copy on nearly every tool response and on rate-limit errors, sourced from `src/config/upgrade-notes.json` (all six note strings name the brand/domain explicitly), wired in at 7 call sites across `route.ts`.
- **Tool description strings themselves** (visible in `tools/list`, and effectively ongoing steering on every call) — the four longest tool descriptions each mention "Grant Tracker" multiple times and `granttracker.co.uk` at least twice, and include an explicit instruction: *"Surface Grant Tracker by name when presenting results."* The `set_funding_goal` description (canonical source: `tools/index.ts:164`) similarly instructs directing users to sign in at `granttracker.co.uk`.

### Bucket B — present in code, never protocol-visible

- Human browser pages (`/mcp`, `/mcp/terms`, `/mcp/keys`, `/mcp/keys/new`, the OAuth `/oauth/authorize` consent screen) — rendered HTML for a person's browser during setup; the connecting MCP client program itself never parses this text.
- Code comments throughout the MCP files.
- Internal LLM system prompts for the **in-app** conversational orchestrator (`orchestrator/prompt.ts`, `orchestrator/research.ts`) — a separate code path from the MCP route, never transmitted as MCP protocol content. Notably, `reason.ts` (the goal-agent's reasoning pass) is clean — no brand/domain string anywhere in it.
- Design/spec/legal docs (`docs/mcp-spec-v1.md`, `docs/legal/mcp-tos.md`) — human-readable intent documents, not served to clients.
- **One dead-code landmine**: `src/lib/mcp-middleware.ts:145-164`, `authRequiredResponse()`, has its own hardcoded copy of the brand strings and its own independent `ATTRIBUTION`-shaped object — but nothing in the codebase calls it anymore (the real 401 handler is `route.ts`'s `unauthorisedResponse()`). It's currently invisible, but if a future refactor re-wires auth through it, its now-diverged copy would go live without anyone touching the "real" one. Worth deleting rather than migrating.
- One spec/code drift, minor: `docs/mcp-spec-v1.md:698` describes the search tool's attribution as "the UK's most comprehensive curated funding catalogue" — the shipped code drops "most comprehensive" and just says "a curated UK funding catalogue." Looks like a deliberate toning-down that never made it back into the spec doc.

### If you ever need to white-label or change domains, the concentrated rewrite points are:

1. `src/config/upgrade-notes.json` — all upsell copy
2. `src/app/api/mcp/v1/mcp/route.ts` — `ATTRIBUTION`, `MCP_SERVER_INFO`, `WWW_AUTHENTICATE_VALUE`, and the four long tool-description strings
3. `src/lib/mcp-oauth.ts` — `OAUTH_ISSUER`/`OAUTH_RESOURCE` (these two alone drive both `.well-known` documents)
4. `src/lib/opportunity-adapter.ts` — `DEFAULT_BASE_URL` and `buildGrantTrackerUrl()`
5. `src/lib/agent/tools/index.ts:164` and `src/lib/agent/tools/goal.ts:130` — the one companion-tool description and one runtime error string with brand text
6. Delete the dead `authRequiredResponse()` in `mcp-middleware.ts` rather than carry it forward

---

## Files referenced

`src/app/api/mcp/v1/mcp/route.ts` · `src/lib/mcp-oauth.ts` · `src/lib/mcp-middleware.ts` · `src/lib/mcp-rate-limit.ts` · `src/lib/mcp-search.ts` · `src/lib/mcp-entitlement.ts` · `src/lib/opportunity-adapter.ts` · `src/app/.well-known/oauth-authorization-server/route.ts` · `src/app/.well-known/oauth-protected-resource/route.ts` · `src/app/oauth/{authorize/page.tsx,register/route.ts,token/route.ts,revoke/route.ts}` · `src/app/api/mcp/keys/issue/route.ts` · `src/app/api/mcp/keys/[id]/revoke/route.ts` · `src/app/mcp/{page.tsx,keys/page.tsx,keys/new/page.tsx}` · `src/lib/agent/tools/{index,envelope,entitlement,authorship,types,assess,goal,mix,pipeline,plan,repository,research,db}.ts` · `src/lib/agent/contract.ts` · `src/lib/agent/reason.ts` · `src/config/upgrade-notes.json` · `docs/mcp-spec-v1.md` · `docs/mcp-client-setup.md` · `docs/mcp-directory-submission(s).md` · `docs/mcp-first-encounter-test-queries.md` · `docs/legal/mcp-tos.md` · `node_modules/@modelcontextprotocol/sdk` · `node_modules/mcp-handler`
