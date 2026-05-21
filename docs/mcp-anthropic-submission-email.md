# Anthropic MCP submission — auth question (draft email)

Send to: **mcp-review@anthropic.com**
Drafted: 2026-05-21. Plan: send Wed morning 2026-05-22.

---

**Subject:** Remote MCP submission — auth approach for user-issued API keys

Hi,

I'm preparing to submit a remote MCP server to the Connectors Directory and want to confirm the right auth approach before I submit.

Server: Grant Tracker — UK funding discovery for charities, CICs, and social enterprises. Five read-only tools, integration-tested.

URL: https://www.granttracker.co.uk/api/mcp/v1/mcp

Auth today: `Authorization: Bearer <api_key>`, with users self-serving keys at granttracker.co.uk/mcp (free, no payment required).

I saw in the docs that `static_bearer` isn't supported. Two questions:

1. Could `custom_connection` cover our case — user supplies their API key once when adding the connector, key persists for future requests?
2. If not, would `none` (anonymous, using our existing 10/hr/IP trial limit) be acceptable for v1, with OAuth 2.0 planned for v1.1?

The server works anonymously for `health_check`, so happy to send a test account or jump on a call if useful.

Thanks,
Paul

---

## After sending

Reply from Anthropic determines next moves:

- **If `custom_connection` works** → pre-flight + submit through the form at https://clau.de/mcp-directory-submission
- **If `none` is acceptable for v1** → consider whether the rate-limit trade-off is OK pre-launch; if yes, submit anonymous, plan OAuth for v1.1 post-launch
- **If neither** → OAuth 2.0 work is required pre-submission. Significantly larger scope. Probably means delaying directory submission until after public launch.

## Reference

- Form: https://clau.de/mcp-directory-submission
- Submission docs: https://claude.com/docs/connectors/building/submission
- Auth docs: https://claude.com/docs/connectors/building/authentication
- Pre-submission checklist: https://claude.com/docs/connectors/building/review-criteria
