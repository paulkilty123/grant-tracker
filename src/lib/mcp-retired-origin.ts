// Retired-origin redirects for the MCP identity surfaces.
//
// Decision (1 Aug 2026): at cutover, every MCP surface on the old origin 308s
// to its equivalent on the canonical origin. The old host stops being an MCP
// identity outright rather than continuing to serve metadata that declares a
// different resource — which is the RFC 9728 mismatch currently visible in the
// other direction, where shootsfunding answers with granttracker's identity.
//
// Gated on MCP_RETIRED_HOSTS, empty by default, so merging this changes
// nothing. At cutover it moves in one step with MCP_PUBLIC_ORIGIN and the
// issuer binding: the old origin stops answering, and the credentials it
// minted stop working, together. There is no window in which the two hosts
// disagree about who the resource is.
//
// 308 rather than 307 or 302: permanent, and it preserves method and body, so
// a POSTed JSON-RPC call survives the hop. A client that follows it arrives
// with a credential the new issuer will reject, gets a 401 + WWW-Authenticate,
// and re-runs discovery against the new identity. That is the intended path.

import { MCP_PUBLIC_ORIGIN, MCP_RETIRED_HOSTS } from './mcp-brand'

/**
 * Paths that constitute the MCP identity: the protocol endpoint, both
 * discovery documents, and the OAuth endpoints they advertise.
 *
 * The human-facing /mcp docs page is deliberately NOT here. It is part of the
 * wider site rebrand rather than the protocol identity, nothing in the
 * protocol references it once `resource_documentation` points at the new
 * origin, and redirecting a browser page is a content decision rather than a
 * correctness one.
 */
export function isMcpIdentityPath(pathname: string): boolean {
  return (
    pathname === '/api/mcp/v1/mcp' ||
    pathname === '/.well-known/oauth-authorization-server' ||
    pathname === '/.well-known/oauth-protected-resource' ||
    pathname.startsWith('/.well-known/oauth-protected-resource/') ||
    pathname === '/oauth/authorize' ||
    pathname === '/oauth/token' ||
    pathname === '/oauth/register' ||
    pathname === '/oauth/revoke'
  )
}

/**
 * Where a request to a retired host should be sent, or null to let it through.
 *
 * Returns the absolute target so the caller can issue the redirect; keeping
 * this a pure function means it can be exercised without standing up a
 * request pipeline.
 */
export function retiredOriginTarget(host: string | null, pathname: string, search: string): string | null {
  if (!host) return null
  if (MCP_RETIRED_HOSTS.size === 0) return null
  if (!MCP_RETIRED_HOSTS.has(host)) return null
  if (!isMcpIdentityPath(pathname)) return null
  return `${MCP_PUBLIC_ORIGIN}${pathname}${search}`
}
