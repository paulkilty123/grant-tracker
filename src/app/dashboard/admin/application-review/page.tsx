import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ReviewSpikeForm from './ReviewSpikeForm'
import type { OrgContext, PipelineGrantOption } from './types'

// Application-review spike — application-builder Phase 0 (review-only standalone).
// Admin-only. Access is gated to this allowlist; cohort-member emails are added
// here for the weeks 3-4 validation round, no rebuild needed.
const REVIEW_SPIKE_ALLOWLIST = [
  'paulkilty1@gmail.com',
]

export default async function ApplicationReviewPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  if (!user.email || !REVIEW_SPIKE_ALLOWLIST.includes(user.email)) {
    redirect('/dashboard')
  }

  // Load the tester's organisation (oldest first, in case they own several).
  const { data: org } = await supabase
    .from('organisations')
    .select('id, name, mission, impact_sectors, beneficiary_groups, primary_location, legal_structure, evidence_notes')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  const orgContext: OrgContext | null = org
    ? {
        id:                org.id,
        name:              org.name ?? '',
        mission:           org.mission ?? null,
        impactSectors:     Array.isArray(org.impact_sectors) ? org.impact_sectors : [],
        beneficiaryGroups: Array.isArray(org.beneficiary_groups) ? org.beneficiary_groups : [],
        primaryLocation:   org.primary_location ?? null,
        legalStructure:    org.legal_structure ?? null,
        evidenceNotes:     org.evidence_notes ?? '',
      }
    : null

  // Load the org's pipeline grants for the picker.
  let pipelineGrants: PipelineGrantOption[] = []
  if (orgContext) {
    const { data: rows } = await supabase
      .from('pipeline_items')
      .select('id, grant_name, funder_name, grant_url, stage')
      .eq('org_id', orgContext.id)
      .order('created_at', { ascending: false })
    pipelineGrants = (rows ?? []).map(r => ({
      id:         r.id,
      grantName:  r.grant_name ?? '',
      funderName: r.funder_name ?? '',
      grantUrl:   r.grant_url ?? null,
      stage:      r.stage ?? '',
    }))
  }

  return <ReviewSpikeForm org={orgContext} pipelineGrants={pipelineGrants} />
}
