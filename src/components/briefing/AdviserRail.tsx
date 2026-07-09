'use client'

// The adviser rail (amendment §3) — the briefing's docked adviser surface on
// wide screens. One lime-bordered sticky card: header (bulb + "Your adviser"),
// My read, the ask input + contextual chips, the scaffolds line. Typing opens
// the thread IN the rail: it is the drawer's docked chrome, backed by the SAME
// server thread (agent_threads), so the rail and the narrow overlay drawer are
// one conversation with one persistence. Below ~1100px the rail is not rendered
// (BriefingView falls back to the v3 stacked ask bar + overlay drawer).

import React, { useEffect, useRef, useState } from 'react'
import { useAgentChat, TOOL_LABELS } from './useAgentChat'
import { COMPANION_OPEN_EVENT } from './CompanionOpenLink'
import Markdown from './Markdown'
import { grotesk, COLOR, CompanionMark, SectionLabel } from './ui'
import { ADVISER_BOUNDARY } from '@/lib/agent/copy'

export default function AdviserRail({ myRead, suggestions = [], examplePrompt }: { myRead: string | null; suggestions?: string[]; examplePrompt: string }) {
  const [input, setInput] = useState('')
  const { messages, loaded, busy, loadThread, send } = useAgentChat()
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const loadedOnce = useRef(false)
  const active = messages.length > 0

  function ensureLoaded() { if (!loadedOnce.current) { loadedOnce.current = true; loadThread() } }

  // Actions elsewhere on the page (move buttons, "let it go") route in via the
  // open event: on the briefing the rail is the entrance, so we prefill + focus
  // here instead of opening a second surface.
  useEffect(() => {
    const onOpen = (e: Event) => {
      ensureLoaded()
      const p = (e as CustomEvent).detail?.prompt
      if (p) setInput(String(p))
      setTimeout(() => inputRef.current?.focus(), 50)
    }
    window.addEventListener(COMPANION_OPEN_EVENT, onOpen)
    return () => window.removeEventListener(COMPANION_OPEN_EVENT, onOpen)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }) }, [messages])

  function submit() {
    const text = input.trim()
    if (!text) return
    ensureLoaded()
    setInput('')
    void send(text)
  }
  function prefill(s: string) { ensureLoaded(); setInput(s); setTimeout(() => inputRef.current?.focus(), 20) }

  return (
    <div className="rounded-xl bg-white flex flex-col overflow-hidden" style={{ border: `2px solid ${COLOR.lime}`, maxHeight: 'calc(100vh - 3rem)' }}>
      <div className="p-4 flex items-center gap-2" style={{ borderBottom: active ? `1px solid ${COLOR.hair}` : 'none' }}>
        <CompanionMark size={28} />
        <div className="text-sm font-bold" style={{ ...grotesk, color: COLOR.ink }}>Your adviser</div>
      </div>

      {active ? (
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {!loaded && <div className="text-xs" style={{ color: COLOR.faint }}>Loading your conversation…</div>}
          {messages.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
              <div
                className={`max-w-[90%] rounded-xl px-3 py-2 text-[13px] leading-relaxed ${m.role === 'user' ? 'whitespace-pre-wrap' : ''}`}
                style={m.role === 'user' ? { background: COLOR.cream, color: COLOR.ink } : { background: '#fff', border: `1px solid ${COLOR.hair}`, color: COLOR.ink }}
              >
                {m.tool_names.length > 0 && (
                  <div className="text-[11px] mb-1" style={{ color: COLOR.faint }}>{m.tool_names.map(t => TOOL_LABELS[t] ?? t).join(' · ')}</div>
                )}
                {m.role === 'assistant' && m.text
                  ? <Markdown>{m.text}</Markdown>
                  : (m.text || (m.role === 'assistant' && busy && i === messages.length - 1 ? '…' : ''))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        myRead && (
          <div className="px-4 pb-3">
            <SectionLabel>My read</SectionLabel>
            <p className="mt-2 text-[14px] leading-relaxed" style={{ color: COLOR.ink }}>{myRead}</p>
          </div>
        )
      )}

      <div className="p-3" style={{ borderTop: `1px solid ${COLOR.hair}` }}>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onFocus={ensureLoaded}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
            placeholder="Ask your adviser…"
            className="flex-1 text-sm px-3 py-2 rounded-lg outline-none"
            style={{ border: `1px solid ${COLOR.hair}`, color: COLOR.ink }}
            disabled={busy}
          />
          <button onClick={submit} disabled={busy || !input.trim()} className="text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50 shrink-0" style={{ ...grotesk, background: COLOR.forest, color: COLOR.pale }}>
            {busy ? '…' : 'Ask'}
          </button>
        </div>
        {!active && (
          <>
            <div className="flex flex-wrap gap-2 mt-2">
              {suggestions.slice(0, 3).map(s => (
                <button key={s} onClick={() => prefill(s)} className="text-[12px] px-2.5 py-1 rounded-full text-left" style={{ background: COLOR.pale, color: COLOR.sage, border: '1px solid #DCE8C8' }}>{s}</button>
              ))}
            </div>
            <div className="text-[11px] mt-2" style={{ color: COLOR.faint }}>{ADVISER_BOUNDARY}</div>
          </>
        )}
      </div>
    </div>
  )
}
