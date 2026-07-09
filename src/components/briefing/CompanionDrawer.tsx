'use client'

// The Companion thread drawer (redesign §2, v3). The ask bar was split out to
// CompanionAskBar so the page can place it in flow; this component is now the
// drawer overlay alone, opened via COMPANION_OPEN_EVENT (from the ask bar,
// suggestion chips, next-move actions, or the plan page's "Adjust your goal").
// Chat mechanics live in useAgentChat.

import React, { useEffect, useRef, useState } from 'react'
import { useAgentChat, TOOL_LABELS } from './useAgentChat'
import { COMPANION_OPEN_EVENT } from './CompanionOpenLink'
import Markdown from './Markdown'
import { grotesk, CompanionMark } from './ui'

export default function CompanionDrawer({ examplePrompt }: { examplePrompt: string }) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const { messages, loaded, busy, loadThread, send } = useAgentChat()
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const loadedOnce = useRef(false)

  useEffect(() => {
    if (open && !loadedOnce.current) { loadedOnce.current = true; loadThread() }
  }, [open, loadThread])

  // Open from elsewhere on the page, optionally prefilling a prompt (suggestion
  // chips, next-move action buttons, the plan page's "Adjust your goal").
  useEffect(() => {
    const onOpen = (e: Event) => {
      setOpen(true)
      const p = (e as CustomEvent).detail?.prompt
      if (p) { setInput(String(p)); setTimeout(() => inputRef.current?.focus(), 50) }
    }
    window.addEventListener(COMPANION_OPEN_EVENT, onOpen)
    return () => window.removeEventListener(COMPANION_OPEN_EVENT, onOpen)
  }, [])

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
      {/* the drawer — opened via COMPANION_OPEN_EVENT (CompanionAskBar, chips,
          next-move actions). The ask bar itself lives in CompanionAskBar. */}
      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-label="Your Companion">
          <div className="absolute inset-0" style={{ background: 'rgba(44,44,42,0.25)' }} onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl flex flex-col">
            <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid #E9E6DD' }}>
              <div className="flex items-center gap-2">
                <CompanionMark size={30} />
                <div>
                  <div className="text-sm font-bold" style={{ ...grotesk, color: '#2C2C2A' }}>Your Companion</div>
                  <div className="text-[11px]" style={{ color: '#8A8986' }}>Scaffolds and strategy only. It never writes applications.</div>
                </div>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close" className="text-xl leading-none px-2" style={{ color: '#5F5E5A' }}>×</button>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {!loaded && <div className="text-xs" style={{ color: '#8A8986' }}>Loading your conversation…</div>}
              {loaded && messages.length === 0 && (
                <div className="text-sm rounded-xl p-3" style={{ background: '#F1F7E4', color: '#3B6D11' }}>
                  Ask about your plan, your candidates, or what to do next. For example “{examplePrompt}”.
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                  <div
                    className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${m.role === 'user' ? 'whitespace-pre-wrap' : ''}`}
                    style={m.role === 'user'
                      ? { background: '#F5F1E8', color: '#2C2C2A' }
                      : { background: '#fff', border: '1px solid #E9E6DD', color: '#2C2C2A' }}
                  >
                    {m.tool_names.length > 0 && (
                      <div className="text-[11px] mb-1" style={{ color: '#8A8986' }}>
                        {m.tool_names.map(t => TOOL_LABELS[t] ?? t).join(' · ')}
                      </div>
                    )}
                    {m.role === 'assistant' && m.text
                      ? <Markdown>{m.text}</Markdown>
                      : (m.text || (m.role === 'assistant' && busy && i === messages.length - 1 ? '…' : ''))}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-3 flex gap-2" style={{ borderTop: '1px solid #E9E6DD' }}>
              <input
                ref={inputRef}
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
