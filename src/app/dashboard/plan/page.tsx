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
import { getPlanState, getPipeline } from '@/lib/agent/tools'
import PlanView from '@/components/briefing/PlanView'
import CompanionDrawer from '@/components/briefing/CompanionDrawer'

export const dynamic = 'force-dynamic'

export default async function PlanPage() {
  const boundary = await resolveWebToolContext()
  if (!boundary.ok) redirect('/auth/login')
  const { ctx } = boundary
  if (!agentEnabledForOrg(ctx.orgId) || ctx.tier !== 'companion') redirect('/dashboard')

  const [plan, pipeline] = await Promise.all([
    getPlanState(ctx, {}),
    getPipeline(ctx, {}),
  ])

  const planData = plan.data
  if (!planData.has_goal) redirect('/dashboard/briefing')

  return (
    <>
      <PlanView plan={planData} pipeline={pipeline.data} />
      <CompanionDrawer examplePrompt="Which purpose is furthest behind?" />
    </>
  )
}
