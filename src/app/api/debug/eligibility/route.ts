// Debug route — runs the branched eligibility engine for any org / grant pair
// and returns the structured EligibilityVerdict. Mirrors the shape the future
// MCP `search_funding_and_support` tool will return.
//
// GET /api/debug/eligibility?orgId=<uuid>&grantId=<uuid>
//
// Auth: ADMIN_SECRET bearer token, or admin session.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runEligibilityChecks } from '@/lib/eligibility'
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
      usage: '/api/debug/eligibility?orgId=<uuid>&grantId=<uuid>',
    }, { status: 400 })
  }

  const sb = getAdminClient()

  const [{ data: org, error: orgErr }, { data: row, error: grantErr }] = await Promise.all([
    sb.from('organisations').select('*').eq('id', orgId).maybeSingle(),
    sb.from('grants_with_funder').select('*').eq('id', grantId).maybeSingle(),
  ])

  if (orgErr)   return NextResponse.json({ error: 'org lookup failed', detail: orgErr.message }, { status: 500 })
  if (grantErr) return NextResponse.json({ error: 'grant lookup failed', detail: grantErr.message }, { status: 500 })
  if (!org)     return NextResponse.json({ error: 'org not found',   orgId   }, { status: 404 })
  if (!row)     return NextResponse.json({ error: 'grant not found', grantId }, { status: 404 })

  const opp = normaliseScrapedGrant(row as Record<string, unknown>)
  const verdict = runEligibilityChecks(opp, org as Organisation)

  return NextResponse.json({
    org: {
      id:               (org as Organisation).id,
      name:             (org as Organisation).name,
      legal_structure:  (org as Organisation).legal_structure,
      annual_income:    (org as Organisation).annual_income_band,
      primary_location: (org as Organisation).primary_location,
      org_stage:        (org as Organisation).org_stage,
      has_asset_lock:   (org as Organisation).has_asset_lock,
    },
    opportunity: {
      id:                  opp.id,
      title:               opp.title,
      funder:              opp.funder,
      fundingType:         opp.fundingType ?? 'grant',
      isLocal:             opp.isLocal,
      locationTag:         opp.locationTag,
      isInviteOnly:        opp.isInviteOnly,
      eligibleStructures:  opp.eligibleStructures ?? null,
      targetBeneficiaries: opp.targetBeneficiaries ?? null,
    },
    verdict,
  })
}
