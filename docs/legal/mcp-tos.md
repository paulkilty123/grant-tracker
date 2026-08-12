---
version: "v2-2026-08-12"
last_updated: "2026-08-12"
status: "Live"
---

# Shoots MCP Terms of Service

In August 2026 Grant Tracker became Shoots. This version differs from v1 only in the
name, the endpoint, and the contact address; nothing about the terms themselves
changed.

By generating an API key for the Shoots MCP server at
`https://www.shootsfunding.co.uk/api/mcp/v1/mcp`, you agree to the following terms.
The `version` field in this document's frontmatter is recorded against each issued key
at the moment of issuance and is what governs the key.

## 1. Attribution

When you (or any agent acting on your behalf) surface results returned by the Shoots
MCP to an end user, you must:

- Identify Shoots by name as the source of the data
- Display or include the Shoots URL provided in each result (`grant_tracker_url`)
- Not present Shoots' results as your own data or as the data of any other product or service

The `grant_tracker_url` response field keeps its original name. It is a wire-format
identifier that existing clients parse, so it was deliberately not renamed with the
brand; the URL it carries points at Shoots.

## 2. No commercial re-aggregation

You may not:

- Bulk-extract Shoots' catalogue and repackage it as a separate product or service for sale
- Operate a competing funding-discovery service that is materially built on Shoots' data
- Sell access to Shoots' data to third parties

Surfacing individual results to your own end users in the course of normal agent interaction is explicitly permitted and encouraged.

## 3. No rebranding

You may not:

- Strip Shoots attribution from results before showing them to end users
- Replace the `grant_tracker_url` field with a URL pointing to a competing service
- Use the Shoots name or marks in a way that implies endorsement or partnership without our written permission

## 4. Kill switch

Shoots reserves the right to revoke any API key at any time, with or without notice, for any reason. Reasons that will result in immediate revocation include but are not limited to:

- Material breach of these terms
- Patterns of behaviour suggesting commercial re-aggregation
- Excessive request volume that degrades service for other users
- Use of the MCP for purposes Shoots considers harmful

Revocation is enforced server-side at the API key validation layer. Once revoked, requests authenticated with the key receive an `auth_required` error.

## 5. Rate limits

API keys are subject to the rate limits published in the Shoots MCP specification. Sustained patterns of attempting to exceed these limits, including by rotating IPs or keys, may result in revocation.

## 6. Indemnification

You agree to indemnify Shoots against any claims, damages, or liabilities arising from your use of the MCP. Shoots provides the MCP "as is" without warranty of fitness for any particular purpose. The funding catalogue is curated in good faith but is not guaranteed to be complete, accurate, or current.

## 7. Changes to these terms

Shoots may update these terms. The `version` field in this document's frontmatter is bumped each time the substantive terms change, and also when the service is renamed, as it was for v2. Keys issued under previous versions remain bound to the version they accepted at the time of issuance, but Shoots may require re-acceptance of updated terms for continued use.

## 8. Contact

For questions about these terms, key issuance, or revocation, email hello@shootsfunding.co.uk.

## 9. Governing law

These terms are governed by the laws of England and Wales. Any disputes will be subject to the exclusive jurisdiction of the courts of England and Wales.
