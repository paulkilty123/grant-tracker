import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const ADMIN_EMAIL = 'paulkilty1@gmail.com'

// Wipes the admin's organisation row back to a fresh-onboarding state so the
// admin can preview empty-profile experiences. Keeps the org row (and its id /
// owner_id) intact — only resets user-input fields.
export async function POST() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { data: orgs, error: fetchError } = await supabase
    .from('organisations')
    .select('id')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }
  const orgId = orgs?.[0]?.id
  if (!orgId) {
    return NextResponse.json({ error: 'No organisation found for admin user' }, { status: 404 })
  }

  // Mirrors a user who pressed "Set up later" during onboarding: org row exists,
  // name was entered at signup (kept as-is), everything else empty.
  const reset = {
    charity_number:               null,
    cic_number:                   null,
    org_type:                     'other',
    legal_structure:              null,
    org_stage:                    null,
    social_mission_declared:      false,
    articles_restrict_profit:     false,
    also_individual_practitioner: false,
    impact_sectors:               [],
    niche_tags:                   [],
    has_asset_lock:               null,
    years_trading:                null,
    annual_income_band:           null,
    primary_location:             null,
    areas_of_work:                [],
    beneficiaries:                [],
    beneficiary_groups:           [],
    themes:                       [],
    mission:                      null,
    min_grant_target:             null,
    max_grant_target:             null,
    funder_type_preferences:      [],
    funding_type_preferences:     [],
    funding_subtype_preferences:  [],
    people_per_year:              null,
    volunteers:                   null,
    years_operating:              null,
    projects_running:             null,
    key_outcomes:                 [],
    geographic_reach:             null,
    website_url:                  null,
  }

  const { error: updateError } = await supabase
    .from('organisations')
    .update(reset)
    .eq('id', orgId)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // Also clear pipeline + interactions + saved-grants for a true empty preview.
  // These are scoped to the admin's org_id so other users are unaffected.
  await supabase.from('pipeline_items').delete().eq('org_id', orgId)
  await supabase.from('grant_interactions').delete().eq('org_id', orgId)

  return NextResponse.json({ ok: true, orgId })
}
