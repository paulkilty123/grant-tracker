/**
 * Single source of truth for brand-derived values. Everything that changes
 * at rebrand (name, domain, contact addresses, MCP identifiers) goes through
 * this module — cutover is a one-file edit rather than a repo-wide grep.
 *
 * Rule: no hardcoded product name, domain or contact address anywhere in
 * JSX, copy, prompts or config — always reference `brand.*`.
 *
 * NOT in scope here: the `gt_oat_`/`gt_ort_`/`gt_mcp_` token-prefix
 * constants in mcp-oauth.ts and mcp-auth.ts. Those are baked into the
 * *format* of API keys and OAuth tokens already issued and stored in the
 * database — they are credential formats, not brand copy, and must not
 * change on a rebrand.
 */
export const brand = {
  name: 'Grant Tracker',
  domain: 'granttracker.co.uk',
  siteUrl: 'https://www.granttracker.co.uk',
  email: {
    alerts: 'alerts@granttracker.co.uk',
    hello: 'hello@granttracker.co.uk',
  },
  mcp: {
    // Server identifier / Bearer realm — lowercase-hyphenated slug.
    serverSlug: 'grant-tracker-mcp',
    // Human-facing "<product> MCP" phrasing.
    productName: 'Grant Tracker MCP',
  },
  // Slug used in generated filenames, e.g. `${brand.exportSlug}-export-${date}.json`.
  exportSlug: 'grant-tracker',
  // Outbound scraper/enrichment User-Agent. Kept short and identifiable —
  // some funder sites 403 on a changed or unrecognised UA, so verify a few
  // scrape targets still resolve after changing this at rebrand time.
  userAgent: 'GrantTracker/1.0',
  userAgentBuilder: 'GrantTrackerBuilder/1.0',
} as const

export type Brand = typeof brand
