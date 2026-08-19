// POST /api/builder/eligibility — the gate before effort (builder v0, spec B3
// step 3). Runs the existing eligibility audit for an application's linked
// catalogue opportunity and persists the verdict on the application. Blocking
// mismatches are surfaced BEFORE any generation; the user may proceed anyway
// (their call), which is recorded and emits builder_eligibility_warning.
//
// Body: { application_id: string, proceed?: boolean }
// Returns: EligibilitySnapshot

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getBuilderUser } from '@/lib/builder/access'
import { runEligibilityChecks } from '@/lib/eligibility'
import { normaliseScrapedGrant } from '@/lib/grants-normalise'
import { emitEvent } from '@/lib/events/emit'
import type { EligibilitySnapshot } from '@/lib/builder/types'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const user = await getBuilderUser()
  if (!user) return NextResponse.json({ error: 'Applications are not switched on for this organisation' }, { status: 403 })

  let body: { application_id?: string; proceed?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body.application_id) {
    return NextResponse.json({ error: 'application_id required' }, { status: 400 })
  }

  // Session client — RLS scopes the application to the caller's org.
  const supabase = await createServerClient()
  const { data: app } = await supabase
    .from('applications')
    .select('id, org_id, opportunity_id, eligibility_result')
    .eq('id', body.application_id)
    .maybeSingle()
  if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 })
  if (!app.opportunity_id) {
    return NextResponse.json({ error: 'No catalogue opportunity linked, nothing to check' }, { status: 400 })
  }

  // Proceed-anyway: record the choice and emit the capture event.
  if (body.proceed) {
    const existing = app.eligibility_result as EligibilitySnapshot | null
    if (!existing) return NextResponse.json({ error: 'Run the check first' }, { status: 400 })
    const updated: EligibilitySnapshot = { ...existing, proceeded_anyway: true }
    const { error } = await supabase
      .from('applications')
      .update({ eligibility_result: updated, updated_at: new Date().toISOString() })
      .eq('id', app.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await emitEvent(
      { surface: 'app', orgId: app.org_id, userId: user.id },
      'builder_eligibility_warning',
      {
        application_id: app.id,
        opportunity_id: app.opportunity_id,
        warning_codes: existing.issues.filter(i => i.severity === 'blocker').map(i => i.code),
      },
    )
    return NextResponse.json(updated)
  }

  // Run the audit against the live catalogue row + the org profile.
  const [{ data: grantRow }, { data: org }] = await Promise.all([
    supabase.from('grants_with_funder').select('*').eq('id', app.opportunity_id).maybeSingle(),
    supabase.from('organisations').select('*').eq('id', app.org_id).maybeSingle(),
  ])
  if (!grantRow || !org) {
    return NextResponse.json({ error: 'Could not load the opportunity or organisation' }, { status: 404 })
  }

  const verdict = runEligibilityChecks(normaliseScrapedGrant(grantRow as Record<string, unknown>), org)
  const snapshot: EligibilitySnapshot = {
    overall_status: verdict.status,
    reason: verdict.reason,
    issues: verdict.issues.map(i => ({ code: i.code, severity: i.severity, message: i.message })),
    proceeded_anyway: false,
    checked_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('applications')
    .update({ eligibility_result: snapshot, updated_at: new Date().toISOString() })
    .eq('id', app.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(snapshot)
}
