'use server'

// Server Actions for the first-run setup stepper (SetupStepper.tsx). Steps
// 1-3 bypass the LLM entirely — these call recommend_mix / set_funding_goal /
// the pre-existing-pipeline helper directly, using resolveWebToolContext()
// exactly as briefing/page.tsx and plan/page.tsx already do for reads. This is
// what makes F1 (amounts-first mix steering) impossible by construction on
// this surface: there is no model in the loop to skip a step.

import { revalidatePath } from 'next/cache'
import { resolveWebToolContext } from '@/lib/agent/boundary'
import { serviceClient } from '@/lib/agent/tools/db'
// Import recommendMix/setFundingGoal from their own modules, NOT the
// '@/lib/agent/tools' barrel — that barrel also re-exports plan.ts (which
// pulls in author.ts/orchestrator/budget.ts and the Anthropic SDK). Pulling
// that whole chain into this Server Action's own webpack bundle broke the
// production build ("Cannot get final name for export 'APIUserAbortError'
// of .../@anthropic-ai/sdk/error.mjs") even though the same barrel import
// already works fine from a regular Server Component like briefing/page.tsx.
import { recommendMix } from '@/lib/agent/tools/mix'
import type { RecommendMixPayload } from '@/lib/agent/tools/mix'
import { setFundingGoal, materialisePreExistingRow, type PreExistingRow, type PurposeInput, type SetFundingGoalParams, type SetFundingGoalResult } from '@/lib/agent/tools/goal'
import { getOrCreateActiveThread } from '@/lib/agent/orchestrator/threads'

async function requireCtx() {
  const boundary = await resolveWebToolContext()
  if (!boundary.ok) throw new Error(boundary.error)
  return boundary.ctx
}

export async function recommendMixAction(purposes: PurposeInput[]): Promise<RecommendMixPayload> {
  const ctx = await requireCtx()
  const result = await recommendMix(ctx, { purposes })
  return result.data
}

// Explicit param shape (not Omit<SetFundingGoalParams, 'source'>) — SetFundingGoalParams
// extends Record<string, unknown>, and Omit against an indexed type collapses
// to the index signature rather than the named fields, silently losing the
// required-field checking this action depends on.
export interface SetupGoalParams {
  title: string
  target_amount: number
  start_date: string
  end_date: string
  mix_targets?: Record<string, number> | null
  constraints?: Array<{ kind: string; text: string }>
  purposes?: PurposeInput[]
}

export async function setFundingGoalAction(params: SetupGoalParams): Promise<SetFundingGoalResult> {
  const ctx = await requireCtx()
  const toWrite: SetFundingGoalParams = { ...params, source: 'wizard' }
  const result = await setFundingGoal(ctx, toWrite)
  revalidatePath('/dashboard/briefing')
  return result.data
}

export async function addPreExistingRowAction(row: PreExistingRow): Promise<void> {
  const ctx = await requireCtx()
  await materialisePreExistingRow(ctx.orgId, ctx.userId, row)
}

/** The "Type instead" escape hatch: appends whatever's already been entered as
 *  a real user/assistant exchange so it reaches the MODEL's replayed history,
 *  not just the visible transcript. Nothing is written to the DB yet at this
 *  point (steps 1-3 are local component state until step 4's Confirm), so the
 *  conversation text is the ONLY channel this context can travel through.
 *
 *  Deliberately NOT seedThreadOpener (assistant-only, no-ops once the page's
 *  scripted opener already exists) — and deliberately a user+assistant PAIR,
 *  not a lone user message: threads.ts's sanitiseWindow anchors replay at the
 *  first plain-user message, and the Anthropic API requires strict role
 *  alternation, so a lone trailing 'user' row would collide with the next real
 *  user turn. The pair keeps the thread ending on 'assistant', so the next
 *  real turn alternates correctly. Best-effort — the caller switches to
 *  SetupExperience regardless of outcome. */
export async function seedFreeformContextAction(summary: string): Promise<void> {
  const ctx = await requireCtx()
  const threadId = await getOrCreateActiveThread(ctx.orgId)
  if (!threadId) return
  try {
    const sb = serviceClient()
    await sb.from('agent_messages').insert([
      {
        thread_id: threadId,
        org_id: ctx.orgId,
        role: 'user',
        content: `Here's what I'd already entered in the guided setup:\n\n${summary}\n\nLet's continue from here.`,
      },
      {
        thread_id: threadId,
        org_id: ctx.orgId,
        role: 'assistant',
        content: [{ type: 'text', text: "Got it, that's noted. What would you like to do next?" }],
        model: 'scripted-opener',
      },
    ])
  } catch (e) {
    console.error('[actions] seedFreeformContextAction failed:', e)
  }
}
