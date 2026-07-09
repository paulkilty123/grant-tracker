// /dashboard/plan — the analytical depth one click from the briefing (design
// spec §3.3). A deterministic render of get_plan_state + get_pipeline through
// the same web ToolContext boundary as the briefing; the model enters only via
// the Companion drawer. Re-fetches on every load so rendered arithmetic is
// never stale (§8).
//
// Gating mirrors /dashboard/briefing exactly: companion_access flag +
// AGENT_ENABLED, non-flagged users redirected with no trace the surface
// exists. With no goal set, the setup conversation on the briefing IS the
// page — redirect there rather than render an empty plan.

import { redirect } from 'next/navigation'
import { resolveWebToolContext } from '@/lib/agent/boundary'
import { agentEnabledForOrg } from '@/lib/agent/orchestrator/config'
import { getPlanState, getPipeline, getBriefing } from '@/lib/agent/tools'
import PlanView from '@/components/briefing/PlanView'
import CompanionDrawer from '@/components/briefing/CompanionDrawer'
import CompanionAskBar from '@/components/briefing/CompanionAskBar'
import GuidanceRefresher from '@/components/briefing/GuidanceRefresher'

export const dynamic = 'force-dynamic'

export default async function PlanPage() {
  const boundary = await resolveWebToolContext()
  if (!boundary.ok) redirect('/auth/login')
  const { ctx } = boundary
  if (!agentEnabledForOrg(ctx.orgId) || ctx.tier !== 'companion') redirect('/dashboard')

  const [plan, pipeline, briefing] = await Promise.all([
    getPlanState(ctx, {}),
    getPipeline(ctx, {}),
    getBriefing(ctx, {}), // shares the cached guidance generation; carries plan_read
  ])

  const planData = plan.data
  if (!planData.has_goal) redirect('/dashboard/briefing')
  const planRead = briefing.data.has_goal ? (briefing.data.guidance?.plan_read ?? null) : null
  const guidanceStale = briefing.data.has_goal ? briefing.data.guidance_stale : false

  return (
    <>
      <PlanView plan={planData} pipeline={pipeline.data} planRead={planRead} />
      <CompanionAskBar examplePrompt="Which purpose is furthest behind?" suggestions={['Which purpose is furthest behind?', 'We just won a grant', 'Rebalance my mix']} />
      <CompanionDrawer examplePrompt="Which purpose is furthest behind?" />
      <GuidanceRefresher stale={guidanceStale} />
    </>
  )
}
