# Anthropic MCP submission — heads-up email (draft)

Send to: **mcp-review@anthropic.com**
Drafted: 2026-05-21 (revised after OAuth decision). Plan: send Wed morning 2026-05-22.

---

**Subject:** Heads-up — building OAuth 2.0 for Connectors Directory submission

Hi,

Quick note that I'm building OAuth 2.0 with Dynamic Client Registration for an upcoming Connectors Directory submission. Server: Grant Tracker, UK funding discovery for charities, CICs, and social enterprises. Five read-only tools, integration-tested.

URL (already live, currently bearer-key auth): https://www.granttracker.co.uk/api/mcp/v1/mcp

If there are any implementation gotchas worth knowing about before submission — particular discovery endpoint quirks, edge cases reviewers commonly flag, anything around DCR validation — I'd appreciate a heads-up. Otherwise will reach out when the OAuth flow is ready.

Thanks,
Paul

---

## Reference

- Form: https://clau.de/mcp-directory-submission
- Submission docs: https://claude.com/docs/connectors/building/submission
- Auth docs: https://claude.com/docs/connectors/building/authentication
- Pre-submission checklist: https://claude.com/docs/connectors/building/review-criteria
