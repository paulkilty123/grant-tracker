'use client'

// The everywhere-launcher (amendment §4/§5) — a floating adviser entrance on all
// app pages EXCEPT the briefing (there the rail is the entrance; never two
// entrances on one screen). Adviser-tier only (the layout passes `enabled`).
// Clicking opens the existing thread as the drawer, with a light page-context
// prefill where the route names an entity. An optional, restrained context peek
// sits above it on opportunity detail pages only.
//
// Restraint (the spec): the peek appears only on meaningful context, at most
// once per page-type per session, is dismissible, and a dismissal suppresses all
// peeks for the rest of the session. No peek on list/browse pages.

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Lightbulb } from 'lucide-react'
import { COLOR, grotesk } from './ui'
import { openCompanion } from './CompanionOpenLink'
import CompanionDrawer from './CompanionDrawer'

// Which entity, if any, the current route is showing. Deterministic, from the
// path + query only. 'opportunity' is the one detail context that earns a peek.
function pageContext(pathname: string, search: string): { type: 'opportunity' | null; prompt: string; example: string } {
  const params = new URLSearchParams(search)
  const isOpportunity = /^\/grants\//.test(pathname) || (pathname === '/dashboard/search' && params.has('grant'))
  if (isOpportunity) {
    return { type: 'opportunity', prompt: 'How does this opportunity fit my plan?', example: 'How does this opportunity fit my plan?' }
  }
  return { type: null, prompt: '', example: 'What should I focus on this week?' }
}

export default function AdviserLauncher({ enabled }: { enabled: boolean }) {
  const pathname = usePathname()
  const [search, setSearch] = useState('')
  const [peek, setPeek] = useState(false)
  const seededFor = useRef<string | null>(null)

  // Read the query client-side (avoids the useSearchParams Suspense requirement).
  useEffect(() => { setSearch(typeof window !== 'undefined' ? window.location.search : '') }, [pathname])

  const onBriefing = pathname === '/dashboard/briefing'
  const ctx = pageContext(pathname, search)

  // Peek restraint: once per page-type per session, killed for the session by any
  // dismissal. Keyed by page-type so it never nags on the same kind of page twice.
  useEffect(() => {
    if (!enabled || onBriefing || ctx.type == null) { setPeek(false); return }
    if (seededFor.current === ctx.type) return
    seededFor.current = ctx.type
    try {
      if (sessionStorage.getItem('gt_peek_dismissed') === '1') return
      if (sessionStorage.getItem(`gt_peek_seen_${ctx.type}`) === '1') return
      sessionStorage.setItem(`gt_peek_seen_${ctx.type}`, '1')
      setPeek(true)
    } catch { /* private mode / no storage → simply no peek */ }
  }, [enabled, onBriefing, ctx.type])

  function dismissPeek() {
    setPeek(false)
    try { sessionStorage.setItem('gt_peek_dismissed', '1') } catch { /* ignore */ }
  }

  if (!enabled || onBriefing) return null

  return (
    <>
      <div className="fixed z-40 flex flex-col items-end gap-2" style={{ right: 20, bottom: 20 }}>
        {peek && (
          <div className="rounded-xl bg-white shadow-lg flex items-start gap-2 px-3 py-2 max-w-[280px]" style={{ border: `1px solid ${COLOR.hair}` }}>
            <button onClick={() => { openCompanion(ctx.prompt); dismissPeek() }} className="text-left text-[12.5px] leading-snug" style={{ color: COLOR.ink }}>
              Looking at this opportunity? Ask me how it fits your plan.
            </button>
            <button onClick={dismissPeek} aria-label="Dismiss" className="text-[15px] leading-none shrink-0" style={{ color: COLOR.faint }}>×</button>
          </div>
        )}
        <button
          onClick={() => openCompanion(ctx.type ? ctx.prompt : undefined)}
          aria-label="Ask your adviser"
          className="inline-flex items-center justify-center shadow-lg"
          style={{ width: 44, height: 44, borderRadius: 999, background: COLOR.forest, border: `2px solid ${COLOR.lime}`, ...grotesk }}
        >
          <Lightbulb size={20} color={COLOR.lime} strokeWidth={2.2} />
        </button>
      </div>

      {/* the overlay drawer the launcher opens (one thread, shared with the rail) */}
      <CompanionDrawer examplePrompt={ctx.example} />
    </>
  )
}
