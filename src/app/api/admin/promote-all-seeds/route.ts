import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { SEED_GRANTS } from '@/lib/grants'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

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

export async function POST(req: NextRequest) {
  if (!await isAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const db = getAdminClient()

  // Fetch all existing scraped_grants rows (inc. inactive) to deduplicate by title+funder
  const { data: existing, error: fetchError } = await db
    .from('scraped_grants')
    .select('title, funder')
    .limit(10000)

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  const existingKeys = new Set(
    (existing ?? []).map(g => `${g.title}||${g.funder}`)
  )

  // Filter to seeds not already in DB
  const toInsert = SEED_GRANTS.filter(
    g => !existingKeys.has(`${g.title}||${g.funder}`)
  )

  if (toInsert.length === 0) {
    return NextResponse.json({ inserted: 0, skipped: SEED_GRANTS.length, message: 'All seeds already in DB' })
  }

  // Build insert rows
  const rows = toInsert.map(g => ({
    title:                g.title,
    funder:               g.funder,
    funder_type:          g.funderType,
    description:          g.description          ?? null,
    amount_min:           g.amountMin            ?? null,
    amount_max:           g.amountMax            ?? null,
    deadline:             g.deadline             ?? null,
    is_rolling:           g.isRolling            ?? true,
    is_local:             g.isLocal              ?? false,
    sectors:              g.sectors              ?? [],
    eligibility_criteria: g.eligibilityCriteria  ?? [],
    apply_url:            g.applyUrl             ?? null,
    is_invite_only:       g.isInviteOnly         ?? false,
    source:               'manual' as const,
    is_active:            true,
    url_status:           g.applyUrl ? 'unchecked' : null,
  }))

  // Insert in batches of 50 to avoid request size limits
  let inserted = 0
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50)
    const { error } = await db.from('scraped_grants').insert(batch)
    if (error) {
      console.error(`Batch ${i}–${i + batch.length} error:`, error)
      return NextResponse.json({
        error: error.message,
        inserted,
        failed_at_batch_starting: i,
      }, { status: 500 })
    }
    inserted += batch.length
  }

  return NextResponse.json({
    inserted,
    skipped: SEED_GRANTS.length - toInsert.length,
    message: `Promoted ${inserted} seed grants to DB. ${SEED_GRANTS.length - toInsert.length} already existed.`,
  })
}
