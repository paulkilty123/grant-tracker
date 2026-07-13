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
//         history?: MessageParam[] }
//
// History is SERVER-SIDE (spec §9 step 3): each turn replays from the org's
// active thread (agent_threads/agent_messages) and persists its new messages
// back. body.history is honoured ONLY as a stateless fallback when migration
// 037 is not applied — once threads exist, client history is ignored, which
// also closes the fabricated-tool-result injection surface.
//
// Stream: SSE, one JSON event per line — thread (id, first) | text_delta |
// tool_start | tool_done | done (with usage) | error.

import { NextRequest, NextResponse } from 'next/server'
import type Anthropic from '@anthropic-ai/sdk'
import { resolveWebToolContext } from '@/lib/agent/boundary'
import { runAgentTurn, type OrchestratorEvent } from '@/lib/agent/orchestrator/loop'
import { checkInferenceBudget } from '@/lib/agent/orchestrator/budget'
import { agentEnabledForOrg, type TurnKind } from '@/lib/agent/orchestrator/config'
import { getOrCreateActiveThread, getThread, loadThreadHistory, appendTurn } from '@/lib/agent/orchestrator/threads'

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
    return NextResponse.json({ error: 'The strategist requires the Adviser tier.' }, { status: 403 })
  }

  const budget = await checkInferenceBudget(ctx.orgId)
  if (!budget.allowed) {
    return NextResponse.json({ error: budget.message, reason: budget.reason }, { status: 429 })
  }

  let body: { user_turn?: string; turn_kind?: string; history?: Anthropic.MessageParam[]; thread_id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const userTurn = (body.user_turn ?? '').trim()
  if (!userTurn) return NextResponse.json({ error: 'user_turn required' }, { status: 400 })
  const turnKind: TurnKind = body.turn_kind === 'strategist' ? 'strategist' : 'chat'

  // Server-side thread; stateless client-history fallback pre-migration-037.
  // Research agent v1 (design spec §3/§8 step 2): a thread_id addresses ONE OF
  // POSSIBLY MANY research threads — there is no "the" active one, unlike the
  // briefing drawer. Omitting thread_id is unchanged behaviour: the single
  // active briefing thread, exactly as before this existed.
  let threadId: string | null
  let research = false
  if (body.thread_id) {
    const thread = await getThread(body.thread_id, ctx.orgId)
    if (!thread) return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
    threadId = thread.id
    research = thread.kind === 'research'
  } else {
    threadId = await getOrCreateActiveThread(ctx.orgId)
  }
  const history = threadId
    ? await loadThreadHistory(threadId)
    : (Array.isArray(body.history) ? body.history : [])

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (ev: OrchestratorEvent | { type: 'thread'; thread_id: string | null }) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`))
      send({ type: 'thread', thread_id: threadId })
      try {
        const res = await runAgentTurn({ ctx, history, userTurn, turnKind, research, onEvent: send })
        if (threadId) {
          await appendTurn(threadId, ctx.orgId, res.messages.slice(history.length), { turnKind, usage: res.usage })
        }
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
