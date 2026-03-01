'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getOrganisationByOwner } from '@/lib/organisations'

export default function FlagGrantButton({ grantId }: { grantId: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle')

  async function handleFlag() {
    setState('loading')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setState('idle'); return }
      const org = await getOrganisationByOwner(user.id)
      if (!org) { setState('idle'); return }

      await fetch('/api/flag-grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grantId, orgId: org.id }),
      })
      setState('done')
    } catch {
      setState('idle')
    }
  }

  if (state === 'done') {
    return (
      <span className="text-xs text-amber-600 font-medium">
        ⚑ Flagged for review — thank you
      </span>
    )
  }

  return (
    <button
      onClick={handleFlag}
      disabled={state === 'loading'}
      className="text-xs text-light hover:text-amber-500 transition-colors disabled:opacity-50"
    >
      {state === 'loading' ? 'Flagging…' : '⚑ Flag as closed or inaccurate'}
    </button>
  )
}
