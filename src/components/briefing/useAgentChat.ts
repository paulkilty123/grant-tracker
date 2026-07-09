'use client'

// Shared Companion chat state — one SSE/thread implementation for the briefing
// drawer and the setup experience, so the two surfaces can't drift.

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'

export interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  tool_names: string[]
}

// Tools that change the plan state, so the briefing/plan behind the drawer is
// now out of date. After such a turn we soft-refresh the route, which lets
// GuidanceRefresher regenerate the authored layer out of band (latency fix).
const PLAN_CHANGING_TOOLS = new Set(['set_funding_goal', 'update_goal_purposes', 'add_to_pipeline', 'update_pipeline_item'])

export function useAgentChat(opts?: {
  turnKind?: 'chat' | 'strategist'
  /** Whitelisted tool results streamed by the loop (recommend_mix,
   *  set_funding_goal, get_plan_state, get_briefing) — the setup panel's
   *  render source. */
  onToolData?: (name: string, data: unknown) => void
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const onToolData = opts?.onToolData
  const turnKind = opts?.turnKind ?? 'chat'
  const router = useRouter()

  const loadThread = useCallback(() => {
    fetch('/api/agent/thread')
      .then(r => r.json())
      .then(d => {
        setMessages((d?.messages ?? []).map((m: { role: 'user' | 'assistant'; text: string; tool_names: string[] }) =>
          ({ role: m.role, text: m.text, tool_names: m.tool_names ?? [] })))
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  const send = useCallback(async (userTurn: string) => {
    const text = userTurn.trim()
    if (!text || busy) return
    setBusy(true)
    setMessages(prev => [...prev, { role: 'user', text, tool_names: [] }, { role: 'assistant', text: '', tool_names: [] }])
    let planChanged = false
    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_turn: text, turn_kind: turnKind }),
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
          let ev: { type: string; text?: string; name?: string; message?: string; data?: unknown }
          try { ev = JSON.parse(line.slice(6)) } catch { continue }
          if (ev.type === 'tool_done' && ev.name && ev.data !== undefined && onToolData) {
            onToolData(ev.name, ev.data)
          }
          if ((ev.type === 'tool_start' || ev.type === 'tool_done') && ev.name && PLAN_CHANGING_TOOLS.has(ev.name)) {
            planChanged = true
          }
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
      // A plan-changing turn makes the briefing/plan behind the drawer stale;
      // soft-refresh so the server re-reads and GuidanceRefresher regenerates.
      if (planChanged) router.refresh()
    }
  }, [busy, turnKind, onToolData, router])

  return { messages, loaded, busy, loadThread, send }
}

export const TOOL_LABELS: Record<string, string> = {
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
