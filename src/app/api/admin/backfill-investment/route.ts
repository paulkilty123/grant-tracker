// POST /api/admin/backfill-investment
//
// Re-derives the two verdict-driving social-investment fields
// (si_security_required, si_interest_rate_percent) over EXISTING active
// investment rows using the deterministic extractor — no page re-fetch, no AI.
// Writes resolved values through the merger under ai_extract:investment:v1, and
// returns the rows it deliberately left null (prose/amount ticket conflicts,
// term ranges, multi-rate) so they can be eyeballed Group-D style.
//
// Conservative: only fills a field that is currently null, so already-populated
// rows aren't churned. The trust ladder still protects any admin-pinned value.

import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/admin/admin-db'
import { requireAdmin, isAdminBearerToken } from '@/lib/auth/require-admin'
import { mergeGrantUpdate } from '@/lib/grant-merge'
import { extractInvestmentTerms, type InvestmentCitation } from '@/lib/extract-investment-terms'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const INVESTMENT_SOURCE = 'ai_extract:investment:v1'

async function isAuthorised(req: NextRequest): Promise<boolean> {
  if (isAdminBearerToken(req.headers.get('authorization'))) return true
  const auth = await requireAdmin()
  return auth.ok
}

function adminClient() {
  return getAdminDb()
}

type DryRunWrite = {
  id: string
  title: string
  funder: string
  si_security_required?: string
  si_interest_rate_percent?: number
  confidence?: InvestmentCitation['confidence']
  snippet?: string
}

type LeftNull = {
  id: string
  title: string
  funder: string
  reasons: string[]
  ticket_text?: string
  amount?: string
}

export async function POST(req: NextRequest) {
  if (!await isAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  let body: { dry_run?: boolean } = {}
  try { body = await req.json() } catch { /* no body */ }
  const dryRun = body.dry_run ?? false

  const supabase = adminClient()

  const { data: grants, error } = await supabase
    .from('scraped_grants')
    .select('id, title, funder, description, eligibility_criteria, funder_brief, amount_min, amount_max, si_security_required, si_interest_rate_percent')
    .eq('is_active', true)
    .eq('funding_type', 'investment')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let written = 0
  let skipped = 0
  let alreadyPopulated = 0
  const writes: DryRunWrite[] = []
  const leftNull: LeftNull[] = []

  for (const grant of grants ?? []) {
    const brief = grant.funder_brief as Record<string, unknown> | null
    const whoCanApply  = typeof brief?.who_can_apply === 'string' ? brief.who_can_apply as string : null
    const exclusions   = typeof brief?.exclusions === 'string' ? brief.exclusions as string : null
    const typicalAward = typeof brief?.typical_award === 'string' ? brief.typical_award as string : null

    const eligibilityCriteria = Array.isArray(grant.eligibility_criteria)
      ? (grant.eligibility_criteria as string[])
      : typeof grant.eligibility_criteria === 'string' ? [grant.eligibility_criteria] : null

    const terms = extractInvestmentTerms({
      description: grant.description ?? null,
      eligibilityCriteria,
      whoCanApply,
      exclusions,
      typicalAward,
      amountMin: typeof grant.amount_min === 'number' ? grant.amount_min : null,
      amountMax: typeof grant.amount_max === 'number' ? grant.amount_max : null,
    })

    // Only fill a field that is currently null — leave populated rows alone.
    const update: Record<string, unknown> = {}
    if (grant.si_security_required == null && terms.securityRequired) {
      update.si_security_required = terms.securityRequired
    }
    if (grant.si_interest_rate_percent == null && terms.interestRatePercent !== undefined) {
      update.si_interest_rate_percent = terms.interestRatePercent
    }

    // Anything we deliberately did not resolve to a write — surface for review.
    const reasons = terms.notes.filter(n =>
      n.includes('left null') || n.includes('conflicting') || n.includes('disagrees'),
    )
    if (reasons.length > 0) {
      leftNull.push({
        id: grant.id,
        title: grant.title,
        funder: grant.funder ?? '',
        reasons,
        ticket_text: terms.ticketConflict
          ? `£${terms.ticketConflict.textMin?.toLocaleString()}–£${terms.ticketConflict.textMax?.toLocaleString()}`
          : undefined,
        amount: `£${(grant.amount_min ?? 0).toLocaleString()}–£${(grant.amount_max ?? 0).toLocaleString()}`,
      })
    }

    if (Object.keys(update).length === 0) {
      if (terms.securityRequired || terms.interestRatePercent !== undefined) alreadyPopulated++
      else skipped++
      continue
    }

    const citation = update.si_security_required
      ? terms.securityCitation
      : terms.interestCitation
    writes.push({
      id: grant.id,
      title: grant.title,
      funder: grant.funder ?? '',
      ...(update.si_security_required ? { si_security_required: update.si_security_required as string } : {}),
      ...(update.si_interest_rate_percent !== undefined ? { si_interest_rate_percent: update.si_interest_rate_percent as number } : {}),
      confidence: citation?.confidence,
      snippet: citation?.snippet,
    })

    if (!dryRun) {
      const citations: Record<string, InvestmentCitation> = {}
      if (update.si_security_required && terms.securityCitation) citations.si_security_required = terms.securityCitation
      if (update.si_interest_rate_percent !== undefined && terms.interestCitation) citations.si_interest_rate_percent = terms.interestCitation
      try {
        await mergeGrantUpdate({
          id:        grant.id,
          fields:    update,
          source:    INVESTMENT_SOURCE,
          pinned:    false,
          citations: Object.keys(citations).length > 0 ? citations : undefined,
          db:        supabase,
        })
      } catch (err) {
        console.error('[backfill-investment] write failed:', grant.id, err)
        skipped++
        continue
      }
    }
    written++
  }

  return NextResponse.json({
    dry_run: dryRun,
    scanned: grants?.length ?? 0,
    written,
    already_populated: alreadyPopulated,
    skipped,
    left_null_count: leftNull.length,
    writes: dryRun ? writes : undefined,
    left_null: leftNull,
  })
}
