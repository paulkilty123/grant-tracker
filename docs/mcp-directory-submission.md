# Grant Tracker — MCP Directory Submission (#31)

> Working draft for human editing passes. Status: assembled, awaiting final read +
> category options + Pulse Track tile, then submit.
> Note: reviewer password removed from this file 2026-06-16 — it now lives in the password manager only.

## Server name
Grant Tracker

## Tagline
UK funding help for charities, CICs, social enterprises
(55 chars — within the 55 cap. Exact requested string with "&" was 56; swapped "&"→serial comma to fit.)

## Description

**Grant Tracker is a verified funding adviser for UK charities, CICs, social enterprises and community groups — not a search box over a list of grants.**

Most funding tools dump a long list and leave you to guess. Grant Tracker is built to do what a good fundraising adviser does: tell you **what you're genuinely eligible for**, **what to skip** (invitation-only funds, region or structure mismatches, closed rounds), and **what you haven't thought of** — the programme, social-investment or in-kind support adjacent to the grant you searched for.

Every opportunity is scraped from the funder's own site, classified, and deadline-tracked, with its URL validated weekly — so the adviser leads with the funder's own page as the primary citation, and you can verify any claim at source and apply directly. When a query returns nothing, it explains *why* (data gap vs. filters too narrow) and suggests honest alternatives rather than padding the list.

It's a read-only window onto a curated UK funding catalogue (~600 live opportunities across grants, programmes, social investment and in-kind support), with deeper personalised matching, eligibility verdicts and pipeline tracking available in the full Grant Tracker app.

## Use cases
(Include all four if the form allows four; if capped at three, use 1–3 and drop 4 — structure-awareness shows implicitly in the others.)

1. **Small place-based arts org** — "We're a volunteer-run community arts group in Margate. What culture funding can we actually access?" → searches sector + region (handles `arts`→creative, `Kent`/`South East`), surfaces local **and** UK-wide funders, flags which to skip.
2. **Established charity diversifying income** — "We're over-reliant on one grant. What programmes, social investment or in-kind support could we consider?" → spans all four funding types + provider intelligence to surface options beyond grants.
3. **Youth charity checking eligibility before applying** — "Grants for young people's mental health in London — and are we actually eligible?" → beneficiary + region + sector filters, then an eligibility/structure read so they don't waste time on funds they can't get.
4. **New CIC orienting itself** — "We're a CIC limited by guarantee. Which funders even accept our structure, and what's open now?" → structure-aware filtering + "closing soon" view.

## Connection details
- Remote MCP server URL: `https://www.granttracker.co.uk/api/mcp/v1/mcp`
- Allowed link URIs: `https://granttracker.co.uk` and `https://www.granttracker.co.uk`
- Transport: Streamable HTTP (JSON-RPC)
- Auth: OAuth 2.0 with Dynamic Client Registration (`/oauth/register`); PKCE (S256); no static client ID/secret required
- Access: read-only — all 5 tools are `readOnlyHint: true`
- Tools: `search_funding_and_support`, `get_opportunity_detail`, `get_provider_intelligence`, `get_taxonomy`, `health_check`
- Server version: 1.4.0

## Privacy & terms
- Privacy policy: https://granttracker.co.uk/privacy
- MCP terms of service: https://granttracker.co.uk/mcp/terms

## Support
hello@granttracker.co.uk — we aim to respond within 2 business days.

## Test credentials
- URL: https://granttracker.co.uk (or connect the MCP directly via OAuth — same login authorises the connector)
- Email: `reviewer@granttracker.co.uk`
- Password: **not stored in version control** — see the "MCP reviewer login" entry in the password manager. (Previously committed here and still in git history. The reviewer needs this exact password during the Anthropic review, so rotate it AFTER the review completes — not now.)
- Pre-onboarded demo org ("Riverside Community Trust") — reviewers skip all cohort setup and land on the dashboard / can search immediately. Login verified via the auth endpoint.

## Categories / tags
TBD — pending the form's actual category options (do not guess). Likely candidates if offered: Nonprofit / Fundraising, Data & Research.

## Cover note

Hi,

Submitting **Grant Tracker** for the MCP directory — a read-only MCP server that acts as a verified funding adviser for UK charities, CICs, social enterprises and community groups, backed by a regularly URL-validated catalogue of ~600 live UK funding opportunities. Auth is OAuth 2.0 with Dynamic Client Registration; connection and test credentials are below.

Two questions:
1. What's the expected review window for a submission like this?
2. Can a test-mode / soft-launch approval precede the full public listing, so we can validate with a limited audience before going wide?

One bit of context you might find relevant: Grant Tracker was built solo, without prior coding experience, using Claude Code, by a 20-year veteran of the UK fundraising sector — so the product judgement comes from two decades in the field, and the engineering came from Claude.

Happy to provide anything else you need.

## Verified data cadences (reference — keeps the description honest)
- Scrape from funder sites: twice weekly (Mon + Thu, 06:00)
- Classify / re-enrich: daily (03:30)
- Deadline tracking: daily (02:00 / 04:30 / 07:00)
- URL validation: weekly (Sun 03:00)
