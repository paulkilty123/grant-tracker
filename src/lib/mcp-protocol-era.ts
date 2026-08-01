// Protocol-era classification for inbound MCP requests.
//
// This server is 2025-era (SDK 1.x, version ceiling 2025-11-25). The
// 2026-07-28 revision is final, but migrating to it means moving onto the
// @modelcontextprotocol/server v2 line, and that decision was deliberately
// deferred (1 Aug 2026) until there is evidence modern clients are actually
// arriving. This module is the instrument for that decision — without it the
// migration trigger is guesswork.
//
// Lives outside the route handler so it can be exercised directly: Next.js
// route files restrict what may be exported alongside the HTTP verbs.

/** First revision of the modern (stateless-core) era. */
export const FIRST_MODERN_PROTOCOL_VERSION = '2026-07-28'

/** Every revision the 2025-era SDK line knows about. */
export const KNOWN_LEGACY_PROTOCOL_VERSIONS: ReadonlySet<string> = new Set([
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
  '2024-10-07',
])

export type ProtocolEra = 'modern' | 'legacy' | 'absent' | 'unrecognised'

/**
 * Revisions are ISO dates. This shape check has to run BEFORE the ordering
 * comparison: string comparison puts any letter above any digit, so a garbage
 * or spoofed header ("banana") would otherwise satisfy `>= '2026-07-28'` and
 * report as modern — a false positive on precisely the signal that triggers the
 * migration decision.
 */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Classify the value of an inbound `MCP-Protocol-Version` header.
 *
 * Comparison is lexicographic on the ISO date, matching how the spec's own
 * reference implementation splits the eras: anything at or after 2026-07-28 is
 * modern. That ordering means a future revision (2027-xx) classifies as modern
 * without needing this list updated — the failure mode we want, since a newer
 * client is exactly what should trip the migration trigger.
 *
 * 'unrecognised' is deliberately distinct from 'legacy': a value below the
 * modern floor that we have never heard of is a malformed or spoofed header,
 * not evidence of an older client, and shouldn't be read as reassurance.
 */
export function classifyProtocolEra(version: string | null | undefined): ProtocolEra {
  if (!version) return 'absent'
  const trimmed = version.trim()
  if (!trimmed) return 'absent'
  if (!ISO_DATE.test(trimmed)) return 'unrecognised'
  if (trimmed >= FIRST_MODERN_PROTOCOL_VERSION) return 'modern'
  if (KNOWN_LEGACY_PROTOCOL_VERSIONS.has(trimmed)) return 'legacy'
  return 'unrecognised'
}
