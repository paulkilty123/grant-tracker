// POST /api/admin/fill-amounts
//
// Parses amount_min / amount_max from funder_brief.typical_award text for grants
// that are missing one or both amount fields. No AI calls — pure regex.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

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
  } catch { return false }
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ── Parse amounts from typical_award text ─────────────────────────────────────
function parseAmounts(text: string): { min?: number; max?: number } {
  if (!text || text.length < 3) return {}

  // Normalise: remove commas in numbers, convert £Xk → £X000, £Xm → £X000000
  let t = text
    .replace(/£([\d,]+)/g, (_, n) => `£${n.replace(/,/g, '')}`)          // £1,000 → £1000
    .replace(/£(\d+(?:\.\d+)?)m\b/gi, (_, n) => `£${Math.round(parseFloat(n) * 1_000_000)}`)  // £1.5m → £1500000
    .replace(/£(\d+(?:\.\d+)?)k\b/gi, (_, n) => `£${Math.round(parseFloat(n) * 1_000)}`)      // £15k → £15000

  // "£X to £Y" / "£X–£Y" / "£X - £Y" / "between £X and £Y"
  const rangeMatch = t.match(/(?:between\s+)?£(\d+)\s*(?:to|–|-|and)\s*£(\d+)/i)
  if (rangeMatch) {
    const min = parseInt(rangeMatch[1])
    const max = parseInt(rangeMatch[2])
    if (min > 0 && max >= min) return { min, max }
  }

  // "up to £X" / "maximum £X" / "max £X" / "no more than £X"
  const maxMatch = t.match(/(?:up to|maximum|max|no more than|not exceed)\s*£(\d+)/i)
  if (maxMatch) return { max: parseInt(maxMatch[1]) }

  // "from £X" / "minimum £X" / "at least £X" / "over £X" / "starts at £X"
  const minMatch = t.match(/(?:from|minimum|min|at least|over|starts? at|starting from)\s*£(\d+)/i)
  if (minMatch) return { min: parseInt(minMatch[1]) }

  // Single "£X per grant/organisation/award"
  const singleMatch = t.match(/(?:grants? of|award of|grants? up to|each grant)\s*£(\d+)/i)
    ?? t.match(/£(\d+)\s*(?:per grant|per organisation|each|per award)/i)
  if (singleMatch) return { max: parseInt(singleMatch[1]) }

  return {}
}

export async function POST(req: NextRequest) {
  if (!await isAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  let body: { dry_run?: boolean } = {}
  try { body = await req.json() } catch { /* no body */ }
  const dryRun = body.dry_run ?? false

  const supabase = adminClient()

  // Fetch grants missing at least one amount field but with typical_award text
  const { data: grants, error } = await supabase
    .from('scraped_grants')
    .select('id, title, funder, amount_min, amount_max, funder_brief')
    .eq('is_active', true)
    .or('amount_min.is.null,amount_max.is.null')
    .not('funder_brief', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let filled = 0
  let skipped = 0
  const updates: Array<{ id: string; title: string; funder: string; amount_min?: number; amount_max?: number }> = []

  for (const grant of grants ?? []) {
    const brief = grant.funder_brief as Record<string, unknown> | null
    const typicalAward = (brief?.typical_award as string) ?? ''
    if (!typicalAward) { skipped++; continue }

    const parsed = parseAmounts(typicalAward)
    if (!parsed.min && !parsed.max) { skipped++; continue }

    // Only fill fields that are currently null — don't overwrite existing values
    const update: Record<string, number> = {}
    if (grant.amount_min === null && parsed.min) update.amount_min = parsed.min
    if (grant.amount_max === null && parsed.max) update.amount_max = parsed.max

    if (Object.keys(update).length === 0) { skipped++; continue }

    updates.push({
      id: grant.id,
      title: grant.title,
      funder: grant.funder ?? '',
      ...update,
    })

    if (!dryRun) {
      await supabase
        .from('scraped_grants')
        .update(update)
        .eq('id', grant.id)
    }
    filled++
  }

  return NextResponse.json({
    dry_run: dryRun,
    filled,
    skipped,
    updates: dryRun ? updates : undefined,
  })
}
