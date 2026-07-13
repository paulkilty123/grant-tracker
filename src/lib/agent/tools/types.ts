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
  /** Research agent v1 only (design spec §3): the research thread a turn is
   *  running in, when there is one. Threads are in-app conversational
   *  infrastructure, not a canonical identity concept — undefined on MCP
   *  calls and on any non-research in-app turn. Only flag_for_verification
   *  reads this today (the enrichment audit trail's "tagged to the
   *  originating thread"). */
  threadId?: string
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
/** Structural (not prose) block on first-run goal setup over MCP — the live
 *  steering test (10 Jul) showed description-only steering doesn't hold for
 *  setup discipline on an external client. Thrown only when surface is 'mcp'
 *  and no goal exists yet; adjustments to an existing goal are unaffected. */
export class SetupSurfaceError extends Error {
  constructor(message: string) { super(message); this.name = 'SetupSurfaceError' }
}
