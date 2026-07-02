// The tool envelope — proven once, applied to every tool.
//
// Wraps a tool's implementation with the four non-negotiables, in order:
//   1. Entitlement check   (identical for web session and MCP OAuth token)
//   2. Authorship guard     (scaffold-only; no application prose in or out)
//   3. The implementation   (org identity comes from ctx, never from params)
//   4. Capture-layer log     (surface-discriminated) + a provenance envelope
//
// A tool is `defineTool({...})`; the returned function is the only way to call
// it, so no capability can skip an envelope layer.

import { requireTool } from './entitlement'
import { assertScaffoldOnly } from './authorship'
import type { ToolContext, ToolResult, Provenance } from './types'

export interface ToolSpec<P extends Record<string, unknown>, R> {
  /** Registered tool name — must match the entitlement policy + MCP schema. */
  name: string
  /** The implementation. Reads org identity from ctx.orgId, never from params. */
  handler: (ctx: ToolContext, params: P) => Promise<R>
  /** Log the domain event to the capture layer (surface-discriminated). */
  logEvent: (ctx: ToolContext, params: P, result: R) => Promise<void>
  /** Per-field provenance for the returned data. */
  provenance?: (ctx: ToolContext, result: R) => Record<string, Provenance<unknown>>
}

export type ToolFn<P extends Record<string, unknown>, R> =
  (ctx: ToolContext, params: P) => Promise<ToolResult<R>>

export function defineTool<P extends Record<string, unknown>, R>(spec: ToolSpec<P, R>): ToolFn<P, R> {
  return async (ctx, params) => {
    requireTool(ctx, spec.name)          // 1. entitlement
    assertScaffoldOnly(params)           // 2. authorship
    const data = await spec.handler(ctx, params)   // 3. implementation (orgId from ctx)
    await spec.logEvent(ctx, params, data)         // 4a. capture log (surface)
    return {                                        // 4b. provenance envelope
      tool: spec.name,
      surface: ctx.surface,
      data,
      provenance: spec.provenance?.(ctx, data) ?? {},
    }
  }
}
