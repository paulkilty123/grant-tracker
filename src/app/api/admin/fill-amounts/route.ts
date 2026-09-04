// POST /api/admin/fill-amounts
//
// Parses amount_min / amount_max for grants missing one or both amount fields,
// using the shared cue-based extractor in src/lib/grant-amounts.ts. No AI calls.

import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/admin/admin-db'
import { requireAdmin, isAdminBearerToken } from '@/lib/auth/require-admin'
import { mergeGrantUpdate } from '@/lib/grant-merge'
import { buildAwardText, extractGrantAmounts } from '@/lib/grant-amounts'

export const dynamic = 'force-dynamic'

// v2 (2026-07-25): swapped the local crude regex for the shared pool-aware
// extractor, and widened the source text beyond typical_award.
//
// Trust note: this writes as `ai_detect:*`, which is trust 30 — BELOW
// `scraper` at 40. So anything written here is erased by the next crawl of that
// source. That predates this change and is deliberately left alone rather than
// silently re-ranked, but it means this route is a stopgap: the durable path is
// the same extractor running inside enrich-grant under `ai_extract:amounts:v1`
// (trust 50), which survives a crawl. See grant-amounts.ts.
const DETECT_VERSION    = 'v2'
const PROVENANCE_SOURCE = `ai_detect:fill_amounts:${DETECT_VERSION}`

async function isAuthorised(req: NextRequest): Promise<boolean> {
  if (isAdminBearerToken(req.headers.get('authorization'))) return true
  const auth = await requireAdmin()
  return auth.ok
}

function adminClient() {
  return getAdminDb()
}

// Amount parsing now uses the shared cue-based implementation in
// src/lib/grant-amounts.ts.
//
// 2026-07-25: the crude regex that used to live here read ONLY
// funder_brief.typical_award and had no pool-vs-per-grant cues, so a funder's
// total distribution was written as the per-applicant amount. Measured against
// the real cases the shared logic was built from:
//
//   "the Trust awarded a total of between £90,000 and £97,000"
//       old -> min £90,000 / max £97,000        (the funder's ANNUAL TOTAL)
//       new -> nothing                          (correctly recognised as a pool)
//
//   "total awarded each year is around £450,000–£470,000"
//       old -> min £450,000 / max £470,000
//       new -> nothing
//
// It also filled min and max from independent matches with no cross-field check,
// so it could write a minimum above the maximum.

export async function POST(req: NextRequest) {
  if (!await isAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  let body: { dry_run?: boolean } = {}
  try { body = await req.json() } catch { /* no body */ }
  const dryRun = body.dry_run ?? false

  const supabase = adminClient()

  // `description` is now selected too: briefs often generalise typical_award to
  // "small grants, no fixed amount" while the scraped description carries an
  // explicit "Up to £X".
  const { data: grants, error } = await supabase
    .from('scraped_grants')
    .select('id, title, funder, amount_min, amount_max, funder_brief, description')
    .eq('is_active', true)
    .or('amount_min.is.null,amount_max.is.null')
    .not('funder_brief', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let filled = 0
  let skipped = 0
  const updates: Array<{ id: string; title: string; funder: string; amount_min?: number; amount_max?: number }> = []

  for (const grant of grants ?? []) {
    const brief = grant.funder_brief as Record<string, unknown> | null
    const awardText = buildAwardText([
      brief?.typical_award as string | null | undefined,
      brief?.what_they_fund as string | null | undefined,
      grant.description as string | null | undefined,
      grant.title as string | null | undefined,
    ])
    if (!awardText) { skipped++; continue }

    const parsed = extractGrantAmounts(awardText)
    if (parsed.amount_min === null && parsed.amount_max === null) { skipped++; continue }

    // Only fill fields that are currently null — don't overwrite existing values.
    // amount_min is only written alongside a max the extractor also derived, so
    // the min < max invariant it enforces internally is preserved on write.
    const update: Record<string, number> = {}
    if (grant.amount_max === null && parsed.amount_max !== null) update.amount_max = parsed.amount_max
    if (grant.amount_min === null && parsed.amount_min !== null) update.amount_min = parsed.amount_min

    if (Object.keys(update).length === 0) { skipped++; continue }

    updates.push({
      id: grant.id,
      title: grant.title,
      funder: grant.funder ?? '',
      ...update,
    })

    if (!dryRun) {
      try {
        await mergeGrantUpdate({
          id:     grant.id,
          fields: update,
          source: PROVENANCE_SOURCE,
          pinned: false,
          db:     supabase,
        })
      } catch (err) {
        console.error('[fill-amounts] write failed:', err)
        skipped++
        continue
      }
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
