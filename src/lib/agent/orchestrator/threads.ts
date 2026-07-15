// Thread persistence (design spec §9 step 3) — the server-side conversation
// record the chat route replays from, replacing client-supplied history.
//
// Lives in the orchestrator (not the tool layer): threads are surface
// infrastructure, not an agent capability an external model should call.
// Everything degrades softly — if migration 037 is not applied yet, the route
// falls back to stateless turns rather than erroring.

import type Anthropic from '@anthropic-ai/sdk'
import { serviceClient } from '../tools/db'
import type { TurnUsage, ComposedNote, ComposedNoteCard } from './loop'
import type { TurnKind } from './config'
import { PANEL_RESULT_SLIMMERS, RESEARCH_CARD_TOOLS } from './panel-slimmers'

/** Replay window: the most recent messages loaded into model context. Long
 *  threads beyond this are simply not replayed (plan/goal state lives in
 *  schema and is re-fetched by tools, so old turns age out gracefully).
 *  Summarising the tail is a logged follow-on. */
export const THREAD_REPLAY_LIMIT = 40

export async function getOrCreateActiveThread(orgId: string): Promise<string | null> {
  try {
    const sb = serviceClient()
    const { data, error } = await sb.from('agent_threads')
      .select('id').eq('org_id', orgId).eq('status', 'active').eq('kind', 'briefing').maybeSingle()
    if (error) return null // table missing → stateless fallback
    if (data) return String((data as Record<string, unknown>).id)
    const { data: created, error: insErr } = await sb.from('agent_threads')
      .insert({ org_id: orgId, kind: 'briefing' }).select('id').single()
    if (insErr || !created) return null
    return String((created as Record<string, unknown>).id)
  } catch { return null }
}

export interface ThreadMeta {
  id: string
  kind: 'briefing' | 'research'
  status: string
  focusLabel: string | null
  focusPurposeId: string | null
}

/** Research agent v1 (design spec §3): research threads are addressed by id,
 *  never "the" active thread — many can be open per org at once. Validates
 *  org ownership so a thread_id from one org can never be used to read/write
 *  another's conversation. */
export async function getThread(threadId: string, orgId: string): Promise<ThreadMeta | null> {
  try {
    const { data, error } = await serviceClient().from('agent_threads')
      .select('id, kind, status, focus_label, focus_purpose_id')
      .eq('id', threadId).eq('org_id', orgId).maybeSingle()
    if (error || !data) return null
    const row = data as Record<string, unknown>
    return {
      id: String(row.id),
      kind: (row.kind as 'briefing' | 'research') ?? 'briefing',
      status: String(row.status),
      focusLabel: (row.focus_label as string | null) ?? null,
      focusPurposeId: (row.focus_purpose_id as string | null) ?? null,
    }
  } catch { return null }
}

export interface ResearchThreadSummary {
  id: string
  focusLabel: string | null
  focusPurposeId: string | null
  updatedAt: string
}

/** Research agent v1 (design spec §3): the thread tab row's data source —
 *  every research thread for the org, most recently active first. Archived
 *  threads are excluded (status='active' only); archiving isn't built yet, so
 *  today this is every research thread the org has ever opened. */
export async function listResearchThreads(orgId: string): Promise<ResearchThreadSummary[]> {
  try {
    const { data, error } = await serviceClient().from('agent_threads')
      .select('id, focus_label, focus_purpose_id, updated_at')
      .eq('org_id', orgId).eq('kind', 'research').eq('status', 'active')
      .order('updated_at', { ascending: false })
    if (error || !data) return []
    return (data as Array<Record<string, unknown>>).map(row => ({
      id: String(row.id),
      focusLabel: (row.focus_label as string | null) ?? null,
      focusPurposeId: (row.focus_purpose_id as string | null) ?? null,
      updatedAt: String(row.updated_at),
    }))
  } catch { return [] }
}

/** Research agent v1 (design spec §3): always creates a NEW thread — there is
 *  no "the" research thread to fetch-or-create, unlike the briefing drawer.
 *  focusPurposeId/focusLabel are both optional and independent (either, both,
 *  or neither — the caller decides; schema doesn't enforce exclusivity). */
export async function createResearchThread(
  orgId: string,
  opts: { focusPurposeId?: string | null; focusLabel?: string | null } = {},
): Promise<string | null> {
  try {
    const { data, error } = await serviceClient().from('agent_threads')
      .insert({
        org_id: orgId,
        kind: 'research',
        focus_purpose_id: opts.focusPurposeId ?? null,
        focus_label: opts.focusLabel ?? null,
      })
      .select('id').single()
    if (error || !data) return null
    return String((data as Record<string, unknown>).id)
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
  meta: { turnKind: TurnKind; usage: TurnUsage; composedNote?: ComposedNote | null },
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
      // v1.1 §2: loop.ts's post-loop normalization guarantees the note-bearing
      // row is always the array's actual last assistant-role entry, so the
      // SAME lastAssistant index usage already stamps onto is also correct here.
      composed_note: i === lastAssistant ? (meta.composedNote ?? null) : null,
    }))
    const { error } = await sb.from('agent_messages').insert(rows)
    if (error) { console.error('[threads] appendTurn insert failed:', error.message); return }
    await sb.from('agent_threads').update({ updated_at: new Date().toISOString() }).eq('id', threadId)
  } catch (e) {
    console.error('[threads] appendTurn threw:', e)
  }
}

