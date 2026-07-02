// Goal agent tool layer — shared types.
//
// The canonical interface to data and state. Callable identically by the in-app
// orchestrator and (later) an external MCP client. The test for every tool:
// could an external model exercise this via a tool call and get the same result?
//
// HARD RULE (see CLAUDE.md): nothing under src/lib/agent/tools/ may import
// session, cookie, or request context. Org identity is resolved at the
// route/auth boundary — from a web session OR an MCP OAuth token, identically —
// and passed in as ToolContext. Enforced by the eslint override on this path.

import type { EventSurface } from '../../events/taxonomy'

export type Tier = 'free' | 'apply' | 'companion' | 'internal'

/** Everything a tool needs, resolved at the auth boundary and passed in. */
export interface ToolContext {
  orgId: string
  surface: EventSurface // 'app' (in-app agent) | 'mcp' (external client)
  tier: Tier
  userId?: string | null
}

/** Uniform provenance envelope — every factual field a tool returns carries it. */
export interface Provenance<T> {
  value: T
  source: string // e.g. 'user' | 'agent' | 'catalogue' | 'engine'
  verified_at: string | null // ISO date, or null when not independently verified
}
export function prov<T>(value: T, source: string, verified_at: string | null = null): Provenance<T> {
  return { value, source, verified_at }
}

/** A tool's return: the data + a per-field provenance map + audit stamp. */
export interface ToolResult<R> {
  tool: string
  surface: EventSurface
  data: R
  provenance: Record<string, Provenance<unknown>>
}

export class EntitlementError extends Error {
  constructor(message: string) { super(message); this.name = 'EntitlementError' }
}
export class AuthorshipError extends Error {
  constructor(message: string) { super(message); this.name = 'AuthorshipError' }
}
