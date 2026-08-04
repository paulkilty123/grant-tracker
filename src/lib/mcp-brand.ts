// MCP brand + origin configuration — the single flip point for a rebrand or
// domain move.
//
// Every MCP-visible surface (protocol metadata, OAuth discovery documents,
// attribution blocks, tool descriptions, upgrade notes) reads its brand name
// and origins from here instead of hardcoding them. Changing brand or domain
// is then one env change per environment, not a code change spread across a
// dozen files.
//
// TWO origins, deliberately kept separate — they genuinely differ in
// production today, and collapsing them would change behaviour:
//
//   MCP_PUBLIC_ORIGIN  Protocol / canonical surface: OAuth issuer + resource,
//                      serverInfo.websiteUrl + icons, WWW-Authenticate
//                      resource_metadata. Uses the *www* host because the
//                      apex→www redirect strips the Authorization header, so
//                      bearer-token traffic has to address www directly.
//
//   MCP_APP_ORIGIN     User-facing links the model surfaces to a human:
//                      grant_tracker_url, attribution source_url, upgrade
//                      notes. Uses the *apex* host, which is what the app's
//                      own outbound links have always used.
//
// If a future domain has no apex/www split, set both to the same value.
//
// Defaults reproduce current production exactly, so an unset environment is a
// no-op. A malformed override throws at module load rather than silently
// emitting broken URLs — same fail-loud posture as mcp-upgrade-notes.ts.

function readOrigin(name: string, fallback: string): string {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback

  const trimmed = raw.replace(/\/+$/, '')
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error(`${name} is not a valid absolute URL: ${JSON.stringify(raw)}`)
  }
  if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') {
    throw new Error(`${name} must use https (got "${parsed.protocol}//") — ${JSON.stringify(raw)}`)
  }
  return trimmed
}

function readString(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback
}

/** Protocol / canonical origin. OAuth + server metadata address this host. */
export const MCP_PUBLIC_ORIGIN = readOrigin('MCP_PUBLIC_ORIGIN', 'https://www.granttracker.co.uk')

/** User-facing origin. Links handed to a human resolve here. */
export const MCP_APP_ORIGIN = readOrigin('MCP_APP_ORIGIN', 'https://granttracker.co.uk')

/** Display name used in attribution and prose. */
export const MCP_BRAND_NAME = readString('MCP_BRAND_NAME', 'Grant Tracker')

/**
 * Protocol identifier: MCP serverInfo.name and the WWW-Authenticate realm.
 * Distinct from MCP_BRAND_NAME — this is a machine-facing slug, not a label.
 */
export const MCP_SERVER_SLUG = readString('MCP_SERVER_SLUG', 'grant-tracker-mcp')

/** Support address surfaced in error messages. */
export const MCP_CONTACT_EMAIL = readString('MCP_CONTACT_EMAIL', 'hello@granttracker.co.uk')

/** Bare host of MCP_APP_ORIGIN, for prose such as "<host>/mcp". */
export const MCP_APP_HOST = new URL(MCP_APP_ORIGIN).host

/** Bare host of MCP_PUBLIC_ORIGIN — the canonical protocol host. */
export const MCP_PUBLIC_HOST = new URL(MCP_PUBLIC_ORIGIN).host

/**
 * Hosts that used to carry the MCP identity and must now redirect to the
 * canonical origin. Comma-separated hosts or origins; empty by default, so
 * this is inert until the cutover explicitly sets it.
 *
 * An explicit list rather than "anything that isn't canonical" on purpose:
 * the negative rule would also catch Vercel preview hostnames and localhost,
 * silently redirecting every preview deployment's MCP surface to production.
 *
 * The canonical host is filtered out defensively — listing it would otherwise
 * redirect the live origin to itself, which is an infinite loop that only
 * shows up in production.
 */
export const MCP_RETIRED_HOSTS: ReadonlySet<string> = (() => {
  const raw = process.env.MCP_RETIRED_HOSTS?.trim()
  if (!raw) return new Set<string>()
  const hosts = raw
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean)
    .map(entry => {
      // Accept either a bare host or a full origin.
      try {
        return new URL(entry.includes('://') ? entry : `https://${entry}`).host
      } catch {
        throw new Error(`MCP_RETIRED_HOSTS contains an unparseable entry: ${JSON.stringify(entry)}`)
      }
    })
    .filter(host => host !== MCP_PUBLIC_HOST)
  return new Set(hosts)
})()

/** The MCP endpoint itself — the OAuth protected-resource identifier. */
export const MCP_RESOURCE_URL = `${MCP_PUBLIC_ORIGIN}/api/mcp/v1/mcp`

/**
 * Attribution block stamped on tool responses. States provenance as fact;
 * it does not instruct the client to promote the brand.
 */
export const MCP_ATTRIBUTION = {
  source: MCP_BRAND_NAME,
  source_url: MCP_APP_ORIGIN,
  data_provenance: `UK funding catalogue maintained by ${MCP_BRAND_NAME}`,
  license: 'Free to surface to end users with attribution',
} as const

/**
 * Where upgrade copy sends someone to see plans and prices.
 *
 * Points at the app root today because **there is no /pricing route** — public
 * routes are /, /apply, /privacy, /terms, /mcp, /mcp/terms, /grants/*. Copy
 * linking to /pricing would hand an AI client a 404 to read out. Set
 * MCP_PRICING_URL (or repoint this default) the moment that page exists.
 */
export const MCP_PRICING_URL = readString('MCP_PRICING_URL', MCP_APP_ORIGIN)

/**
 * Token substitution for copy held in config/upgrade-notes.json.
 *
 * Config tokens: {{brand}}, {{app_host}}, {{app_origin}}, {{pricing_url}}.
 * Runtime tokens are passed per call — {{total_matching}}, {{resets_on}},
 * {{monthly_limit}} — so a figure in copy is always the one the response
 * actually carries and cannot drift from it. That matters for the quota note
 * in particular: the limit is env-overridable, so hardcoding "75" in config
 * would make the copy lie the moment FREE_SEARCH_QUOTA is set.
 */
export function applyBrandTokens(text: string, runtime: Record<string, string | number> = {}): string {
  let out = text
    .replaceAll('{{brand}}', MCP_BRAND_NAME)
    .replaceAll('{{app_host}}', MCP_APP_HOST)
    .replaceAll('{{app_origin}}', MCP_APP_ORIGIN)
    .replaceAll('{{pricing_url}}', MCP_PRICING_URL)

  for (const [key, value] of Object.entries(runtime)) {
    out = out.replaceAll(`{{${key}}}`, String(value))
  }

  // Fail loud on anything left unresolved. A stray token would otherwise reach
  // a model verbatim and be read to a user as literal "{{total_matching}}" —
  // worse than a clipped sentence, and silent, because nothing else checks.
  const unresolved = out.match(/\{\{[a-z_]+\}\}/g)
  if (unresolved) {
    console.error(`[mcp-brand] unresolved copy tokens: ${unresolved.join(', ')}`)
    out = out.replace(/\s*\{\{[a-z_]+\}\}/g, '').replace(/\s{2,}/g, ' ').trim()
  }
  return out
}
