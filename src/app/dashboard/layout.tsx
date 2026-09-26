import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/layout/Sidebar'
import AdviserLauncher from '@/components/briefing/AdviserLauncher'
import { agentEnabledForOrg } from '@/lib/agent/orchestrator/config'
import { tierForOrgFlags } from '@/lib/mcp-entitlement'
import { ToastProvider } from '@/components/ui/Toast'
import type { Organisation } from '@/types'
import Link from 'next/link'
import { isFoundingCohort } from '@/lib/founding-cohort'
import { billingCard, type SubscriptionRowLike } from '@/lib/billing/account-card'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const { data: orgs } = await supabase
    .from('organisations')
    .select('*')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true })

  // Honour the active-org cookie (set by the profile switcher); fall back to the
  // oldest org. Was `.limit(1)` on oldest, so the sidebar ignored the switcher
  // and always showed the oldest org.
  const activeId = cookies().get('gt_active_org_id')?.value ?? null
  const org = ((activeId ? orgs?.find(o => o.id === activeId) : null) ?? orgs?.[0] ?? null) as Organisation | null

  // Companion surface gate: flag + tier, resolved server-side once. False for
  // everyone while AGENT_ENABLED is off — nav and pages byte-identical.
  const companionSurface =
    !!org && agentEnabledForOrg(org.id) && tierForOrgFlags(org as { apply_access?: boolean | null; companion_access?: boolean | null }) === 'companion'

  // Apply-tier entitlement for the org actually in view, not for the user.
  // The sidebar used to fetch this from /api/builder/access and cache it under
  // one session key, which meant a multi-org owner kept the first org's nav
  // after switching. Resolved here because this component has already loaded
  // the org row that RLS will be checked against.
  const applyAccess = !!(org as { apply_access?: boolean | null } | null)?.apply_access

  // Day 15. An account whose trial has run out used to land here with the
  // Apply features quietly missing and nothing saying why (six of the first
  // cohort, 24 September). One decision, the same one the account page makes,
  // so the banner and the Billing card cannot disagree. Own row only, by RLS.
  let lapsed: { endedOn: string | null } | null = null
  if (org && !applyAccess) {
    const { data: subRow } = await supabase
      .from('subscriptions')
      .select('plan, status, current_period_end, cancel_at_period_end, stripe_customer_id')
      .eq('owner_id', user.id)
      .maybeSingle()
    const card = billingCard({
      subscription: (subRow as SubscriptionRowLike | null) ?? null,
      isCohort: isFoundingCohort(user.created_at),
      grantedAccessUntil: (org as { granted_access_until?: string | null }).granted_access_until ?? null,
    })
    if (card.state === 'ended') {
      const until = (org as { granted_access_until?: string | null }).granted_access_until
      const d = until && until !== 'infinity' ? new Date(until) : null
      lapsed = { endedOn: d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }) : null }
    }
  }

  return (
    <ToastProvider>
      <div className="flex min-h-screen">
        <Sidebar org={org} userEmail={user.email ?? ''} companionSurface={companionSurface} applyAccess={applyAccess} />
        <main
          className="md:ml-60 flex-1 min-h-screen overflow-x-hidden flex flex-col"
          // EXPERIMENT (branch exp/white-ground). Third value tried here:
          //   #F6F1E7  the original cream — a white card sits ΔE 5.56 off it
          //   #FFFFFF  white            — ΔE 0.00, cards defined by border alone
          //   #FBF8F2  this one         — ΔE 3.30, about 60% of the original step
          // Lighter neighbours if this still reads too warm: #FCFAF5 (2.68),
          // #FDFBF7 (2.19). Heavier: #FAF7F0 (3.78), #F9F5EC (4.77).
          // Revert the branch to undo. The --cream TOKEN is deliberately NOT
          // touched — see the note below on why moving it would drag in
          // surfaces this experiment is not about.
          //
          // NOT the .shoots-a token scope. This element is the
          // parent of 40 pages, and --cream and --sage hold different values
          // inside that scope than outside it (--sage is #639922 globally,
          // #9BCA9D inside). Two admin surfaces consume the colliding tokens
          // today, so scoping here would silently recolour tools nobody asked
          // us to touch. The scope goes on the Sidebar and the dashboard page
          // only; widening it is a 40-page audit, not a one-line change.
          // Ground under review (Paul, 26 Sept): the neutral, on every surface, for a look.
          style={{ background: '#FAFAF7' }}
        >
          {lapsed && (
            <div style={{ background: '#1D3C3E', color: '#F6F1E7', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 14.5, lineHeight: 1.5 }}>
                <span style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 600 }}>
                  {lapsed.endedOn ? `Your free trial ended on ${lapsed.endedOn}.` : 'Your free trial has ended.'}
                </span>{' '}
                Choose a plan to keep going. Nothing you saved is lost.
              </div>
              <Link href="/pricing" style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 600, fontSize: 14, color: '#1D3C3E', background: '#F6F1E7', padding: '9px 20px', borderRadius: 999, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                See plans
              </Link>
            </div>
          )}
          <div className="flex-1 px-4 pt-16 pb-8 md:pt-8 md:px-16">
            {children}
          </div>
        </main>
        {/* Everywhere-launcher: adviser-tier only, on every app page except the
            briefing (it self-hides there — the rail is the entrance). */}
        <AdviserLauncher enabled={companionSurface} />
      </div>
    </ToastProvider>
  )
}
