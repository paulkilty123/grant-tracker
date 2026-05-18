# MCP Directory Submission Copy

Final copy for the three directory submissions (Claude / ChatGPT / Gemini), held until multi-client testing clears. Drafted 2026-05-18.

**Sequencing:** submissions wait for the manual multi-client smoke plan (`docs/mcp-client-setup.md`) to pass on each client. If a client surfaces a real compatibility issue, fix it before listing your name against the offer.

**Standing notes:**

- All three intentionally avoid a hardcoded catalogue count (e.g. "450+ opportunities"). Directory listings sit for months; counts go stale fast. Breadth signal comes from "grants + accelerator programmes + social investment + in-kind support" — already more than most competitors offer, and stable as the catalogue grows.
- All three soften the coverage claim to "a UK-focused, curated funding catalogue" rather than "the UK's most comprehensive". The latter is a comparative claim that needs SQL-verified validation vs My Funding Central / Funds Online / Charity Excellence — that comparison hasn't been done, so the softer phrasing is what's defensible. See `feedback_coverage_claim_honesty_check.md`.
- "Five tools" appears in the Gemini draft. If a sixth tool ships post-launch (search-by-funder, get-similar-opportunities, etc.), rephrase to capability-language: *"tools for searching opportunities, fetching detail, provider intelligence, taxonomy, and health checks"* — describes capability without committing to count.
- The "Free API key required — get yours at granttracker.co.uk/mcp" line is standardised across all three so the friction is visible upfront.

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

## ChatGPT Apps (broader consumer audience)

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

## Gemini (developer-leaning)

> **Grant Tracker MCP — UK funding discovery via Model Context Protocol**
>
> Server: `https://www.granttracker.co.uk/api/mcp/v1/mcp` (Streamable HTTP, JSON-RPC). Five tools: `search_funding_and_support`, `get_opportunity_detail`, `get_provider_intelligence`, `get_taxonomy`, `health_check`.
>
> Catalogue: curated UK grants, programmes, social investment, and in-kind support. Filterable by sector, region (12 UK regions), organisational structure (CIC variants, CIO, SCIO, registered charity, etc.), funding type, amount range, beneficiary group, and deadline window. UK-specific eligibility logic, honest 0-result diagnostics with adjacent suggestions.
>
> Auth: API key via `Authorization: Bearer`. Anonymous fallback at 10/hr per IP. Authenticated at 100/hr, 1,000/day.
>
> Free API key required — full documentation at granttracker.co.uk/mcp.
