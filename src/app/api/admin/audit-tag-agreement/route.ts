// Bulk tag-disagreement scan. For every published grant whose brief is
// substantial enough to compare against, run suggestTags() over both
// impact_sectors and target_beneficiaries, score the disagreement, and
// return a ranked worklist (worst first).
//
// No AI calls — pure text-match using the synonym lists in
// src/lib/tag-suggestions.ts. Safe to call repeatedly.
//
// GET  /api/admin/audit-tag-agreement
//   Query (optional):
//     limit         — cap on rows returned (default 200, max 1000)
//     min_score     — only return rows with at least this many disagreements (default 1)
//     include_thin  — also include grants whose briefs are too thin to score
//                     (these get score=0 + briefThin=true); useful as a worklist
//                     for "enrich these first." Default false.
//
// Auth: requireAdmin / isAdminBearerToken.

import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/admin/admin-db'
import { requireAdmin, isAdminBearerToken } from '@/lib/auth/require-admin'
import {
  IMPACT_SECTOR_OPTIONS,
  BENEFICIARY_OPTIONS,
  SECTOR_SYNONYMS,
  BENEFICIARY_SYNONYMS,
  buildBriefText,
  suggestTags,
  isBriefThin,
  THIN_BRIEF_THRESHOLD,
} from '@/lib/tag-suggestions'

export const dynamic   = 'force-dynamic'
export const maxDuration = 60

async function isAuthorised(req: NextRequest): Promise<boolean> {
  if (isAdminBearerToken(req.headers.get('authorization'))) return true
  const auth = await requireAdmin()
  return auth.ok
}

function adminClient() {
  return getAdminDb()
}

export type TagAuditRow = {
  id:                     string
  title:                  string
  funder:                 string | null
  source:                 string
  brief_chars:            number
  brief_thin:             boolean
  sector_missing:         string[]   // sector option values the brief mentions but the row isn't tagged with
  sector_extra:           string[]   // sector option values the row is tagged with but the brief doesn't mention
  beneficiary_missing:    string[]
  beneficiary_extra:      string[]
  tag_count:              number     // current number of impact_sectors + target_beneficiaries combined
  score:                  number     // weighted disagreement: missing*2 + extras*0.5 (missing dominates because it's more often actionable; extras are noisier — many funders have core programmes the brief doesn't literally mention by sector name)
}

export async function GET(req: NextRequest) {
  if (!await isAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const url   = new URL(req.url)
  const limit = Math.min(Number(url.searchParams.get('limit')) || 200, 1000)
  const minScore     = Number(url.searchParams.get('min_score')) || 1
  const includeThin  = url.searchParams.get('include_thin') === 'true'

  const db = adminClient()

  // Pull every published grant with the fields needed to build the brief blob
  // and run the disagreement check. Saved-for-later excluded — they're parked.
  const { data, error } = await db
    .from('scraped_grants')
    .select('id, title, funder, source, funder_brief, description, impact_sectors, target_beneficiaries')
    .eq('pipeline_state', 'published')
    .not('saved_for_later', 'is', 'true')
    .order('last_seen_at', { ascending: false })
    .limit(2000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows: TagAuditRow[] = []
  let totalScanned = 0
  let totalThin    = 0

  for (const g of data ?? []) {
    totalScanned++
    const brief = buildBriefText(g)
    const thin  = isBriefThin(g)
    if (thin) totalThin++

    const sectorsValue       = (g.impact_sectors       as string[] | null) ?? []
    const beneficiariesValue = (g.target_beneficiaries as string[] | null) ?? []

    const sectorSugg      = thin ? { missing: [], extra: [] } : suggestTags(IMPACT_SECTOR_OPTIONS, sectorsValue,       brief, SECTOR_SYNONYMS)
    const beneficiarySugg = thin ? { missing: [], extra: [] } : suggestTags(BENEFICIARY_OPTIONS,   beneficiariesValue, brief, BENEFICIARY_SYNONYMS)

    // Weighted score: missing matters more than extras.
    // Rationale per audit 2026-05-24: "verify" (extras) is the noisier
    // signal — major funders often have core programmes the brief doesn't
    // literally name (Nesta has 'social_innovation' core but the brief
    // doesn't say "social innovation"). "Missing" is more often a real
    // under-tag worth fixing (Sport Wales tagged sport-only but the brief
    // mentions community/youth/health crossover).
    const missingCount = sectorSugg.missing.length + beneficiarySugg.missing.length
    const extraCount   = sectorSugg.extra.length   + beneficiarySugg.extra.length
    const score        = Math.round(missingCount * 2 + extraCount * 0.5)
    const tagCount     = sectorsValue.length + beneficiariesValue.length

    // Apply filters
    if (thin && !includeThin) continue
    if (!thin && score < minScore) continue

    rows.push({
      id:                  g.id as string,
      title:               g.title as string,
      funder:              g.funder as string | null,
      source:              g.source as string,
      brief_chars:         brief.length,
      brief_thin:          thin,
      sector_missing:      sectorSugg.missing,
      sector_extra:        sectorSugg.extra,
      beneficiary_missing: beneficiarySugg.missing,
      beneficiary_extra:   beneficiarySugg.extra,
      tag_count:           tagCount,
      score,
    })
  }

  // Sort worst-first; thin briefs sort last (score=0) but still useful as a
  // separate worklist when include_thin=true.
  rows.sort((a, b) => {
    if (a.brief_thin !== b.brief_thin) return a.brief_thin ? 1 : -1
    return b.score - a.score
  })

  return NextResponse.json({
    summary: {
      total_scanned:   totalScanned,
      total_thin:      totalThin,
      total_returned:  Math.min(rows.length, limit),
      thin_threshold:  THIN_BRIEF_THRESHOLD,
      min_score:       minScore,
      include_thin:    includeThin,
    },
    rows: rows.slice(0, limit),
  })
}
