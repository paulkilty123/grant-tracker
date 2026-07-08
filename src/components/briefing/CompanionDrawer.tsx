'use client'

// The Companion ask bar + thread drawer (redesign §2). The ask bar is one of the
// page's two permitted lime accents: lime-bordered, an avatar, a prominent Ask
// button, and context suggestion chips (one always teaches the outcome loop,
// e.g. "We just won a grant"). Chips and next-move actions open the drawer with
// a prefilled prompt (never auto-sent). Chat mechanics live in useAgentChat.

import React, { useEffect, useRef, useState } from 'react'
import { useAgentChat, TOOL_LABELS } from './useAgentChat'
import { COMPANION_OPEN_EVENT } from './CompanionOpenLink'
import Markdown from './Markdown'

const grotesk = { fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif' }

function Avatar() {
  return (
    <span className="inline-flex items-center justify-center shrink-0" style={{ width: 30, height: 30, borderRadius: 999, background: '#8ECB3C', color: '#173404' }}>
      <span style={{ ...grotesk, fontSize: 15, fontWeight: 600, lineHeight: 1 }}>✦</span>
    </span>
  )
}

export default function CompanionDrawer({ examplePrompt, suggestions = [] }: { examplePrompt: string; suggestions?: string[] }) {
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
  function openWith(prompt?: string) {
    setOpen(true)
    if (prompt) { setInput(prompt); setTimeout(() => inputRef.current?.focus(), 50) }
  }

  return (
    <>
      {/* the ask bar — one of the two lime accents on the page */}
      <div className="w-full max-w-3xl mt-8">
        <div className="bg-white rounded-xl p-3 flex items-center gap-3" style={{ border: `2px solid #8ECB3C` }}>
          <Avatar />
          <button onClick={() => openWith()} className="flex-1 text-left text-sm cursor-text" style={{ color: '#8A8986' }}>
            Ask your Companion<span className="hidden sm:inline"> — e.g. “{examplePrompt}”</span>
          </button>
          <button
            onClick={() => openWith()}
            className="text-sm font-semibold px-4 py-2 rounded-lg shrink-0"
            style={{ ...grotesk, background: '#8ECB3C', color: '#173404' }}
          >
            Ask
          </button>
        </div>
        <div className="flex items-center gap-2 flex-wrap mt-2">
          {suggestions.slice(0, 3).map(s => (
            <button
              key={s}
              onClick={() => openWith(s)}
              className="text-[12px] px-2.5 py-1 rounded-full"
              style={{ background: '#F1F7E4', color: '#3B6D11', border: '1px solid #DCE8C8' }}
            >
              {s}
            </button>
          ))}
          <span className="text-[11px] ml-auto" style={{ color: '#8A8986' }}>scaffolds and strategy only</span>
        </div>
      </div>

      {/* the drawer */}
      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-label="Your Companion">
          <div className="absolute inset-0" style={{ background: 'rgba(44,44,42,0.25)' }} onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl flex flex-col">
            <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid #E9E6DD' }}>
              <div className="flex items-center gap-2">
                <Avatar />
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
