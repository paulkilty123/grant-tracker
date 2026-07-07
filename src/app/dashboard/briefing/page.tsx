// /dashboard/briefing — the Companion tier's home (design spec §3.1), replacing
// the dashboard for flagged orgs. A THIRD consumer of the one tool layer: the
// page resolves a ToolContext at the web boundary and calls the same tools the
// orchestrator and MCP surface use — no side doors, and re-fetches on every
// load so rendered arithmetic is never stale (§8).
//
// Gating: companion_access flag + AGENT_ENABLED govern this route AND the nav
// (sidebar swap happens in the layout). Non-flagged users are redirected and
// see no trace the surface exists.

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { resolveWebToolContext } from '@/lib/agent/boundary'
import { agentEnabledForOrg } from '@/lib/agent/orchestrator/config'
import { getBriefing, getPlanState, getPipeline } from '@/lib/agent/tools'
import BriefingView from '@/components/briefing/BriefingView'
import CompanionDrawer from '@/components/briefing/CompanionDrawer'
import BriefingSeen from '@/components/briefing/BriefingSeen'

export const dynamic = 'force-dynamic'

export default async function BriefingPage() {
  const boundary = await resolveWebToolContext()
  if (!boundary.ok) redirect('/auth/login')
  const { ctx } = boundary
  if (!agentEnabledForOrg(ctx.orgId) || ctx.tier !== 'companion') redirect('/dashboard')

  const since = cookies().get('gt_briefing_seen')?.value ?? null

  const [briefing, plan, pipeline] = await Promise.all([
    getBriefing(ctx, since ? { since } : {}),
    getPlanState(ctx, {}),
    getPipeline(ctx, {}),
  ])

  // Greeting name — same derivation rhythm as the dashboard it replaces.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const rawName: string =
    (user?.user_metadata?.first_name as string | undefined) ??
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.email ?? '')
  const cleaned = rawName.includes('@') ? rawName.split('@')[0].replace(/\d+$/, '').replace(/\./g, ' ') : rawName.trim()
  const displayName = cleaned ? cleaned.split(/\s+/)[0].charAt(0).toUpperCase() + cleaned.split(/\s+/)[0].slice(1) : 'there'

  const examplePrompt = briefing.data.has_goal
    ? 'What should I focus on this week?'
    : 'Our target is £250,000 by next December — set up our goal'

  return (
    <>
      <BriefingView
        briefing={briefing.data}
        plan={plan.data}
        pipeline={pipeline.data}
        displayName={displayName}
      />
      <CompanionDrawer examplePrompt={examplePrompt} />
      <BriefingSeen />
    </>
  )
}
