'use client'

// The Companion ask bar + thread drawer (design spec §3.1). The thread is a
// dismissible drawer over the right side, never a permanent panel —
// glanceability wins the default state; conversation is one click away.
// History is server-side (agent_threads); this component only renders the
// view and streams new turns over SSE from /api/agent/chat.

import React, { useEffect, useRef, useState } from 'react'

const grotesk = { fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif' }

interface ViewMessage {
  role: 'user' | 'assistant'
  text: string
  tool_names: string[]
}

const TOOL_LABELS: Record<string, string> = {
  get_briefing: 'checked your briefing',
  get_plan_state: 'checked the plan arithmetic',
  get_pipeline: 'checked your pipeline',
  get_funding_goal: 'checked your goal',
  set_funding_goal: 'updated your goal',
  update_goal_purposes: 'updated your purposes',
  update_pipeline_item: 'updated a pipeline item',
  add_to_pipeline: 'added to your pipeline',
  assess_opportunity_against_plan: 'assessed an opportunity',
  recommend_mix: 'derived the recommended mix',
}

export default function CompanionDrawer({ examplePrompt }: { examplePrompt: string }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ViewMessage[]>([])
  const [loaded, setLoaded] = useState(false)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || loaded) return
    fetch('/api/agent/thread')
      .then(r => r.json())
      .then(d => {
        setMessages((d?.messages ?? []).map((m: { role: 'user' | 'assistant'; text: string; tool_names: string[] }) =>
          ({ role: m.role, text: m.text, tool_names: m.tool_names ?? [] })))
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [open, loaded])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, open])

  async function send() {
    const userTurn = input.trim()
    if (!userTurn || busy) return
    setInput('')
    setBusy(true)
    setMessages(prev => [...prev, { role: 'user', text: userTurn, tool_names: [] }, { role: 'assistant', text: '', tool_names: [] }])

    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_turn: userTurn, turn_kind: 'chat' }),
      })
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => null)
        setMessages(prev => {
          const next = [...prev]
          next[next.length - 1] = { role: 'assistant', text: err?.error ?? 'Something went wrong. Please try again.', tool_names: [] }
          return next
        })
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const frames = buffer.split('\n\n')
        buffer = frames.pop() ?? ''
        for (const frame of frames) {
          const line = frame.trim()
          if (!line.startsWith('data: ')) continue
          let ev: { type: string; text?: string; name?: string; message?: string }
          try { ev = JSON.parse(line.slice(6)) } catch { continue }
          setMessages(prev => {
            const next = [...prev]
            const last = { ...next[next.length - 1] }
            if (ev.type === 'text_delta') last.text += ev.text ?? ''
            if (ev.type === 'tool_start' && ev.name) last.tool_names = [...last.tool_names, ev.name]
            if (ev.type === 'error') last.text += (last.text ? '\n\n' : '') + (ev.message ?? 'Something went wrong.')
            next[next.length - 1] = last
            return next
          })
        }
      }
    } catch {
      setMessages(prev => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last?.role === 'assistant' && !last.text) {
          next[next.length - 1] = { ...last, text: 'Connection lost mid-turn. Please try again.' }
        }
        return next
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {/* the ask bar */}
      <button
        onClick={() => setOpen(true)}
        className="w-full max-w-3xl mt-8 bg-white rounded-xl p-4 flex items-center justify-between gap-3 text-left cursor-text"
        style={{ border: '1px solid #E9E6DD' }}
      >
        <span className="text-sm" style={{ color: '#8A8986' }}>Ask your Companion… <span className="hidden sm:inline">e.g. “{examplePrompt}”</span></span>
        <span className="text-[11px] shrink-0" style={{ color: '#8A8986' }}>scaffolds and strategy only</span>
      </button>

      {/* the drawer */}
      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-label="Your Companion">
          <div className="absolute inset-0" style={{ background: 'rgba(44,44,42,0.25)' }} onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl flex flex-col">
            <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid #E9E6DD' }}>
              <div>
                <div className="text-sm font-bold" style={{ ...grotesk, color: '#2C2C2A' }}>Your Companion</div>
                <div className="text-[11px]" style={{ color: '#8A8986' }}>Scaffolds and strategy only — it never writes applications.</div>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close" className="text-xl leading-none px-2" style={{ color: '#5F5E5A' }}>×</button>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {!loaded && <div className="text-xs" style={{ color: '#8A8986' }}>Loading your conversation…</div>}
              {loaded && messages.length === 0 && (
                <div className="text-sm rounded-xl p-3" style={{ background: '#F1F7E4', color: '#3B6D11' }}>
                  Ask about your plan, your candidates, or what to do next — for example “{examplePrompt}”.
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                  <div
                    className="max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed"
                    style={m.role === 'user'
                      ? { background: '#F5F1E8', color: '#2C2C2A' }
                      : { background: '#fff', border: '1px solid #E9E6DD', color: '#2C2C2A' }}
                  >
                    {m.tool_names.length > 0 && (
                      <div className="text-[11px] mb-1" style={{ color: '#8A8986' }}>
                        {m.tool_names.map(t => TOOL_LABELS[t] ?? t).join(' · ')}
                      </div>
                    )}
                    {m.text || (m.role === 'assistant' && busy && i === messages.length - 1 ? '…' : '')}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-3 flex gap-2" style={{ borderTop: '1px solid #E9E6DD' }}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
                placeholder="Ask your Companion…"
                className="flex-1 text-sm px-3 py-2 rounded-lg outline-none"
                style={{ border: '1px solid #E9E6DD', color: '#2C2C2A' }}
                disabled={busy}
              />
              <button
                onClick={() => void send()}
                disabled={busy || !input.trim()}
                className="text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
                style={{ ...grotesk, background: '#173404', color: '#F1F7E4' }}
              >
                {busy ? '…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
