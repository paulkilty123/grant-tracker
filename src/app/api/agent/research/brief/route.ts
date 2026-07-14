// POST /api/agent/research/brief — "Write me a brief" (design spec §3, build
// step 4). One-shot generation (src/lib/agent/brief.ts) outside the
// conversational tool loop, same boundary order as the other agent routes:
// flag+allowlist, web-session ToolContext, Companion tier, inference budget.
//
// A provenance-lint failure returns 502 — never a mislabelled brief served
// as if it passed (brief.ts's own comment: this is the one failure mode the
// whole feature exists to prevent).
//
// Body: { thread_id: string, opportunity: BriefInput['opportunity'] }

import { NextRequest, NextResponse } from 'next/server'
import { resolveWebToolContext } from '@/lib/agent/boundary'
import { agentEnabledForOrg } from '@/lib/agent/orchestrator/config'
import { checkInferenceBudget } from '@/lib/agent/orchestrator/budget'
import { getThread } from '@/lib/agent/orchestrator/threads'
import { getOrg } from '@/lib/agent/tools/repository'
import { serviceClient } from '@/lib/agent/tools/db'
import { writeBrief, BRIEF_PROMPT_VERSION, type BriefInput } from '@/lib/agent/brief'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const boundary = await resolveWebToolContext()
  if (!boundary.ok) return NextResponse.json({ error: boundary.error }, { status: boundary.status })
  const { ctx } = boundary

  if (!agentEnabledForOrg(ctx.orgId)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (ctx.tier !== 'companion') return NextResponse.json({ error: 'The strategist requires the Adviser tier.' }, { status: 403 })

  // The client sends the full card shape (cards.ts) — opportunity_id/funder_key
  // ride along for the opportunity_ref column below but are not part of what
  // writeBrief needs (BriefInput['opportunity'] omits them; the object is
  // still valid for that param, excess properties are simply unused there).
  let body: { thread_id?: string; opportunity?: (BriefInput['opportunity'] & { opportunity_id?: string; funder_key?: string }) }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  if (!body.thread_id || !body.opportunity) return NextResponse.json({ error: 'thread_id and opportunity are required' }, { status: 400 })

  const thread = await getThread(body.thread_id, ctx.orgId)
  if (!thread) return NextResponse.json({ error: 'Thread not found' }, { status: 404 })

  const budget = await checkInferenceBudget(ctx.orgId)
  if (!budget.allowed) return NextResponse.json({ error: budget.message, reason: budget.reason }, { status: 429 })

  const org = await getOrg(ctx.orgId)
  // v1.1 §1: research threads are standalone, fresh eyes — no plan/goal/
  // purpose framing. purposeContext is just the thread's own free-text focus
  // label (what the user is asking about in THIS thread), never looked up
  // from goal_purposes. focus_purpose_id stays dormant on the schema for the
  // future plan-linked mode; nothing here reads it.
  const purposeContext = thread.focusLabel

  const orgRow = org as unknown as Record<string, unknown> | null
  const input: BriefInput = {
    org: {
      name: (orgRow?.name as string | null) ?? null,
      legal_structure: (orgRow?.legal_structure as string | null) ?? null,
      income_band: (orgRow?.annual_income_band as string | null) ?? null,
      location: (orgRow?.primary_location as string | null) ?? null,
      sectors: (orgRow?.impact_sectors as string[] | null) ?? [],
    },
    purposeContext,
    opportunity: body.opportunity,
  }

  let authored
  try {
    authored = await writeBrief(input)
  } catch (e) {
    console.error('[research/brief] generation failed:', e)
    return NextResponse.json({ error: 'Funder profile generation failed. Please try again.' }, { status: 502 })
  }

  const sb = serviceClient()
  // Instrumentation: shares the agent_runs table (and checkInferenceBudget's
  // daily read) with briefing generation, distinguished by trigger.
  await sb.from('agent_runs').insert({
    org_id: ctx.orgId,
    trigger: 'research_brief',
    context_digest: { thread_id: thread.id, opportunity_variant: body.opportunity.variant },
    model: authored.model,
    prompt_version: BRIEF_PROMPT_VERSION,
    input_tokens: authored.usage.inputTokens,
    output_tokens: authored.usage.outputTokens,
    cost_estimate_microgbp: authored.usage.costMicroGbp,
    status: authored.provenanceLintPassed && authored.voiceLintPassed ? 'complete' : 'guardrail_blocked',
    narrative: authored.title,
  })

  if (!authored.provenanceLintPassed) {
    return NextResponse.json({ error: "Couldn't write a funder profile that kept catalogue and researched facts cleanly apart. Please try again." }, { status: 502 })
  }
  if (!authored.voiceLintPassed) {
    return NextResponse.json({ error: "That came out drafted as application text, not adviser guidance. Please try again." }, { status: 502 })
  }

  const opportunityRef = body.opportunity.variant === 'catalogue'
    ? (body.opportunity.opportunity_id ?? null)
    : (body.opportunity.funder_key ?? null)

  const { data: saved, error: saveErr } = await sb.from('agent_thread_briefs').insert({
    thread_id: thread.id,
    org_id: ctx.orgId,
    opportunity_ref: opportunityRef,
    title: authored.title,
    sections: authored.sections,
    model: authored.model,
    prompt_version: BRIEF_PROMPT_VERSION,
  }).select('id, title, sections, created_at').single()

  if (saveErr || !saved) {
    console.error('[research/brief] save failed:', saveErr?.message)
    return NextResponse.json({ error: 'Funder profile generated but could not be saved. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ brief: saved })
}
