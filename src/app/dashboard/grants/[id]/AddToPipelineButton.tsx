'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createPipelineItem } from '@/lib/pipeline'
import { getOrganisationByOwner } from '@/lib/organisations'
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
}

const VALID_FUNDER_TYPES: FunderType[] = [
  'trust_foundation', 'local_authority', 'housing_association',
  'corporate', 'lottery', 'government', 'other',
]

export default function AddToPipelineButton({ grant }: Props) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error' | 'noorg'>('idle')

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

      await createPipelineItem({
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
      setState('done')
    } catch {
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
    <button
      onClick={handleClick}
      disabled={state === 'loading'}
      className="btn-gold disabled:opacity-60"
    >
      {state === 'loading' ? 'Adding…' : state === 'error' ? 'Retry — Add to Pipeline' : '+ Add to Pipeline'}
    </button>
  )
}
