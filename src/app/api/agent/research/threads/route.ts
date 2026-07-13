// GET/POST /api/agent/research/threads — the Research section's thread tab
// row (design spec §3/§8 step 3). Same boundary order as the other agent
// routes: flag+allowlist, web-session ToolContext, Companion tier.
//
// GET  — list every research thread for the org, most recently active first.
// POST — create a new one, optionally with a focus label. There is no "the"
// research thread to fetch-or-create (unlike the briefing drawer) — every
// call makes a NEW thread.

import { NextRequest, NextResponse } from 'next/server'
import { resolveWebToolContext } from '@/lib/agent/boundary'
import { agentEnabledForOrg } from '@/lib/agent/orchestrator/config'
import { listResearchThreads, createResearchThread } from '@/lib/agent/orchestrator/threads'

export const dynamic = 'force-dynamic'

async function authorise() {
  const boundary = await resolveWebToolContext()
  if (!boundary.ok) return { ok: false as const, res: NextResponse.json({ error: boundary.error }, { status: boundary.status }) }
  const { ctx } = boundary
  if (!agentEnabledForOrg(ctx.orgId)) return { ok: false as const, res: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  if (ctx.tier !== 'companion') return { ok: false as const, res: NextResponse.json({ error: 'The strategist requires the Adviser tier.' }, { status: 403 }) }
  return { ok: true as const, ctx }
}

export async function GET() {
  const auth = await authorise()
  if (!auth.ok) return auth.res
  const threads = await listResearchThreads(auth.ctx.orgId)
  return NextResponse.json({ threads })
}

export async function POST(req: NextRequest) {
  const auth = await authorise()
  if (!auth.ok) return auth.res
  let body: { focus_label?: string; focus_purpose_id?: string }
  try { body = await req.json() } catch { body = {} }
  const threadId = await createResearchThread(auth.ctx.orgId, {
    focusLabel: body.focus_label?.trim() || null,
    focusPurposeId: body.focus_purpose_id || null,
  })
  if (!threadId) return NextResponse.json({ error: 'Could not create thread — apply migration 038 first.' }, { status: 500 })
  return NextResponse.json({ thread_id: threadId })
}