/** v1.1 §2: parse a stored composed_note defensively — a malformed value or
 *  an unexpected schema_version degrades to "show the read, drop the bad
 *  card," never throws and blanks the whole thread on reload. */
function parseComposedNote(raw: unknown): ComposedNote | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.read !== 'string') return null
  const safeCards = (v: unknown): ComposedNoteCard[] =>
    Array.isArray(v)
      ? v.filter((item): item is ComposedNoteCard =>
          !!item && typeof item === 'object' && typeof (item as Record<string, unknown>).tool === 'string')
      : []
  return {
    schema_version: typeof r.schema_version === 'number' ? r.schema_version : 1,
    read: r.read,
    shortlist: safeCards(r.shortlist),
    weaker: safeCards(r.weaker),
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
 *  tool_result-only messages folded away. `cards` (research agent v1 ship-
 *  gate, spec §8 step 3/4): reconstructed from the SAME stored tool_result
 *  JSON a live turn streamed from, via the SAME slimmers (panel-slimmers.ts)
 *  — a reload can never show something a live turn wouldn't have. Empty on
 *  every message that carried no card-worthy tool call. */
export interface ThreadViewMessage {
  role: 'user' | 'assistant'
  text: string
  tool_names: string[]
  cards: Array<{ tool: string; data: unknown }>
  /** v1.1 §2: the composed research note, when this row is a research
   *  thread's note-bearing row. Reload just reads this back verbatim — no
   *  re-deriving, the hydration already happened once, live (loop.ts). Null
   *  on every row from before migration 043 (accepted, not backfilled). */
  note: ComposedNote | null
  created_at: string
}

export async function loadThreadView(threadId: string, limit = 100): Promise<ThreadViewMessage[]> {
  try {
    const { data, error } = await serviceClient()
      .from('agent_messages')
      .select('role, content, composed_note, created_at')
      .eq('thread_id', threadId)
      .order('seq', { ascending: false })
      .limit(limit)
    if (error || !data) return []
    const rows = data.reverse() as Array<{ role: string; content: unknown; composed_note: unknown; created_at: string }>
    const out: ThreadViewMessage[] = []
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const content = row.content as Anthropic.MessageParam['content']
      const note = parseComposedNote(row.composed_note)
      let text = ''
      const toolNames: string[] = []
      const toolUses: Array<{ id: string; name: string }> = []
      if (typeof content === 'string') text = content
      else if (Array.isArray(content)) {
        for (const block of content) {
          if (typeof block !== 'object' || block === null || !('type' in block)) continue
          if (block.type === 'text') text += (text ? '\n\n' : '') + block.text
          if (block.type === 'tool_use') {
            const name = String((block as { name?: unknown }).name ?? '')
            toolNames.push(name)
            const id = String((block as { id?: unknown }).id ?? '')
            if (id && RESEARCH_CARD_TOOLS.has(name)) toolUses.push({ id, name })
          }
        }
      }
      // v1.1 §2: a note-bearing row can have empty text and call no more
      // tools (the note itself already answers the question) — without the
      // !note check here, that row would be silently dropped and the
      // composed note lost on reload even though it rendered live.
      if (!text && !toolNames.length && !note) continue // pure tool_result carrier — not a visible turn

      // Cards: resolve this turn's card-worthy tool_use ids against the NEXT
      // stored row's tool_result blocks (loop.ts always writes them adjacent —
      // assistant tool_use message, then the user tool_result message).
      const cards: ThreadViewMessage['cards'] = []
      if (toolUses.length) {
        const next = rows[i + 1]?.content as Anthropic.MessageParam['content'] | undefined
        if (Array.isArray(next)) {
          for (const block of next) {
            if (typeof block !== 'object' || block === null || !('type' in block) || block.type !== 'tool_result') continue
            const tr = block as { tool_use_id?: string; content?: unknown; is_error?: boolean }
            if (tr.is_error) continue
            const match = toolUses.find(t => t.id === tr.tool_use_id)
            if (!match) continue
            const slim = PANEL_RESULT_SLIMMERS[match.name]
            if (!slim) continue
            try {
              const parsed = JSON.parse(String(tr.content)) as { data?: unknown }
              cards.push({ tool: match.name, data: slim(parsed.data) })
            } catch { /* stored content wasn't the expected JSON shape — skip, don't throw */ }
          }
        }
      }

      out.push({ role: row.role as 'user' | 'assistant', text, tool_names: toolNames, cards, note, created_at: String(row.created_at) })
    }
    return out
  } catch { return [] }
}
