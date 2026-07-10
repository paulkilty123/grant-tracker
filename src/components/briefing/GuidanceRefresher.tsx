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
      // Refresh on `settled`, not `refreshed`: a guardrail-blocked attempt
      // still writes a row at this signature, which flips the next read's
      // guidance_stale to false even though no NEW usable guidance landed
      // (readGuidance in plan.ts) — the page needs to re-read that regardless,
      // or a caller showing a loading state for `stale` (BriefingView) never
      // learns the attempt finished and waits forever. True no-ops that wrote
      // nothing (budget/no_moves/error/disabled) leave `settled` false, so
      // `stale` stays true and there is still no polling loop.
      .then(d => { if (!cancelled && d?.settled) router.refresh() })
      .catch(() => { /* stale guidance just stays deterministic; never surface an error */ })
    return () => { cancelled = true }
  }, [stale, router])

  return null
}
