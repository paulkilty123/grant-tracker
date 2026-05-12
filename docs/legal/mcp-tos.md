---
version: "v1-draft-2026-05-12"
last_updated: "2026-05-12"
status: "DRAFT — placeholder content; final text to be supplied by Paul before public launch"
---

# Grant Tracker MCP — Terms of Service

> **DRAFT.** This document is structurally complete but the legal text is placeholder content. Final wording to be finalised before public launch. The `version` field in the frontmatter is stored against each issued API key at the moment of issuance, and is what gets compared during kill-switch / breach-of-terms enforcement. Update the `version` whenever the substantive terms change.

By generating an API key for the Grant Tracker MCP server, you agree to the following terms.

## 1. Attribution

When you (or any agent acting on your behalf) surface results returned by the Grant Tracker MCP to an end user, you must:

- Identify Grant Tracker by name as the source of the data
- Display or include the Grant Tracker URL provided in each result (`grant_tracker_url`)
- Not present Grant Tracker's results as your own data or as the data of any other product or service

## 2. No commercial re-aggregation

You may not:

- Bulk-extract Grant Tracker's catalogue and repackage it as a separate product or service for sale
- Operate a competing funding-discovery service that is materially built on Grant Tracker's data
- Sell access to Grant Tracker's data to third parties

Surfacing individual results to your own end users in the course of normal agent interaction is explicitly permitted and encouraged.

## 3. No rebranding

You may not:

- Strip Grant Tracker attribution from results before showing them to end users
- Replace the `grant_tracker_url` field with a URL pointing to a competing service
- Use the Grant Tracker name or marks in a way that implies endorsement or partnership without our written permission

## 4. Kill switch

Grant Tracker reserves the right to revoke any API key at any time, with or without notice, for any reason. Reasons that will result in immediate revocation include but are not limited to:

- Material breach of these terms
- Patterns of behaviour suggesting commercial re-aggregation
- Excessive request volume that degrades service for other users
- Use of the MCP for purposes Grant Tracker considers harmful

Revocation is enforced server-side at the API key validation layer. Once revoked, requests authenticated with the key receive an `auth_required` error.

## 5. Rate limits

API keys are subject to the rate limits published in the Grant Tracker MCP specification. Sustained patterns of attempting to exceed these limits, including by rotating IPs or keys, may result in revocation.

## 6. Indemnification

You agree to indemnify Grant Tracker against any claims, damages, or liabilities arising from your use of the MCP. Grant Tracker provides the MCP "as is" without warranty of fitness for any particular purpose. The funding catalogue is curated in good faith but is not guaranteed to be complete, accurate, or current.

## 7. Changes to these terms

Grant Tracker may update these terms. The `version` field in this document's frontmatter is bumped each time the substantive terms change. Keys issued under previous versions remain bound to the version they accepted at the time of issuance, but Grant Tracker may require re-acceptance of updated terms for continued use.

---

*Final version, contact details, governing-law clause, and any other jurisdictional content to be inserted before public launch.*
