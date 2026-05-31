// Debug route — runs computeMatchScore for any org / grant pair and returns
// the full score, breakdown, reasons, and dimension contributions.
//
// GET /api/debug/match?orgId=<uuid>&grantId=<uuid>
//
// Auth: ADMIN_SECRET bearer token, or admin session.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { computeMatchScore } from '@/lib/matching'
import { normaliseScrapedGrant } from '@/lib/grants-normalise'
import type { Organisation } from '@/types'

export const dynamic = 'force-dynamic'

const ADMIN_EMAIL = 'paulkilty1@gmail.com'

async function isAuthorised(req: NextRequest): Promise<boolean> {
  const auth = req.headers.get('authorization') ?? ''
  const bearer = auth.replace('Bearer ', '').trim()
  if (bearer && bearer === process.env.ADMIN_SECRET) return true
  try {
    const { createClient: createSrv } = await import('@/lib/supabase/server')
    const sb = await createSrv()
    const { data: { user } } = await sb.auth.getUser()
    return user?.email === ADMIN_EMAIL
  } catch { return false }
}

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function GET(req: NextRequest) {
  if (!(await isAuthorised(req))) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  }

  const url = new URL(req.url)
  const orgId   = url.searchParams.get('orgId')?.trim()
  const grantId = url.searchParams.get('grantId')?.trim()

  if (!orgId || !grantId) {
    return NextResponse.json({
      error: 'missing parameters',
      usage: '/api/debug/match?orgId=<uuid>&grantId=<uuid>',
    }, { status: 400 })
  }

  const sb = getAdminClient()

  const [{ data: org, error: orgErr }, { data: row, error: grantErr }] = await Promise.all([
    sb.from('organisations').select('*').eq('id', orgId).maybeSingle(),
    sb.from('grants_with_funder').select('*').eq('id', grantId).maybeSingle(),
  ])

  if (orgErr)   return NextResponse.json({ error: 'org lookup failed',   detail: orgErr.message },   { status: 500 })
  if (grantErr) return NextResponse.json({ error: 'grant lookup failed', detail: grantErr.message }, { status: 500 })
  if (!org)     return NextResponse.json({ error: 'org not found',   orgId },   { status: 404 })
  if (!row)     return NextResponse.json({ error: 'grant not found', grantId }, { status: 404 })

  const opp    = normaliseScrapedGrant(row as Record<string, unknown>)
  const result = computeMatchScore(opp, org as Organisation)

  return NextResponse.json({
    org: {
      id:                          (org as Organisation).id,
      name:                        (org as Organisation).name,
      legal_structure:             (org as Organisation).legal_structure,
      annual_income:               (org as Organisation).annual_income_band,
      primary_location:            (org as Organisation).primary_location,
      impact_sectors:              (org as Organisation).impact_sectors,
      niche_tags:                  (org as Organisation).niche_tags,
      beneficiary_groups:          (org as Organisation).beneficiary_groups,
      min_grant_target:            (org as Organisation).min_grant_target,
      max_grant_target:            (org as Organisation).max_grant_target,
      funder_type_preferences:     (org as Organisation).funder_type_preferences,
      funding_type_preferences:    (org as Organisation).funding_type_preferences,
    },
    opportunity: {
      id:                  opp.id,
      title:               opp.title,
      funder:              opp.funder,
      fundingType:         opp.fundingType ?? 'grant',
      amountMin:           opp.amountMin,
      amountMax:           opp.amountMax,
      isLocal:             opp.isLocal,
      locationTag:         opp.locationTag,
      impactSectors:       opp.impactSectors ?? null,
      nicheTags:           opp.nicheTags ?? null,
      targetBeneficiaries: opp.targetBeneficiaries ?? null,
      eligibleStructures:  opp.eligibleStructures ?? null,
    },
    result,
  })
}
