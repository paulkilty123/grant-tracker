# MCP Directory Submission Copy

Final copy for the Claude MCP directory submission. Drafted 2026-05-18.

**Sequencing:** submission waits for the Claude Desktop smoke test (`docs/mcp-smoke-test-sheet.md`) to pass clean.

**Status 2026-05-20:** dropped ChatGPT and Gemini directory submissions — the MCP server itself still works across all three clients for developers who self-configure (see `docs/mcp-client-setup.md`), but the directory listings are Claude-only. ChatGPT/Gemini submission drafts retained at the bottom of this file under "Archived" in case the decision is revisited.

**Standing notes:**

- Avoid a hardcoded catalogue count (e.g. "450+ opportunities"). Directory listings sit for months; counts go stale fast. Breadth signal comes from "grants + accelerator programmes + social investment + in-kind support" — already more than most competitors offer, and stable as the catalogue grows.
- Coverage claim softened to "a UK-focused, curated funding catalogue" rather than "the UK's most comprehensive". The latter is a comparative claim that needs SQL-verified validation vs My Funding Central / Funds Online / Charity Excellence — that comparison hasn't been done, so the softer phrasing is what's defensible. See `feedback_coverage_claim_honesty_check.md`.
- The "Free API key required — get yours at granttracker.co.uk/mcp" line is the upfront-friction disclosure.

---

## Claude (Anthropic MCP directory)

> **Grant Tracker — UK funding for charities, CICs, and social enterprises**
>
> Ask Claude to find funding for your UK organisation. Search a curated catalogue of UK grants, accelerator programmes, social investment, and in-kind support, with results filtered against your sector, region, structure, and amount range. UK-specific eligibility logic handles CIC variants, charity registration, devolved nations, and regional scope — useful when generic global tools surface mostly US opportunities.
>
> Honest 0-results when the catalogue genuinely doesn't have a match, with adjacent suggestions explaining what's close.
>
> For deeper personalised match scoring against your organisation's profile, save-to-pipeline with deadline tracking, and curated funder application guidance, visit granttracker.co.uk where the catalogue is fully maintained.
>
> Free API key required — get yours at granttracker.co.uk/mcp.

---

## Archived — dropped 2026-05-20

The two drafts below are retained as reference. The decision to skip the ChatGPT and Gemini directory submissions was about distribution focus, not server compatibility — the MCP endpoint still works for developers connecting from those clients via the patterns in `docs/mcp-client-setup.md`.

### ChatGPT Apps (broader consumer audience) — ARCHIVED

> **Find UK funding for your charity or social enterprise — without leaving ChatGPT**
>
> Grant Tracker is a UK-focused, curated funding catalogue covering grants, accelerator programmes, social investment, and in-kind support. Ask ChatGPT what's available for your work, what's closing this month, or whether a specific funder is a good fit for your organisation.
>
> Built specifically for UK charities, CICs, community interest companies, and social enterprises. Each result includes funder details, eligibility hints, and direct application links.
>
> For deeper personalised matching against your organisation, deadline tracking, and a curated library of insider application guidance, visit granttracker.co.uk.
>
> Free API key required — get yours at granttracker.co.uk/mcp.

---

### Gemini (developer-leaning) — ARCHIVED

> **Grant Tracker MCP — UK funding discovery via Model Context Protocol**
>
> Server: `https://www.granttracker.co.uk/api/mcp/v1/mcp` (Streamable HTTP, JSON-RPC). Five tools: `search_funding_and_support`, `get_opportunity_detail`, `get_provider_intelligence`, `get_taxonomy`, `health_check`.
>
> Catalogue: curated UK grants, programmes, social investment, and in-kind support. Filterable by sector, region (12 UK regions), organisational structure (CIC variants, CIO, SCIO, registered charity, etc.), funding type, amount range, beneficiary group, and deadline window. UK-specific eligibility logic, honest 0-result diagnostics with adjacent suggestions.
>
> Auth: API key via `Authorization: Bearer`. Anonymous fallback at 10/hr per IP. Authenticated at 100/hr, 1,000/day.
>
> Free API key required — full documentation at granttracker.co.uk/mcp.
