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
import { getOrCreateActiveThread, seedThreadOpener } from '@/lib/agent/orchestrator/threads'
import BriefingView from '@/components/briefing/BriefingView'
import CompanionDrawer from '@/components/briefing/CompanionDrawer'
import BriefingSeen from '@/components/briefing/BriefingSeen'
import SetupExperience from '@/components/briefing/SetupExperience'

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

  // No goal yet → the setup conversation IS the page (spec §3.2/§8). Seed the
  // scripted opener (profile summary first — the pre-seeded org model doing
  // its job) into the thread so the model's history and the user's view agree.
  if (!briefing.data.has_goal) {
    const { data: orgRow } = await supabase
      .from('organisations')
      .select('name, legal_structure, impact_sectors, annual_income_band, primary_location')
      .eq('id', ctx.orgId).maybeSingle()
    const o = (orgRow ?? {}) as Record<string, unknown>
    const org = {
      name: String(o.name ?? 'your organisation'),
      structure: o.legal_structure ? String(o.legal_structure).replace(/_/g, ' ') : null,
      sectors: Array.isArray(o.impact_sectors) ? (o.impact_sectors as string[]).map(s => s.replace(/_/g, ' ')) : [],
      incomeBand: o.annual_income_band ? String(o.annual_income_band) : null,
      location: o.primary_location ? String(o.primary_location) : null,
    }
    const threadId = await getOrCreateActiveThread(ctx.orgId)
    if (threadId) {
      const profileBits = [org.structure, org.sectors.slice(0, 3).join(', '), org.location].filter(Boolean).join(', ')
      await seedThreadOpener(threadId, ctx.orgId,
        `You're ${org.name}${profileBits ? ` — ${profileBits}` : ''} — so I already know a good deal about how you work. Let's build your funding plan; it takes about two minutes.\n\nFirst: how much do you need to raise, and by when?`)
    }
    return <SetupExperience org={org} />
  }

  const examplePrompt = 'What should I focus on this week?'
  // Context suggestion chips — always include one that teaches the outcome loop
  // (recording a win), so users discover that the plan responds to their reality.
  const suggestions = [
    'What should I focus on this week?',
    'We just won a grant',
    'Which funders back core costs?',
  ]

  return (
    <>
      <BriefingView
        briefing={briefing.data}
        plan={plan.data}
        pipeline={pipeline.data}
        displayName={displayName}
      />
      <CompanionDrawer examplePrompt={examplePrompt} suggestions={suggestions} />
      <BriefingSeen />
    </>
  )
}
