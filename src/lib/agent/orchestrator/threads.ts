// Thread persistence (design spec §9 step 3) — the server-side conversation
// record the chat route replays from, replacing client-supplied history.
//
// Lives in the orchestrator (not the tool layer): threads are surface
// infrastructure, not an agent capability an external model should call.
// Everything degrades softly — if migration 037 is not applied yet, the route
// falls back to stateless turns rather than erroring.

import type Anthropic from '@anthropic-ai/sdk'
import { serviceClient } from '../tools/db'
import type { TurnUsage } from './loop'
import type { TurnKind } from './config'

/** Replay window: the most recent messages loaded into model context. Long
 *  threads beyond this are simply not replayed (plan/goal state lives in
 *  schema and is re-fetched by tools, so old turns age out gracefully).
 *  Summarising the tail is a logged follow-on. */
export const THREAD_REPLAY_LIMIT = 40

export async function getOrCreateActiveThread(orgId: string): Promise<string | null> {
  try {
    const sb = serviceClient()
    const { data, error } = await sb.from('agent_threads')
      .select('id').eq('org_id', orgId).eq('status', 'active').maybeSingle()
    if (error) return null // table missing → stateless fallback
    if (data) return String((data as Record<string, unknown>).id)
    const { data: created, error: insErr } = await sb.from('agent_threads')
      .insert({ org_id: orgId }).select('id').single()
    if (insErr || !created) return null
    return String((created as Record<string, unknown>).id)
  } catch { return null }
}

// A replayed history must not open mid-tool-exchange: the Anthropic API
// rejects a tool_result with no preceding tool_use. After windowing, drop
// leading messages until the first plain user message.
function sanitiseWindow(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  const isPlainUser = (m: Anthropic.MessageParam) =>
    m.role === 'user' && (typeof m.content === 'string' ||
      (Array.isArray(m.content) && !m.content.some(b => typeof b === 'object' && b !== null && 'type' in b && b.type === 'tool_result')))
  const start = messages.findIndex(isPlainUser)
  return start <= 0 ? (start === 0 ? messages : []) : messages.slice(start)
}

export async function loadThreadHistory(threadId: string): Promise<Anthropic.MessageParam[]> {
  try {
    const { data, error } = await serviceClient()
      .from('agent_messages')
      .select('role, content')
      .eq('thread_id', threadId)
      .order('seq', { ascending: false })
      .limit(THREAD_REPLAY_LIMIT)
    if (error || !data) return []
    const messages = data.reverse().map(r => {
      const row = r as Record<string, unknown>
      return { role: row.role as 'user' | 'assistant', content: row.content as Anthropic.MessageParam['content'] }
    })
    return sanitiseWindow(messages)
  } catch { return [] }
}

/** Persist one turn's new messages (the user turn + everything the loop
 *  appended). Best-effort: a failed write loses persistence for the turn, not
 *  the turn itself. */
export async function appendTurn(
  threadId: string,
  orgId: string,
  newMessages: Anthropic.MessageParam[],
  meta: { turnKind: TurnKind; usage: TurnUsage },
): Promise<void> {
  if (!newMessages.length) return
  try {
    const sb = serviceClient()
    const lastAssistant = [...newMessages].map(m => m.role).lastIndexOf('assistant')
    const rows = newMessages.map((m, i) => ({
      thread_id: threadId,
      org_id: orgId,
      role: m.role,
      content: m.content as unknown,
      turn_kind: i === 0 && m.role === 'user' ? meta.turnKind : null,
      model: m.role === 'assistant' ? meta.usage.model : null,
      usage: i === lastAssistant ? {
        input_tokens: meta.usage.input_tokens,
        output_tokens: meta.usage.output_tokens,
        cost_estimate_microgbp: meta.usage.cost_estimate_microgbp,
        duration_ms: meta.usage.duration_ms,
        tool_names: meta.usage.tool_names,
        loop_iterations: meta.usage.loop_iterations,
      } : null,
    }))
    const { error } = await sb.from('agent_messages').insert(rows)
    if (error) { console.error('[threads] appendTurn insert failed:', error.message); return }
    await sb.from('agent_threads').update({ updated_at: new Date().toISOString() }).eq('id', threadId)
  } catch (e) {
    console.error('[threads] appendTurn threw:', e)
  }
}

/** Seed the scripted setup opener as the thread's first assistant message
 *  (design spec §3.2: the opening message demonstrates the Companion already
 *  knows the organisation). Server-composed from profile fields — not model
 *  output — and written to the thread so the model's replayed history and the
 *  user's view agree on how the conversation began. No-op if the thread
 *  already has messages. */
export async function seedThreadOpener(threadId: string, orgId: string, text: string): Promise<void> {
  try {
    const sb = serviceClient()
    const { count } = await sb.from('agent_messages')
      .select('id', { count: 'exact', head: true }).eq('thread_id', threadId)
    if ((count ?? 0) > 0) return
    await sb.from('agent_messages').insert({
      thread_id: threadId,
      org_id: orgId,
      role: 'assistant',
      content: [{ type: 'text', text }],
      model: 'scripted-opener',
    })
  } catch (e) {
    console.error('[threads] seedThreadOpener failed:', e)
  }
}

/** Render-friendly view for the briefing drawer: text turns with tool names,
 *  tool_result-only messages folded away. */
export interface ThreadViewMessage {
  role: 'user' | 'assistant'
  text: string
  tool_names: string[]
  created_at: string
}

export async function loadThreadView(threadId: string, limit = 100): Promise<ThreadViewMessage[]> {
  try {
    const { data, error } = await serviceClient()
      .from('agent_messages')
      .select('role, content, created_at')
      .eq('thread_id', threadId)
      .order('seq', { ascending: false })
      .limit(limit)
    if (error || !data) return []
    const out: ThreadViewMessage[] = []
    for (const r of data.reverse()) {
      const row = r as Record<string, unknown>
      const content = row.content as Anthropic.MessageParam['content']
      let text = ''
      const toolNames: string[] = []
      if (typeof content === 'string') text = content
      else if (Array.isArray(content)) {
        for (const block of content) {
          if (typeof block !== 'object' || block === null || !('type' in block)) continue
          if (block.type === 'text') text += (text ? '\n\n' : '') + block.text
          if (block.type === 'tool_use') toolNames.push(String((block as { name?: unknown }).name ?? ''))
        }
      }
      if (!text && !toolNames.length) continue // pure tool_result carrier — not a visible turn
      out.push({ role: row.role as 'user' | 'assistant', text, tool_names: toolNames, created_at: String(row.created_at) })
    }
    return out
  } catch { return [] }
}
