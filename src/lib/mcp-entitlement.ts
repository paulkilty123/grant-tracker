// MCP entitlement boundary — token identity → org → tier.
//
// This is the ONE place the MCP surface turns an authenticated user into a
// ToolContext identity. It mirrors what the web-session path would do
// (resolveTier at the boundary), so an external model reaches the tool layer
// through the exact same gate as the in-app orchestrator. The tool layer itself
// (src/lib/agent/tools/) never sees a token, cookie, or request — it only ever
// receives the resolved { orgId, tier }.
//
// Multi-org: a user can own more than one org. We resolve to the org with the
// HIGHEST entitlement (companion > apply > plain), tie-breaking on the oldest —
// so a companion-tier org is always the one the strategist binds to, and
// everyone else falls back to their oldest org (matching the in-app fallback).
// Per-connection org selection at consent time is a later refinement.

import { createClient } from '@supabase/supabase-js'
import type { Tier } from './agent/tools/types'

export interface ResolvedOrgTier {
  orgId: string | null
  orgName: string | null
  tier: Tier
}

/** The one org-flags → tier mapping, shared by the MCP boundary (below) and the
 *  web-session boundary (src/lib/agent/boundary.ts). Change entitlement policy
 *  here and both surfaces move together. */
export function tierForOrgFlags(flags: { apply_access?: boolean | null; companion_access?: boolean | null }): Tier {
  if (flags.companion_access) return 'companion'
  if (flags.apply_access) return 'apply'
  return 'free'
}

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function resolveOrgAndTier(userId: string | null | undefined): Promise<ResolvedOrgTier> {
  if (!userId) return { orgId: null, orgName: null, tier: 'free' }

  const { data } = await serviceClient()
    .from('organisations')
    .select('id, name, apply_access, companion_access, created_at')
    .eq('owner_id', userId)
    .order('created_at', { ascending: true })

  const orgs = (data ?? []) as Array<{ id: string; name: string | null; apply_access: boolean; companion_access: boolean }>
  if (orgs.length === 0) return { orgId: null, orgName: null, tier: 'free' }

  // Highest entitlement wins, tie-broken oldest — via the same flags→tier
  // mapping the web boundary uses (tierForOrgFlags).
  const companion = orgs.find(o => tierForOrgFlags(o) === 'companion')
  if (companion) return { orgId: companion.id, orgName: companion.name, tier: 'companion' }

  const apply = orgs.find(o => tierForOrgFlags(o) === 'apply')
  if (apply) return { orgId: apply.id, orgName: apply.name, tier: 'apply' }

  return { orgId: orgs[0].id, orgName: orgs[0].name, tier: 'free' }
}
