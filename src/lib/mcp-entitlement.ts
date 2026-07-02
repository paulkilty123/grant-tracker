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
  tier: Tier
}

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function resolveOrgAndTier(userId: string | null | undefined): Promise<ResolvedOrgTier> {
  if (!userId) return { orgId: null, tier: 'free' }

  const { data } = await serviceClient()
    .from('organisations')
    .select('id, apply_access, companion_access, created_at')
    .eq('owner_id', userId)
    .order('created_at', { ascending: true })

  const orgs = (data ?? []) as Array<{ id: string; apply_access: boolean; companion_access: boolean }>
  if (orgs.length === 0) return { orgId: null, tier: 'free' }

  const companion = orgs.find(o => o.companion_access)
  if (companion) return { orgId: companion.id, tier: 'companion' }

  const apply = orgs.find(o => o.apply_access)
  if (apply) return { orgId: apply.id, tier: 'apply' }

  return { orgId: orgs[0].id, tier: 'free' }
}
