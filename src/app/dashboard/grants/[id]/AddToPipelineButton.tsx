'use client'

import { useState } from 'react'
import { track } from '@/lib/analytics'
import { createClient } from '@/lib/supabase/client'
import { createPipelineItem } from '@/lib/pipeline'
import { describePipelineWriteError } from '@/lib/pipeline-errors'
import { getOrganisationByOwner } from '@/lib/organisations'
import { emitClientEvent } from '@/lib/events/client'
import type { FunderType } from '@/types'

interface Props {
  grant: {
    external_id: string
    title: string
    funder: string
    funder_type: string | null
    amount_min: number | null
    amount_max: number | null
    deadline: string | null
    is_rolling: boolean
    apply_url: string | null
  }
  /** Catalogue UUID (scraped_grants.id) — carried for capture events. */
  opportunityUuid?: string | null
}

const VALID_FUNDER_TYPES: FunderType[] = [
  'trust_foundation', 'community_foundation', 'corporate_foundation',
  'capacity_builder',
  'local_authority', 'housing_association',
  'corporate', 'lottery', 'government',
  'competition', 'loan', 'crowdfund_match', 'other',
]

export default function AddToPipelineButton({ grant, opportunityUuid }: Props) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error' | 'noorg'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function handleClick() {
    setState('loading')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setState('noorg'); return }

      const org = await getOrganisationByOwner(user.id)
      if (!org) { setState('noorg'); return }

      const rawType = grant.funder_type ?? 'other'
      const funderType: FunderType = VALID_FUNDER_TYPES.includes(rawType as FunderType)
        ? (rawType as FunderType) : 'other'

      const added = await createPipelineItem({
        org_id:               org.id,
        grant_name:           grant.title,
        funder_name:          grant.funder,
        funder_type:          funderType,
        amount_min:           grant.amount_min,
        amount_max:           grant.amount_max,
        amount_requested:     grant.amount_max,
        deadline:             grant.is_rolling ? null : grant.deadline,
        stage:                'identified',
        notes:                null,
        application_progress: 0,
        is_urgent:            false,
        contact_name:         null,
        contact_email:        null,
        grant_url:            grant.apply_url ?? null,
        outcome_date:         null,
        outcome_notes:        null,
        created_by:           user.id,
      })
      track('pipeline_added')
      emitClientEvent(org.id, 'pipeline_added', {
        opportunity_id: opportunityUuid ?? null,
        pipeline_item_id: added.id,
      })
      setState('done')
    } catch (e) {
      setErrorMsg(describePipelineWriteError(e, 'grantDetailAddToPipeline'))
      setState('error')
    }
  }

  if (state === 'done') {
    return (
      <a href="/dashboard/pipeline" className="btn-gold">
        ✓ Added — View pipeline →
      </a>
    )
  }
  if (state === 'noorg') {
    return (
      <a href="/dashboard/profile" className="btn-gold">
        Set up profile to track →
      </a>
    )
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={state === 'loading'}
        className="btn-gold disabled:opacity-60"
      >
        {state === 'loading' ? 'Adding…' : state === 'error' ? 'Try again' : '+ Add to Pipeline'}
      </button>
      {/* Say why. The old version offered a Retry that could never succeed,
          because the usual cause is an entitlement rejection, not a blip. */}
      {state === 'error' && errorMsg && (
        <p
          role="alert"
          className="mt-2 text-xs rounded-lg px-3 py-2"
          style={{ background: '#FAECE7', color: '#993C1D', border: '0.5px solid rgba(153,60,29,0.25)' }}
        >
          {errorMsg}
        </p>
      )}
    </div>
  )
}
