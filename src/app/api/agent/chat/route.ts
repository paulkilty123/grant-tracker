// POST /api/agent/chat — the in-app goal agent's conversational turn endpoint.
//
// Boundary order (every check server-side, per build-spec §2/§8):
//   1. Feature flag + per-org allowlist (flag off → 404, production byte-identical)
//   2. Web-session ToolContext boundary (same resolver family as the MCP path)
//   3. Tier gate — the strategist is Companion-tier
//   4. Inference budget (per-org turn/token caps + global kill-switch)
// then one orchestrator turn, streamed as SSE.
//
// Body: { user_turn: string, turn_kind?: 'chat' | 'strategist',
//         history?: MessageParam[] }  — history is the caller's replay of prior
// turns (stateless v1; server-side thread persistence is a logged follow-on.
// A caller can only ever "inject" into their own org's conversation — all data
// the model can reach is scoped by the server-resolved ToolContext).
//
// Stream: SSE, one JSON event per line — text_delta | tool_start | tool_done |
// done (with usage) | error.

import { NextRequest, NextResponse } from 'next/server'
import type Anthropic from '@anthropic-ai/sdk'
import { resolveWebToolContext } from '@/lib/agent/boundary'
import { runAgentTurn, type OrchestratorEvent } from '@/lib/agent/orchestrator/loop'
import { checkInferenceBudget } from '@/lib/agent/orchestrator/budget'
import { agentEnabledForOrg, type TurnKind } from '@/lib/agent/orchestrator/config'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(req: NextRequest) {
  const boundary = await resolveWebToolContext()
  if (!boundary.ok) {
    return NextResponse.json({ error: boundary.error }, { status: boundary.status })
  }
  const { ctx } = boundary

  if (!agentEnabledForOrg(ctx.orgId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (ctx.tier !== 'companion') {
    return NextResponse.json({ error: 'The strategist requires the Companion tier.' }, { status: 403 })
  }

  const budget = await checkInferenceBudget(ctx.orgId)
  if (!budget.allowed) {
    return NextResponse.json({ error: budget.message, reason: budget.reason }, { status: 429 })
  }

  let body: { user_turn?: string; turn_kind?: string; history?: Anthropic.MessageParam[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const userTurn = (body.user_turn ?? '').trim()
  if (!userTurn) return NextResponse.json({ error: 'user_turn required' }, { status: 400 })
  const turnKind: TurnKind = body.turn_kind === 'strategist' ? 'strategist' : 'chat'
  const history = Array.isArray(body.history) ? body.history : []

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (ev: OrchestratorEvent) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`))
      try {
        await runAgentTurn({ ctx, history, userTurn, turnKind, onEvent: send })
      } catch (e) {
        console.error('[agent/chat] turn failed:', e)
        send({ type: 'error', message: 'Something went wrong mid-turn. Please try again.' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
