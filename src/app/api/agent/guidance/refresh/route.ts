// POST /api/agent/guidance/refresh — out-of-band regeneration of the briefing
// guidance layer (author.ts), so the READ path (get_briefing / the pages) never
// blocks on the ~9-14s generation. Called fire-and-forget by the client's
// GuidanceRefresher when a page renders with stale guidance, or after a
// plan-changing conversational turn. Awaited server-side (a normal request, so
// it completes reliably inside maxDuration — no serverless-background hack).
//
// Idempotent + self-debouncing: refreshBriefingGuidance no-ops when a run
// already exists at the current plan-state signature, and is bounded by the
// same per-org / global token budget + kill-switch as every other agent call.

import { NextResponse } from 'next/server'
import { resolveWebToolContext } from '@/lib/agent/boundary'
import { agentEnabledForOrg } from '@/lib/agent/orchestrator/config'
import { refreshBriefingGuidance } from '@/lib/agent/tools/plan'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST() {
  const boundary = await resolveWebToolContext()
  if (!boundary.ok) return NextResponse.json({ error: boundary.error }, { status: boundary.status })
  const { ctx } = boundary
  if (!agentEnabledForOrg(ctx.orgId) || ctx.tier !== 'companion') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const result = await refreshBriefingGuidance(ctx)
  return NextResponse.json(result)
}
