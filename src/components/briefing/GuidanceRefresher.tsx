'use client'

// Keeps the authored guidance warm without ever blocking a render (redesign §5
// latency fix). The server renders instantly with the deterministic layer when
// guidance is stale; this fires the out-of-band regeneration and, once it lands,
// soft-refreshes the route so the authored layer arrives in place. No spinner,
// no blocked navigation — the page is useful immediately and upgrades ~10s later.

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function GuidanceRefresher({ stale }: { stale: boolean }) {
  const router = useRouter()

  useEffect(() => {
    if (!stale) return // fires whenever the plan state has no cached guidance yet
    let cancelled = false
    // Deliberately NOT aborted on unmount: if the user navigates away mid-refresh
    // the server should still finish generating and warm the cache for next time.
    // We only guard the soft-refresh against a stale closure.
    fetch('/api/agent/guidance/refresh', { method: 'POST' })
      .then(r => (r.ok ? r.json() : null))
      // On success, soft-refresh so get_briefing re-reads the now-warm cache and
      // the authored layer replaces the deterministic one in place. On no-op
      // (budget, lint, disabled) `stale` stays true but the effect will not
      // re-run until a new render changes it, so there is no polling loop.
      .then(d => { if (!cancelled && d?.refreshed) router.refresh() })
      .catch(() => { /* stale guidance just stays deterministic; never surface an error */ })
    return () => { cancelled = true }
  }, [stale, router])

  return null
}
