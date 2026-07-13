// /dashboard/research — the Research section (research agent v1, design spec
// §3, build spec §8 step 3). Companion-tier only, same gating as /briefing.
// A fourth consumer of the one tool layer's boundary resolution — the page
// itself only reads the org's existing research threads server-side; every
// live turn goes through the same /api/agent/chat route the drawer uses.

import { redirect } from 'next/navigation'
import { resolveWebToolContext } from '@/lib/agent/boundary'
import { agentEnabledForOrg } from '@/lib/agent/orchestrator/config'
import { listResearchThreads } from '@/lib/agent/orchestrator/threads'
import ResearchView from '@/components/research/ResearchView'

export const dynamic = 'force-dynamic'

export default async function ResearchPage() {
  const boundary = await resolveWebToolContext()
  if (!boundary.ok) redirect('/auth/login')
  const { ctx } = boundary
  if (!agentEnabledForOrg(ctx.orgId) || ctx.tier !== 'companion') redirect('/dashboard')

  const threads = await listResearchThreads(ctx.orgId)

  return (
    <ResearchView
      orgId={ctx.orgId}
      userId={ctx.userId ?? null}
      initialThreads={threads}
    />
  )
}
