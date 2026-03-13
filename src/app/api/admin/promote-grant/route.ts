import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { SEED_GRANTS } from '@/lib/grants'

export const dynamic = 'force-dynamic'

const ADMIN_EMAIL = 'paulkilty1@gmail.com'

async function isAuthorised(req: NextRequest): Promise<boolean> {
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.replace('Bearer ', '').trim()
  if (token && token === process.env.ADMIN_SECRET) return true
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user?.email === ADMIN_EMAIL
  } catch {
    return false
  }
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
  if (!await isAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

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
    is_active:  true,
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
    row.next_open_date   = next_open_date ?? null
  } else if (seedData) {
    // Seed grant extra fields
    row.description          = seedData.description          ?? null
    row.amount_min           = seedData.amountMin            ?? null
    row.amount_max           = seedData.amountMax            ?? null
    row.is_rolling           = seedData.isRolling            ?? true
    row.deadline             = seedData.deadline             ?? null
    row.sectors              = seedData.sectors              ?? []
    row.eligibility_criteria = seedData.eligibilityCriteria ?? []
  }

  const db = getAdminClient()
  const { data, error } = await db.from('scraped_grants').insert(row).select('id').single()

  if (error) {
    console.error('promote-grant insert error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ id: data.id })
}
