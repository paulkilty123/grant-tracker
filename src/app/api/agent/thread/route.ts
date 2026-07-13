// GET /api/agent/thread — the briefing drawer's read of the org's active
// conversation thread (spec §9 step 3). Same boundary order as the chat route:
// flag+allowlist, web-session ToolContext, companion tier. Returns a
// render-friendly view (text turns + tool names); the raw replay substrate
// never leaves the server.

import { NextRequest, NextResponse } from 'next/server'
import { resolveWebToolContext } from '@/lib/agent/boundary'
import { agentEnabledForOrg } from '@/lib/agent/orchestrator/config'
import { getOrCreateActiveThread, getThread, loadThreadView } from '@/lib/agent/orchestrator/threads'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
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

  // Research agent v1 (design spec §3): ?thread_id addresses a SPECIFIC
  // thread (one of possibly many research threads) — org-ownership-checked.
  // Omitted (unchanged behaviour): the single active briefing thread.
  const requestedId = req.nextUrl.searchParams.get('thread_id')
  let threadId: string | null
  if (requestedId) {
    const thread = await getThread(requestedId, ctx.orgId)
    if (!thread) return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
    threadId = thread.id
  } else {
    threadId = await getOrCreateActiveThread(ctx.orgId)
  }
  if (!threadId) {
    return NextResponse.json({ thread_id: null, messages: [] }) // 037 not applied yet
  }
  const messages = await loadThreadView(threadId)
  return NextResponse.json({ thread_id: threadId, messages })
}
