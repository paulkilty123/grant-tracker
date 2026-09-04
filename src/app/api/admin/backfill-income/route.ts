// POST /api/admin/backfill-income
//
// Re-derives min_org_income / max_org_income over EXISTING rows' stored text
// using the same deterministic extractor as the enrich write path — no page
// re-fetch, no AI call. Writes resolved values (Group A+B) through the merger
// under ai_extract:income:v1, and returns the unresolved-but-gate-present rows
// (Group D) with a source snippet so they can be adjudicated by hand.
//
// Conservative by design: only fills a field that is currently null, so the
// already-populated rows aren't churned. The trust ladder still protects any
// admin-pinned value if one slips through.

import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/admin/admin-db'
import { requireAdmin, isAdminBearerToken } from '@/lib/auth/require-admin'
import { mergeGrantUpdate } from '@/lib/grant-merge'
import { extractIncomeGate, type IncomeGateCitation } from '@/lib/extract-income-gate'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const INCOME_SOURCE = 'ai_extract:income:v1'

async function isAuthorised(req: NextRequest): Promise<boolean> {
  if (isAdminBearerToken(req.headers.get('authorization'))) return true
  const auth = await requireAdmin()
  return auth.ok
}

function adminClient() {
  return getAdminDb()
}

// Best-effort human-facing snippet for a Group D row: the first £ figure that
// sits next to an income/turnover word, with a little context either side.
function gateSnippet(parts: (string | null | undefined)[]): string | null {
  const text = parts.filter(Boolean).join('  ').replace(/\s+/g, ' ').trim()
  if (!text) return null
  const figRe = /£\s?[0-9][0-9,.]*\s?(?:thousand|million|billion|bn|k|m)?/gi
  for (const m of Array.from(text.matchAll(figRe))) {
    const idx = m.index ?? 0
    const around = text.slice(Math.max(0, idx - 60), idx + 60).toLowerCase()
    if (/\b(income|turnover|annual budget)\b/.test(around)) {
      return text.slice(Math.max(0, idx - 100), idx + 100).trim()
    }
  }
  const km = text.match(/\b(income|turnover|annual budget)\b/i)
  if (km && km.index !== undefined) {
    return text.slice(Math.max(0, km.index - 60), km.index + 140).trim()
  }
  return null
}

type DryRunWrite = {
  id: string
  title: string
  funder: string
  min_org_income?: number
  max_org_income?: number
  confidence?: IncomeGateCitation['confidence']
  snippet?: string
}

type GroupD = {
  id: string
  title: string
  funder: string
  snippet: string | null
}

export async function POST(req: NextRequest) {
  if (!await isAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  let body: { dry_run?: boolean } = {}
  try { body = await req.json() } catch { /* no body */ }
  const dryRun = body.dry_run ?? false

  const supabase = adminClient()

  // Active catalogue rows. We scan every active row's stored text rather than
  // pre-filtering on income keywords in SQL — the extractor is the source of
  // truth for what counts as a gate, and the population is small (~600 rows).
  const { data: grants, error } = await supabase
    .from('scraped_grants')
    .select('id, title, funder, description, eligibility_criteria, funder_brief, min_org_income, max_org_income')
    .eq('is_active', true)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let written = 0
  let skipped = 0
  let alreadyPopulated = 0
  const writes: DryRunWrite[] = []
  const groupD: GroupD[] = []

  for (const grant of grants ?? []) {
    const brief = grant.funder_brief as Record<string, unknown> | null
    const whoCanApply  = typeof brief?.who_can_apply === 'string' ? brief.who_can_apply as string : null
    const exclusions   = typeof brief?.exclusions === 'string' ? brief.exclusions as string : null
    const typicalAward = typeof brief?.typical_award === 'string' ? brief.typical_award as string : null

    const eligibilityCriteria = Array.isArray(grant.eligibility_criteria)
      ? (grant.eligibility_criteria as string[])
      : typeof grant.eligibility_criteria === 'string' ? [grant.eligibility_criteria] : null

    const gate = extractIncomeGate({
      description: grant.description ?? null,
      eligibilityCriteria,
      whoCanApply,
      exclusions,
      typicalAward,
    })

    const resolved = gate.minOrgIncome !== undefined || gate.maxOrgIncome !== undefined

    if (!resolved) {
      if (gate.gateLanguagePresent) {
        groupD.push({
          id: grant.id,
          title: grant.title,
          funder: grant.funder ?? '',
          snippet: gateSnippet([grant.description, ...(eligibilityCriteria ?? []), whoCanApply, exclusions]),
        })
      }
      skipped++
      continue
    }

    // Only fill a field that is currently null — leave populated rows alone.
    const update: Record<string, number> = {}
    if (grant.min_org_income == null && gate.minOrgIncome !== undefined) update.min_org_income = gate.minOrgIncome
    if (grant.max_org_income == null && gate.maxOrgIncome !== undefined) update.max_org_income = gate.maxOrgIncome

    if (Object.keys(update).length === 0) { alreadyPopulated++; continue }

    writes.push({
      id: grant.id,
      title: grant.title,
      funder: grant.funder ?? '',
      ...update,
      confidence: gate.citation?.confidence,
      snippet: gate.citation?.snippet,
    })

    if (!dryRun) {
      const citations = gate.citation
        ? Object.fromEntries(Object.keys(update).map(f => [f, gate.citation!]))
        : undefined
      try {
        await mergeGrantUpdate({
          id:        grant.id,
          fields:    update,
          source:    INCOME_SOURCE,
          pinned:    false,
          citations,
          db:        supabase,
        })
      } catch (err) {
        console.error('[backfill-income] write failed:', grant.id, err)
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
    group_d_count: groupD.length,
    writes: dryRun ? writes : undefined,
    group_d: groupD,
  })
}
