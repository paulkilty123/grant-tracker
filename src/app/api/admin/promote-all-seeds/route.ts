import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/admin/admin-db'
import { SEED_GRANTS } from '@/lib/grants'
import { requireAdmin, isAdminBearerToken } from '@/lib/auth/require-admin'
import { stampNewGrant } from '@/lib/grant-merge'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const PROVENANCE_SOURCE = 'seed:bulk-promote'

async function isAuthorised(req: NextRequest): Promise<boolean> {
  if (isAdminBearerToken(req.headers.get('authorization'))) return true
  const auth = await requireAdmin()
  return auth.ok
}

function getAdminClient() {
  return getAdminDb()
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
    // Unknown is not rolling. See the note in admin/urls — defaulting this to
    // true turns a missing deadline into a promise that there is no deadline.
    is_rolling:           g.isRolling            ?? false,
    is_local:             g.isLocal              ?? false,
    sectors:              g.sectors              ?? [],
    eligibility_criteria: g.eligibilityCriteria  ?? [],
    apply_url:            g.applyUrl             ?? null,
    is_invite_only:       g.isInviteOnly         ?? false,
    source:               'manual' as const,
    is_active:            true,
    url_status:           g.applyUrl ? 'unchecked' : null,
  }))

  // Stamp provenance on every row before insert.
  const stampedRows = rows.map(r => stampNewGrant(r, PROVENANCE_SOURCE, { pinned: false }))

  // Insert in batches of 50 to avoid request size limits
  let inserted = 0
  for (let i = 0; i < stampedRows.length; i += 50) {
    const batch = stampedRows.slice(i, i + 50)
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
