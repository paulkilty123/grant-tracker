# Grant Tracker MCP — client setup

How to connect an MCP client to the Grant Tracker MCP server.

**Server URL:** `https://www.granttracker.co.uk/api/mcp/v1/mcp`

> The `www.` subdomain is required. The apex 307-redirects to `www.`, and a
> redirect strips the `Authorization` header — so a client that follows the
> redirect loses its credentials and sees a 401 loop. Address `www.` directly.

**Transport:** Streamable HTTP, JSON-RPC over **POST**. `GET` and `DELETE`
return 405. The server is stateless: no session is established and no
`Mcp-Session-Id` is issued, so every POST is self-contained.

**Authentication:** OAuth 2.0 with Dynamic Client Registration (RFC 7591) and
PKCE (S256 required). There is **no anonymous access** — every unauthenticated
request returns 401 with a `WWW-Authenticate` challenge pointing at the
protected-resource metadata. That 401 is deliberate: it's what triggers OAuth
discovery in connector-style clients.

> Origins and brand strings are environment-driven (`src/lib/mcp-brand.ts`).
> If the deployment's `MCP_PUBLIC_ORIGIN` / `MCP_APP_ORIGIN` differ from the
> defaults above, substitute accordingly.

---

## Connecting a client

Most MCP clients that support remote servers with OAuth need only the server
URL. The flow is automatic:

1. Client POSTs to the server without credentials → **401** plus
   `WWW-Authenticate: Bearer realm="grant-tracker-mcp", resource_metadata="…"`
2. Client fetches `/.well-known/oauth-protected-resource` → learns the
   authorization server
3. Client fetches `/.well-known/oauth-authorization-server` → learns the
   `registration_endpoint`, `authorization_endpoint`, `token_endpoint`
4. Client self-registers via DCR at `/oauth/register` (public client,
   `token_endpoint_auth_method: none`)
5. User is sent to `/oauth/authorize`, signs in, approves the consent screen
6. Client exchanges the authorization code (with `code_verifier`) for an
   access token at `/oauth/token`
7. Subsequent calls carry `Authorization: Bearer gt_oat_…`

Access tokens last 1 hour; refresh tokens last 30 days and rotate on use.
Revocation is available at `/oauth/revoke` (RFC 7009).

**Redirect URIs:** any public `https` URI is accepted at registration.
`http`, loopback, and private/link-local addresses are rejected in production.
There is no per-vendor allowlist — the server is client-agnostic.

---

## Verifying the server responds

The unauthenticated 401 is itself the useful health signal — it proves the
endpoint is live and advertising OAuth correctly:

```bash
curl -s -i -X POST https://www.granttracker.co.uk/api/mcp/v1/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{
        "protocolVersion":"2025-06-18","capabilities":{},
        "clientInfo":{"name":"manual-test","version":"0.1"}}}'
```

Expect `HTTP/2 401`, a `WWW-Authenticate` header naming the resource metadata
URL, and a JSON body with `error.code: "auth_required"`.

Both discovery documents can be fetched without credentials:

```bash
curl -s https://www.granttracker.co.uk/.well-known/oauth-protected-resource
curl -s https://www.granttracker.co.uk/.well-known/oauth-authorization-server
```

With a valid token, `initialize` returns
`serverInfo: { name: "grant-tracker-mcp", version: "1.4.0" }` and capabilities
listing `tools: { listChanged: true }`.

---

## What a connected client sees

Five catalogue tools are available to every authenticated caller:

| Tool | Purpose |
|---|---|
| `health_check` | Server status and catalogue freshness |
| `get_taxonomy` | Controlled vocabularies for filter values |
| `search_funding_and_support` | Search the catalogue with structured filters |
| `get_opportunity_detail` | Full detail on one opportunity |
| `get_provider_intelligence` | Funder priorities and active opportunities |

Accounts on the Adviser tier additionally see the goal-agent tools
(funding goal, plan state, briefing, opportunity assessment, pipeline writes)
when connected over OAuth. `tools/list` reflects the caller's tier.

---

## Rate limits

Enforced per credential and per IP, before any tool runs:

| Limit | Window | Cap |
|---|---|---|
| Per credential | 1 hour | 100 |
| Per credential | 1 day | 1000 |
| Per IP | 1 hour | 5000 |

Responses carry `rate_limit_status` with `remaining_hour`, `remaining_day` and
`reset_at_hour`. `remaining_hour` is a sliding-window estimate and is not
strictly monotonic between calls — pace against `reset_at_hour`, not against
the remaining count. See spec §6.4.

---

## Troubleshooting

- **401 `auth_required`** → no valid credential. There is no anonymous tier;
  complete the OAuth flow. If a client loops on 401, check it is addressing
  `www.` directly and not following a redirect that drops the header.
- **429 with `Retry-After`** → rate-limited. `details.which_limit` names the
  counter that blocked (`key_hourly`, `key_daily`, `ip_hourly`).
- **405** → the request used `GET` or `DELETE`. Only `POST` is served.
- **Tools don't appear** → confirm the client speaks Streamable HTTP rather
  than the legacy HTTP+SSE transport; the `/sse` and `/message` endpoints are
  not served.
- **CORS errors from a browser** → MCP here is server-side only. Use a backend
  proxy if calling from a browser context.

---

## Legacy bearer keys

Static `gt_mcp_…` keys are still validated at the protocol layer, but the
self-serve issuance route is orphaned (the `/mcp/keys/new` sign-in path
dead-ends) and is not the supported way to connect. Existing keys continue to
work and are always served the five free catalogue tools regardless of the
owning account's tier. New integrations should use OAuth.

---

## Reference

- Full spec: [`docs/mcp-spec-v1.md`](./mcp-spec-v1.md)
- One-page summary: [`docs/mcp-spec-v1-at-a-glance.md`](./mcp-spec-v1-at-a-glance.md)
- Server audit (30 Jul 2026): [`docs/mcp-server-audit-2026-07-30.md`](./mcp-server-audit-2026-07-30.md)
- ToS: [`docs/legal/mcp-tos.md`](./legal/mcp-tos.md)
