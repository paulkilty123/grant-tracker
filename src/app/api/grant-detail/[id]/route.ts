import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { PUBLIC_BRIEF_FIELDS } from '@/components/FunderBrief'

// PUBLIC endpoint. Everything returned here reaches a user's browser.
//
// It used to `select('*')` and return the row verbatim, which shipped rather
// more than a grant: 257 live rows carry an ADMIN EMAIL ADDRESS inside
// field_provenance (sources are stamped `admin:<email>`), 478 carry _citations
// averaging 3,163 characters of verbatim scraped text, and 22 carry
// _ungrounded_amounts — the internal flag meaning "this figure appears nowhere
// on the funder's page". None of that is a user's business, and the last one is
// actively dangerous to expose as though it were part of the record.
//
// Both lists below are ALLOWLISTS. A denylist would leak the next internal
// column or `_flag` key by default, which is exactly how the citations ended up
// public in the first place.

const PUBLIC_COLUMNS = [
  'id', 'external_id', 'title', 'funder', 'funder_type', 'funding_type',
  'description', 'amount_min', 'amount_max', 'deadline', 'is_rolling',
  'next_open_date', 'is_local', 'location_tag',
  'spend_types', 'spend_restriction',
  'sectors', 'impact_sectors', 'target_beneficiaries',
  'eligibility_criteria', 'eligible_structures',
  'apply_url', 'source', 'last_seen_at', 'is_active',
  'funder_brief',
].join(', ')

/** Strip funder_brief to the fields users are meant to read. Everything else —
 *  _citations, _stale_dates, _ungrounded_amounts, source, last_enriched,
 *  open_status — is internal and stays server-side. */
function publicBrief(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== 'object') return null
  const brief = raw as Record<string, unknown>
  const out: Record<string, string> = {}
  for (const [key] of PUBLIC_BRIEF_FIELDS) {
    const v = brief[key]
    if (typeof v === 'string' && v.trim()) out[key] = v
  }
  return Object.keys(out).length > 0 ? out : null
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const externalId = decodeURIComponent(id)

  const supabase = await createClient()

  // Try external_id first, fall back to DB id
  let { data: grant } = await supabase
    .from('scraped_grants')
    .select(PUBLIC_COLUMNS)
    .eq('external_id', externalId)
    .maybeSingle()

  if (!grant) {
    const { data: byId } = await supabase
      .from('scraped_grants')
      .select(PUBLIC_COLUMNS)
      .eq('id', externalId)
      .maybeSingle()
    grant = byId
  }

  if (!grant) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // The column-list select loses supabase-js's row typing, so narrow once here
  // rather than sprinkling casts through the response construction.
  const row = grant as unknown as Record<string, unknown>

  return NextResponse.json({ ...row, funder_brief: publicBrief(row.funder_brief) })
}
