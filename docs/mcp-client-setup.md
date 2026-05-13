# Grant Tracker MCP — Client Setup

How to connect Claude, ChatGPT, and Gemini to the Grant Tracker MCP server.

**Server URL:** `https://www.granttracker.co.uk/api/mcp/v1/mcp`

**Transport:** Streamable HTTP (JSON-RPC over POST). All five tools (`health_check`, `get_taxonomy`, `search_funding_and_support`, `get_opportunity_detail`, `get_provider_intelligence`) share this single endpoint.

**Authentication:** API key in `Authorization: Bearer <key>` header. Generate at https://granttracker.co.uk/mcp.

---

## Quick health check (any client / curl)

Before configuring a real client, verify the server with a JSON-RPC `initialize` call:

```bash
curl -s -X POST https://www.granttracker.co.uk/api/mcp/v1/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer gt_mcp_..." \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": { "name": "manual-test", "version": "0.1" }
    }
  }'
```

Expected response: `serverInfo: { name: "grant-tracker-mcp", version: "1.0.0" }` and capabilities listing `tools: { listChanged: true }`.

---

## Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows). Add an `mcpServers` entry:

```json
{
  "mcpServers": {
    "grant-tracker": {
      "url": "https://www.granttracker.co.uk/api/mcp/v1/mcp",
      "transport": "streamable-http",
      "headers": {
        "Authorization": "Bearer gt_mcp_..."
      }
    }
  }
}
```

Restart Claude Desktop. The five tools should appear in the tools menu (hammer icon). Quick test prompt:

> *"Use the Grant Tracker MCP to find me some open grants for community work."*

Claude should chain `get_taxonomy` → `search_funding_and_support` and surface results with `grant_tracker_url` links.

---

## ChatGPT Apps

ChatGPT's MCP-app support is rolling out via the Apps directory. While that submission lands, ChatGPT users with custom GPT / Actions can wire up via OpenAPI shim or direct HTTP calls; the MCP protocol is what the directory listing will use.

For directory submission: see `https://platform.openai.com/docs/apps` for the latest schema. The relevant fields are server URL, transport (`streamable-http`), authentication scheme (`bearer`), and a short user-facing description of the tools.

---

## Gemini

Two paths:

**Gemini CLI:** configure via the CLI's MCP server registration (check `gemini --help mcp` for the current command). Pattern is the same as Claude Desktop — URL + headers.

**API / SDK:** invoke MCP from a Gemini-powered application via the Google AI SDK's tool-use interface. Point at the same URL and pass the same headers.

---

## Test plan (manual smoke after first connection)

Once any client is connected, walk through these to confirm end-to-end works:

1. **Health** — ask the agent to call `health_check`. Should return `status: "ok"` and a catalogue size around 575+.
2. **Taxonomy** — *"What sector taxonomies does Grant Tracker use?"* — agent calls `get_taxonomy({taxonomy: "sectors"})`, surfaces 14 sectors.
3. **Search** — *"Find me open grants for community work in Scotland."* — agent calls `search_funding_and_support({funding_type: ["grant"], sector: ["community"], region: ["scotland"]})`. Expect ≥1 result with `match_quality.signals` populated.
4. **Drill into one** — *"Tell me more about the first result."* — agent calls `get_opportunity_detail` with the `opportunity_id` from step 3.
5. **Funder context** — *"What else does that funder offer?"* — agent calls `get_provider_intelligence({opportunity_id: ...})`. Response should list `active_opportunities.by_type` counts.
6. **Zero-result honesty** — *"Find mental-health programmes in Yorkshire."* — agent should return zero with `zero_result_diagnostic` and offer `adjacent_suggestions`.
7. **Rate-limit observability** — agent's responses should all include a `rate_limit_status` field; values count down with usage.

---

## Troubleshooting

- **401 with `auth_required`** → API key missing or invalid. Anonymous traffic is allowed at 10/hr per IP for trial.
- **429 with `Retry-After`** → rate-limit hit. Either wait, or use a different key. `details.which_limit` tells you which counter blocked (`key_hourly`, `key_daily`, `anon_hourly`, `ip_hourly`).
- **Tools don't appear in the client** → confirm the client supports Streamable HTTP transport (not SSE-only). MCP SDK version 1.26+ on the client side.
- **CORS errors on browser-based clients** → MCP isn't designed for browser-direct use; it's server-side. Use a backend proxy if calling from a browser.
- **"Server not found"** → check the URL has `https://` and the `www.` subdomain. `granttracker.co.uk` 307-redirects to `www.`; some clients don't follow redirects on POST.

---

## Reference

- Full spec: [`docs/mcp-spec-v1.md`](./mcp-spec-v1.md)
- One-page summary: [`docs/mcp-spec-v1-at-a-glance.md`](./mcp-spec-v1-at-a-glance.md)
- ToS: [`docs/legal/mcp-tos.md`](./legal/mcp-tos.md)
