// Web-session ToolContext boundary — the in-app counterpart of the MCP path.
//
// This is the ONE place a web session becomes a ToolContext, mirroring what
// resolveOrgAndTier (src/lib/mcp-entitlement.ts) does for an OAuth token. Both
// end in the same { orgId, tier } shape, through the same flags→tier mapping
// (tierForOrgFlags), so the tool layer sees identical identities from either
// surface. This file deliberately lives OUTSIDE src/lib/agent/tools/ — it
// imports session/cookie context, which the tool layer is forbidden to touch.
//
// ONE documented divergence from the MCP resolver: org selection. The MCP path
// binds to the user's highest-entitled org (no UI to choose; §13.7 per-connection
// selection is designed-not-built). The web path binds to the ACTIVE org — the
// gt_active_org_id cookie the profile switcher writes, falling back to the
// oldest — because the agent must talk about the same org the rest of the app
// is showing. Tier is then resolved for THAT org: an active org without
// companion access gets the free surface, it does not inherit a sibling org's
// entitlement.

import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { tierForOrgFlags } from '@/lib/mcp-entitlement'
import type { ToolContext } from './tools/types'

export type WebBoundaryResult =
  | { ok: true; ctx: ToolContext }
  | { ok: false; status: 401 | 403; error: string }

const ACTIVE_ORG_COOKIE = 'gt_active_org_id'

export async function resolveWebToolContext(): Promise<WebBoundaryResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401, error: 'Not signed in.' }

  // All owned orgs, oldest first — the app-wide fallback convention.
  const { data: orgs } = await supabase
    .from('organisations')
    .select('id, apply_access, companion_access, created_at')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true })
  if (!orgs?.length) return { ok: false, status: 403, error: 'No organisation found for this account.' }

  const cookieStore = await cookies()
  const activeId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value ?? null
  const org = (activeId && orgs.find(o => o.id === activeId)) || orgs[0]

  return {
    ok: true,
    ctx: {
      orgId: org.id,
      surface: 'app',
      tier: tierForOrgFlags(org),
      userId: user.id,
    },
  }
}
