import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { SEED_GRANTS } from '@/lib/grants'
import { parseOpenDate } from '@/lib/parse-open-date'
import { requireAdmin, isAdminBearerToken } from '@/lib/auth/require-admin'
import { stampNewGrant } from '@/lib/grant-merge'

export const dynamic = 'force-dynamic'

// Caller resolution: admin session → admin:<email> pinned (they typed it).
// Bearer token → system:admin_api unpinned (script context).
async function resolveCaller(req: NextRequest): Promise<{ source: string; pinned: boolean } | null> {
  if (isAdminBearerToken(req.headers.get('authorization'))) {
    return { source: 'system:admin_api', pinned: false }
  }
  const auth = await requireAdmin()
  if (!auth.ok) return null
  return { source: `admin:${auth.user.email}`, pinned: true }
}

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Handles two cases:
//   1. Promote a seed grant  →  { seedId, title, funder, funder_type, apply_url, is_invite_only }
//   2. Add a manual grant    →  { manual: true, title, funder, funder_type, apply_url, is_invite_only,
//                                 description, amount_min, amount_max, deadline, is_rolling, sectors }
export async function POST(req: NextRequest) {
  const caller = await resolveCaller(req)
  if (!caller) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json() as {
    seedId?: string
    manual?: boolean
    title: string
    funder: string
    funder_type: string
    funding_type?: string | null   // e.g. 'grant' | 'social_investment' | 'support_programme'
    apply_url: string | null
    is_invite_only: boolean
    next_open_date?: string | null
    description?: string | null
    amount_min?: number | null
    amount_max?: number | null
    deadline?: string | null
    is_rolling?: boolean
    sectors?: string[]
  }

  const {
    seedId, manual,
    title, funder, funder_type, funding_type, apply_url, is_invite_only, next_open_date,
    description, amount_min, amount_max, deadline, is_rolling, sectors,
  } = body

  // For seed promotion: pull richer fields from the static array
  const seedData = seedId ? SEED_GRANTS.find(g => g.id === seedId) : undefined

  const row: Record<string, unknown> = {
    title,
    funder,
    funder_type,
    funding_type: funding_type ?? 'grant',  // default to 'grant' — covers all seeds and most manual entries
    apply_url,
    is_invite_only,
    source:     'manual',
    // Manual additions land in Needs Review (is_active=false) so the admin
    // can verify + AI-enrich before they go live to users. Seed promotions
    // stay active because they've already been audited as part of the seed
    // dataset. Per memory rule [catalogue-addition-needs-review-gate].
    is_active:  manual ? false : true,
    url_status: apply_url ? 'unchecked' : null,
  }

  if (manual) {
    // Manually entered fields from the Add Grant modal
    row.description  = description ?? null
    row.amount_min   = amount_min  ?? null
    row.amount_max   = amount_max  ?? null
    row.deadline     = deadline    ?? null
    row.is_rolling   = is_rolling  ?? false
    row.sectors          = sectors        ?? []
    row.next_open_date        = next_open_date ?? null
    row.next_open_date_parsed = parseOpenDate(next_open_date ?? null)
  } else if (seedData) {
    // Seed grant extra fields
    row.description          = seedData.description          ?? null
    row.amount_min           = seedData.amountMin            ?? null
    row.amount_max           = seedData.amountMax            ?? null
    // `?? true` was the same fault as `is_rolling = !deadline`: a seed that
    // says nothing about timing became a promise that there is no deadline.
    row.is_rolling           = seedData.isRolling            ?? null
    row.deadline             = seedData.deadline             ?? null
    row.sectors              = seedData.sectors              ?? []
    row.eligibility_criteria = seedData.eligibilityCriteria ?? []
  }

  // Provenance: manual entries get the admin's identity (or system:admin_api
  // for bearer-token callers); seed promotions are seed:promoted.
  const isManual = !!manual
  const provSource = isManual ? caller.source             : 'seed:promoted'
  const provPinned = isManual ? caller.pinned             : false

  const stamped = stampNewGrant(row, provSource, { pinned: provPinned })

  const db = getAdminClient()
  const { data, error } = await db.from('scraped_grants').insert(stamped).select('id').single()

  if (error) {
    console.error('promote-grant insert error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ id: data.id })
}
