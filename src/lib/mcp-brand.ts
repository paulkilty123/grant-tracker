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
 * Token substitution for copy held in config/upgrade-notes.json.
 * Placeholders: {{brand}}, {{app_host}}, {{app_origin}}.
 */
export function applyBrandTokens(text: string): string {
  return text
    .replaceAll('{{brand}}', MCP_BRAND_NAME)
    .replaceAll('{{app_host}}', MCP_APP_HOST)
    .replaceAll('{{app_origin}}', MCP_APP_ORIGIN)
}
