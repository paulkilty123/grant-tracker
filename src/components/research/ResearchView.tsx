'use client'

// Research section — 11 July mockup, built to the pasted layout description.
// Page structure: thread tab row, then a two-column grid (conversation
// ~1.5fr, pinned panel ~1fr, sticky). Below the lg breakpoint the pinned
// panel collapses to a toggle/accordion above the input.

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useAgentChat } from '@/components/briefing/useAgentChat'
import Markdown from '@/components/briefing/Markdown'
import { COLOR, grotesk, CompanionMark } from '@/components/briefing/ui'
import { createPipelineItem } from '@/lib/pipeline'
import { recordInteraction } from '@/lib/interactions'
import { getPins, createPin, type Pin } from '@/lib/agent/pins'
import ThreadTabs from './ThreadTabs'
import PinnedPanel from './PinnedPanel'
import NewThreadModal from './NewThreadModal'
import OpportunityCard from './OpportunityCard'
import { cardsFromToolPayloads, type OpportunityCardData } from './cards'
import type { ResearchThreadSummary } from './types'
import type { Brief } from './brief-types'

export default function ResearchView({
  orgId,
  userId,
  initialThreads,
}: {
  orgId: string
  userId: string | null
  initialThreads: ResearchThreadSummary[]
}) {
  const [threads, setThreads] = useState<ResearchThreadSummary[]>(initialThreads)
  const [activeId, setActiveIdRaw] = useState<string | null>(initialThreads[0]?.id ?? null)
  const [showNewThread, setShowNewThread] = useState(false)
  const [pins, setPins] = useState<Pin[]>([])
  const [pinnedOpen, setPinnedOpen] = useState(false)
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Which thread was open persists across navigation (localStorage, per org —
  // matches the gt_active_org_id cookie's job for the org switcher, just
  // client-side since this is convenience state, not an auth boundary).
  // initialThreads (the server-rendered prop) is a snapshot from whenever
  // this route was last rendered; on a soft navigation back to /dashboard/
  // research, Next's router cache can serve that snapshot from BEFORE a
  // thread or its latest messages existed, which read as "the thread was
  // lost" even though nothing was ever deleted. The mount effect below
  // re-fetches the thread list fresh from the API — never trusts the prop
  // alone — and restores the remembered thread once it's confirmed to still
  // exist in that fresh list.
  const storageKey = `gt_research_active_thread_${orgId}`
  const setActiveId = useCallback((id: string | null) => {
    setActiveIdRaw(id)
    try {
      if (id) localStorage.setItem(storageKey, id)
      else localStorage.removeItem(storageKey)
    } catch { /* localStorage unavailable (private browsing etc.) — in-memory only */ }
  }, [storageKey])

  useEffect(() => {
    fetch('/api/agent/research/threads')
      .then(r => r.json())
      .then((d: { threads?: ResearchThreadSummary[] }) => {
        const fresh = d.threads ?? []
        if (!fresh.length) return // nothing to reconcile against — keep whatever initialThreads/activeId already have
        setThreads(fresh)
        let remembered: string | null = null
        try { remembered = localStorage.getItem(storageKey) } catch { /* ignore */ }
        const stillExists = remembered && fresh.some(t => t.id === remembered)
        setActiveIdRaw(stillExists ? remembered : fresh[0].id)
      })
      .catch(() => { /* keep the server-rendered snapshot on a fetch failure */ })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { messages, loaded, busy, loadThread, send } = useAgentChat({ threadId: activeId ?? undefined })

  const refreshPins = useCallback(() => {
    if (!activeId) { setPins([]); return }
    getPins(activeId).then(setPins).catch(() => setPins([]))
  }, [activeId])

  useEffect(() => {
    if (!activeId) return
    loadThread()
    refreshPins()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  async function handleCreateThread(focusLabel: string) {
    setShowNewThread(false)
    const res = await fetch('/api/agent/research/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ focus_label: focusLabel || undefined }),
    })
    const d = await res.json().catch(() => null)
    if (!d?.thread_id) return
    const fresh: ResearchThreadSummary = { id: d.thread_id, focusLabel: focusLabel || null, focusPurposeId: null, updatedAt: new Date().toISOString() }
    setThreads(prev => [fresh, ...prev])
    setActiveId(fresh.id)
  }

  function submit() {
    const text = input.trim()
    if (!text || !activeId) return
    setInput('')
    void send(text)
  }

  async function handleAddToPipeline(data: Extract<OpportunityCardData, { variant: 'catalogue' }>) {
    await createPipelineItem({
      org_id: orgId,
      created_by: userId ?? '', // this page is companion-tier-gated (always authenticated); PipelineItem types created_by as non-null string despite the DB column being nullable
      grant_name: data.title,
      funder_name: data.funder,
      funder_type: 'trust_foundation',
      amount_requested: data.amount_max ?? data.amount_min ?? null,
      amount_min: data.amount_min,
      amount_max: data.amount_max,
      deadline: data.deadline,
      grant_url: null,
      stage: 'identified',
      notes: 'Added from a research thread.',
      application_progress: null,
      is_urgent: false,
      contact_name: null,
      contact_email: null,
      outcome_date: null,
      outcome_notes: null,
    })
  }

  async function handleSaveForLater(data: OpportunityCardData) {
    if (data.variant === 'catalogue') {
      await recordInteraction(orgId, data.opportunity_id, 'saved')
    } else {
      // No catalogue row exists yet for a researched-live find — "save for
      // later" and "pin" both land in the thread's research log until the
      // enrichment staging flow (step 5) gives it a real catalogue home.
      await handlePin(data)
    }
  }

  async function handlePin(data: OpportunityCardData) {
    if (!activeId) return
    const pin = data.variant === 'catalogue'
      ? { title: data.title, body: data.funder, source_kind: 'catalogue' as const, opportunity_ref: data.opportunity_id }
      : { title: data.funder_name, body: data.summary.slice(0, 200), source_kind: 'researched' as const, opportunity_ref: data.funder_key }
    await createPin(orgId, activeId, pin)
    refreshPins()
  }

  function handleResearchDeeper(data: OpportunityCardData) {
    const name = data.variant === 'catalogue' ? data.title : data.funder_name
    void send(`Research ${name} further — go deeper on eligibility, deadlines, and how to approach.`)
  }

  async function handleWriteBrief(data: OpportunityCardData): Promise<Brief> {
    if (!activeId) throw new Error('No active thread')
    const res = await fetch('/api/agent/research/brief', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ thread_id: activeId, opportunity: data }),
    })
    const d = await res.json().catch(() => null)
    if (!res.ok || !d?.brief) throw new Error(d?.error ?? 'Funder profile generation failed.')
    return d.brief as Brief
  }

  async function handlePinBrief(brief: Brief, opportunity: OpportunityCardData) {
    if (!activeId) return
    const opportunityRef = opportunity.variant === 'catalogue' ? opportunity.opportunity_id : opportunity.funder_key
    await createPin(orgId, activeId, {
      title: brief.title,
      body: brief.sections.what_they_fund[0]?.text ?? null,
      source_kind: opportunity.variant === 'catalogue' ? 'catalogue' : 'researched',
      opportunity_ref: opportunityRef,
    })
    refreshPins()
  }

  const cardActions = { onAddToPipeline: handleAddToPipeline, onSaveForLater: handleSaveForLater, onPin: handlePin, onResearchDeeper: handleResearchDeeper, onWriteBrief: handleWriteBrief, onPinBrief: handlePinBrief }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 md:px-6">
      <ThreadTabs threads={threads} activeId={activeId} onSelect={setActiveId} onNewThread={() => setShowNewThread(true)} />

      {!activeId ? (
        <div className="flex flex-col items-center justify-center text-center py-16">
          <CompanionMark size={40} />
          <p className="mt-4" style={{ ...grotesk, fontSize: 15, fontWeight: 600, color: COLOR.ink }}>Start your first research thread</p>
          <p className="mt-1 max-w-sm" style={{ fontSize: 13, color: COLOR.mid }}>
            Ask about funding for a purpose, a campaign, or an ad hoc question — your adviser researches live and keeps the catalogue and researched facts clearly apart.
          </p>
          <button
            onClick={() => setShowNewThread(true)}
            className="mt-4"
            style={{ ...grotesk, fontSize: 13, fontWeight: 600, padding: '9px 18px', borderRadius: 10, cursor: 'pointer', border: 'none', background: COLOR.forest, color: COLOR.pale }}
          >
            + New thread
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-5 items-start">
          {/* Conversation column */}
          <div className="flex flex-col" style={{ minHeight: 420 }}>
            <div ref={scrollRef} className="flex-1 overflow-y-auto pr-1" style={{ maxHeight: 560 }}>
              {!loaded && <div className="text-xs py-6" style={{ color: COLOR.faint }}>Loading this thread…</div>}
              {loaded && messages.length === 0 && (
                <div className="text-sm rounded-xl p-3 mb-2" style={{ background: COLOR.pale, color: COLOR.sage }}>
                  Ask, or tell me what to do next — I&apos;ll check the catalogue first and research live when it helps.
                </div>
              )}
              {messages.map((m, i) => {
                const cards = m.role === 'assistant' ? cardsFromToolPayloads(m.cards) : []
                return (
                  <div key={i} className={m.role === 'user' ? 'flex justify-end mb-3' : 'mb-3'}>
                    {m.role === 'user' ? (
                      <div className="max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap" style={{ background: COLOR.cream, color: COLOR.ink }}>
                        {m.text}
                      </div>
                    ) : (
                      <div style={{ fontSize: 13, color: COLOR.ink }}>
                        {m.text ? <Markdown>{m.text}</Markdown> : (busy && i === messages.length - 1 ? <span style={{ color: COLOR.faint }}>…</span> : null)}
                        {cards.map((c, ci) => (
                          <OpportunityCard key={ci} data={c} actions={cardActions} />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Mobile pinned accordion — above the input, per the mockup */}
            <div className="lg:hidden mb-2">
              <button
                onClick={() => setPinnedOpen(v => !v)}
                className="w-full flex items-center justify-between px-3.5 py-2.5"
                style={{ border: `1px solid ${COLOR.hair}`, borderRadius: 10, background: '#fff', ...grotesk, fontSize: 12.5, fontWeight: 600, color: COLOR.ink }}
              >
                <span>📌 Pinned in this thread</span>
                <span style={{ color: COLOR.faint }}>{pinnedOpen ? '−' : `${pins.length} ▾`}</span>
              </button>
              {pinnedOpen && <div className="mt-2"><PinnedPanel pins={pins} /></div>}
            </div>

            {/* Input bar — lime-bordered, per the mockup */}
            <div className="flex items-end gap-2 p-2.5" style={{ border: `1.5px solid ${COLOR.lime}`, borderRadius: 12, background: '#fff' }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
                placeholder="Ask, or tell me what to do next…"
                rows={1}
                className="flex-1 text-sm outline-none resize-none"
                style={{ color: COLOR.ink, fontFamily: 'inherit', background: 'transparent', border: 'none', padding: '6px 8px' }}
                disabled={busy}
              />
              <button
                onClick={submit}
                disabled={busy || !input.trim()}
                className="disabled:opacity-50"
                style={{ ...grotesk, fontSize: 13, fontWeight: 600, padding: '9px 16px', borderRadius: 9, cursor: 'pointer', border: 'none', background: COLOR.forest, color: COLOR.pale }}
              >
                {busy ? '…' : 'Send'}
              </button>
            </div>
          </div>

          {/* Pinned panel — desktop, sticky */}
          <div className="hidden lg:block" style={{ position: 'sticky', top: 20 }}>
            <PinnedPanel pins={pins} />
          </div>
        </div>
      )}

      {showNewThread && <NewThreadModal onClose={() => setShowNewThread(false)} onCreate={handleCreateThread} />}
    </div>
  )
}
