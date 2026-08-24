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
// Defaults name the CURRENT brand and domain, not the retired ones.
//
// They used to reproduce the pre-cutover values, on the reasoning that an unset
// environment should be a no-op. The two failure modes are not symmetric. A
// missing var in local dev is a nuisance you spot in seconds; a missing var in
// production silently reinstates a retired brand and a retired domain across
// /mcp, the OAuth authorize screen and every error message — and nobody
// notices, because it reads as a deliberate string rather than a fault.
// MCP_PUBLIC_ORIGIN and MCP_APP_ORIGIN are worse than the name: they make OAuth
// server metadata advertise a different domain, which is an auth failure
// wearing a branding costume, and readOrigin cannot catch it because a
// stale-but-valid URL passes every check it makes.
//
// A fallback should never be confidently wrong in a user-visible way. So the
// defaults are current, and absence is announced instead (see warnIfAbsent).
//
// A malformed override still throws at module load rather than silently
// emitting broken URLs — same fail-loud posture as mcp-upgrade-notes.ts.

/**
 * Say so when a variable is missing, once per variable per process.
 *
 * This is what keeps local dev honest now that the defaults are the real
 * values: without it, an unset environment looks identical to a configured one.
 * Warn rather than throw — a production build SHOULD arguably fail loudly with
 * MCP_* absent rather than serve five stale values, but that is a bigger change
 * than this file and is flagged rather than folded in here.
 */
const warned = new Set<string>()
function warnIfAbsent(name: string, fallback: string): void {
  if (process.env[name]?.trim()) return
  if (warned.has(name)) return
  warned.add(name)
  console.warn(`[mcp-brand] ${name} is not set — falling back to ${JSON.stringify(fallback)}.`)
}

function readOrigin(name: string, fallback: string): string {
  const raw = process.env[name]?.trim()
  if (!raw) { warnIfAbsent(name, fallback); return fallback }

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
  const raw = process.env[name]?.trim()
  if (!raw) { warnIfAbsent(name, fallback); return fallback }
  return raw
}

/** Protocol / canonical origin. OAuth + server metadata address this host. */
export const MCP_PUBLIC_ORIGIN = readOrigin('MCP_PUBLIC_ORIGIN', 'https://www.shootsfunding.co.uk')

/** User-facing origin. Links handed to a human resolve here. */
export const MCP_APP_ORIGIN = readOrigin('MCP_APP_ORIGIN', 'https://shootsfunding.co.uk')

/** Display name used in attribution and prose. */
export const MCP_BRAND_NAME = readString('MCP_BRAND_NAME', 'Shoots')

/**
 * Protocol identifier: MCP serverInfo.name and the WWW-Authenticate realm.
 * Distinct from MCP_BRAND_NAME — this is a machine-facing slug, not a label.
 *
 * DELIBERATELY NOT RENAMED with the rest. Already-registered clients hold this
 * identifier; changing it is a protocol-identity change, not a branding one.
 * It is the single default here that should not be made consistent.
 */
export const MCP_SERVER_SLUG = readString('MCP_SERVER_SLUG', 'grant-tracker-mcp')

/**
 * Support address surfaced in error messages.
 *
 * This var exists so it could lag the domain move until mail worked on the new
 * domain. It does: shootsfunding.co.uk carries the same Google Workspace MX
 * records as the old domain, and the landing page already publishes this
 * address publicly. Checked by DNS, not by sending anything, so delivery to
 * this specific mailbox is inferred rather than tested.
 */
export const MCP_CONTACT_EMAIL = readString('MCP_CONTACT_EMAIL', 'hello@shootsfunding.co.uk')

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

/* ── Outbound email ─────────────────────────────────────────────────────────
 *
 * Six routes send mail (contact, feedback, send-alerts, and the three crons)
 * and each one used to declare its own from address, notify address and link
 * origin, every one falling back to a hardcoded granttracker.co.uk. That made
 * the rebrand six edits instead of one, and it hid a live problem:
 * NEXT_PUBLIC_APP_URL is not set in production, so every link inside the alert
 * and reminder emails resolved to the old domain. Those crons are unscheduled
 * today, so nobody has seen it, but enabling them is a launch item.
 *
 * These derive from the origin above, which IS set in production, so the
 * fallbacks are right without needing a new environment variable. The explicit
 * env overrides stay for the cases where the mail identity should differ from
 * the site identity.
 */

/** Bare host for prose in email footers. Without the www, which reads oddly. */
export const EMAIL_BRAND_HOST = MCP_APP_HOST.replace(/^www\./, '')

/** Address outbound app email is sent FROM. Must be on a domain verified with
 *  the mail provider, or the receiving domain's DMARC policy will act on it. */
export const EMAIL_FROM = readString('ALERT_FROM_EMAIL', `alerts@${EMAIL_BRAND_HOST}`)

/** Where internal notifications land: the contact form and in-app feedback. */
export const EMAIL_NOTIFY_TO = readString('FEEDBACK_NOTIFY_EMAIL', MCP_CONTACT_EMAIL)

/** Origin for links inside emails. Falls back to the app origin rather than a
 *  second hardcoded copy of the domain. */
export const EMAIL_APP_URL = readOrigin('NEXT_PUBLIC_APP_URL', MCP_APP_ORIGIN)

/** Accent used on quoted message bodies in notification emails.
 *  A raw hex on purpose: email clients do not resolve CSS custom properties,
 *  so a var(--token) here would silently render as no colour at all. */
export const EMAIL_ACCENT = '#9BCA9D'
