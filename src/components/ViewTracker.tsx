'use client'

// Capture-layer view tracker. Rendered by server components (e.g. the grant
// detail page) to emit opportunity_viewed on mount without adding any server
// render latency. The /api/events route resolves the session user's org, so
// no org id needs to cross the RSC boundary. Renders nothing.

import { useEffect, useRef } from 'react'
import { emitClientEvent } from '@/lib/events/client'

export default function ViewTracker({
  opportunityId,
  source,
}: {
  opportunityId: string
  source: string
}) {
  const fired = useRef(false)
  useEffect(() => {
    if (fired.current) return
    fired.current = true
    emitClientEvent(null, 'opportunity_viewed', { opportunity_id: opportunityId, source })
  }, [opportunityId, source])
  return null
}
