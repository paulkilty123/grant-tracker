'use client'

// The Companion ask bar + thread drawer (design spec §3.1). The thread is a
// dismissible drawer over the right side, never a permanent panel —
// glanceability wins the default state; conversation is one click away.
// Chat mechanics live in useAgentChat (shared with the setup experience).

import React, { useEffect, useRef, useState } from 'react'
import { useAgentChat, TOOL_LABELS } from './useAgentChat'

const grotesk = { fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif' }

export default function CompanionDrawer({ examplePrompt }: { examplePrompt: string }) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const { messages, loaded, busy, loadThread, send } = useAgentChat()
  const scrollRef = useRef<HTMLDivElement>(null)
  const loadedOnce = useRef(false)

  useEffect(() => {
    if (open && !loadedOnce.current) { loadedOnce.current = true; loadThread() }
  }, [open, loadThread])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, open])

  function submit() {
    const text = input.trim()
    if (!text) return
    setInput('')
    void send(text)
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
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
                placeholder="Ask your Companion…"
                className="flex-1 text-sm px-3 py-2 rounded-lg outline-none"
                style={{ border: '1px solid #E9E6DD', color: '#2C2C2A' }}
                disabled={busy}
              />
              <button
                onClick={submit}
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
