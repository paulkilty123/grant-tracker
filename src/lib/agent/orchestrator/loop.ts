// The conversational orchestrator loop — one user turn in, streamed text out,
// tools executed against the tool layer in between.
//
// Shape per build-spec §13 resumption order: the SECOND consumer of the one
// tool layer (the MCP surface being the first). Everything the model knows
// about the org arrives through dispatchTool() with the ToolContext resolved
// at the route boundary — no session state, no side doors, so an external MCP
// client running the same tools would reason from identical inputs.
//
// The API is stateless: the caller passes prior turns and receives the updated
// message list back. Thread persistence (the briefing-page conversation) is a
// logged follow-on — plan/goal state already lives in schema via the tools, so
// nothing here is the system of record.

import type Anthropic from '@anthropic-ai/sdk'
import { getAgentClient, estimateCostMicroGbp } from '../llm'
import { emitEvent } from '../../events/emit'
import { EntitlementError, AuthorshipError, type ToolContext } from '../tools/types'
import { toolDefsForTier, dispatchTool } from './dispatch'
import { SYSTEM_PROMPT, ORCHESTRATOR_PROMPT_VERSION } from './prompt'
import { pickModel, MAX_LOOP_ITERATIONS, MAX_TOKENS_PER_CALL, type TurnKind } from './config'

export type OrchestratorEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_start'; name: string }
  | { type: 'tool_done'; name: string; ok: boolean; data?: unknown }
  | { type: 'done'; usage: TurnUsage }
  | { type: 'error'; message: string }

// Tools whose results are streamed to the client so surfaces (the setup
// panel's "plan, assembling") can render from TOOL DATA, never model prose.
// Whitelist + slimming — never a blanket pass-through.
const PANEL_RESULT_SLIMMERS: Record<string, (data: unknown) => unknown> = {
  recommend_mix: d => d, // deterministic rulebook output, already slim
  set_funding_goal: d => {
    const r = d as { goal?: unknown; purposes?: unknown }
    return { goal: r.goal, purposes: r.purposes }
  },
  get_plan_state: d => {
    const r = d as { has_goal?: boolean; arithmetic?: unknown; purposes?: unknown }
    return { has_goal: r.has_goal, arithmetic: r.arithmetic ?? null, purposes: r.purposes ?? null }
  },
  get_briefing: d => {
    const r = d as { has_goal?: boolean; top_candidates?: unknown[] }
    return { has_goal: r.has_goal, candidate_count: r.top_candidates?.length ?? 0 }
  },
}

export interface TurnUsage {
  model: string
  input_tokens: number   // effective: uncached + 1.25× cache-writes + 0.1× cache-reads
  output_tokens: number
  cost_estimate_microgbp: number
  duration_ms: number
  tool_names: string[]
  loop_iterations: number
}

export interface TurnResult {
  /** The assistant's final visible text for this turn. */
  text: string
  /** Full updated message list (caller's history + this turn), replayable as-is. */
  messages: Anthropic.MessageParam[]
  usage: TurnUsage
}

function effectiveInputTokens(u: Anthropic.Usage): number {
  return Math.round(
    (u.input_tokens ?? 0)
    + 1.25 * (u.cache_creation_input_tokens ?? 0)
    + 0.1 * (u.cache_read_input_tokens ?? 0),
  )
}

// A failed tool call goes back to the model as an is_error result so it can
// adapt in-conversation. Envelope errors map to honest, user-safe phrasing.
function toolErrorMessage(e: unknown): string {
  if (e instanceof EntitlementError) return 'This tool is not available on this plan.'
  if (e instanceof AuthorshipError) return 'Refused: this layer scaffolds structure only — it does not accept or produce application content.'
  return e instanceof Error ? e.message : 'Tool failed.'
}

export async function runAgentTurn(opts: {
  ctx: ToolContext
  history: Anthropic.MessageParam[]
  userTurn: string
  turnKind: TurnKind
  onEvent?: (ev: OrchestratorEvent) => void
}): Promise<TurnResult> {
  const { ctx, turnKind } = opts
  const emit = opts.onEvent ?? (() => {})
  const model = pickModel(turnKind)
  const tools = toolDefsForTier(ctx.tier).map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as Anthropic.Tool.InputSchema,
  }))
  const started = Date.now()

  const messages: Anthropic.MessageParam[] = [
    ...opts.history,
    { role: 'user', content: opts.userTurn },
  ]

  let inputTokens = 0
  let outputTokens = 0
  const toolNames: string[] = []
  let iterations = 0
  let finalText = ''

  // The model has no inherent knowledge of the current date, so "18 months from
  // today" was being computed against its training-era sense of "now" (a wrong
  // year), producing goal end_dates a year early. Give it today explicitly. Kept
  // OUT of SYSTEM_PROMPT (the frozen cached prefix) as a separate trailing,
  // uncached block so the cache breakpoint stays byte-stable across the day.
  const todayIso = new Date().toISOString().slice(0, 10)
  const dateContext =
    `Today's date is ${todayIso} (UTC). Compute every relative date the user gives ("18 months from today", "by next spring", "end of the financial year") against this date, and pass tools absolute ISO dates (YYYY-MM-DD). Never assume the year — derive it from today.`

  while (iterations < MAX_LOOP_ITERATIONS) {
    iterations += 1
    // Mirror the same paragraph break on the live stream between iterations.
    if (finalText && !finalText.endsWith('\n')) emit({ type: 'text_delta', text: '\n\n' })

    const stream = getAgentClient().messages.stream({
      model,
      max_tokens: MAX_TOKENS_PER_CALL,
      // Frozen prefix (tools render before system) — one breakpoint caches both.
      // Today's date rides in a separate trailing block, after the cache
      // breakpoint, so it never busts the cached prefix.
      system: [
        { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: dateContext },
      ],
      tools,
      messages,
    })
    stream.on('text', text => emit({ type: 'text_delta', text }))
    const response = await stream.finalMessage()

    inputTokens += effectiveInputTokens(response.usage)
    outputTokens += response.usage.output_tokens ?? 0
    for (const block of response.content) {
      if (block.type !== 'text') continue
      // Text emitted before a tool call and text after its results are separate
      // paragraphs, not one run-on sentence.
      finalText += (finalText && !finalText.endsWith('\n') ? '\n\n' : '') + block.text
    }

    if (response.stop_reason !== 'tool_use') {
      messages.push({ role: 'assistant', content: response.content })
      break
    }

    // Execute every tool_use block; return ALL results in one user message.
    messages.push({ role: 'assistant', content: response.content })
    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    const results: Anthropic.ToolResultBlockParam[] = []
    for (const tu of toolUses) {
      toolNames.push(tu.name)
      emit({ type: 'tool_start', name: tu.name })
      try {
        const result = await dispatchTool(ctx, tu.name, (tu.input ?? {}) as Record<string, unknown>)
        results.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: JSON.stringify({ data: result.data, provenance: result.provenance }),
        })
        const slim = PANEL_RESULT_SLIMMERS[tu.name]
        emit({ type: 'tool_done', name: tu.name, ok: true, ...(slim ? { data: slim(result.data) } : {}) })
      } catch (e) {
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: toolErrorMessage(e), is_error: true })
        emit({ type: 'tool_done', name: tu.name, ok: false })
      }
    }
    messages.push({ role: 'user', content: results })
  }

  const usage: TurnUsage = {
    model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_estimate_microgbp: estimateCostMicroGbp(model, inputTokens, outputTokens),
    duration_ms: Date.now() - started,
    tool_names: toolNames,
    loop_iterations: iterations,
  }

  // Per-turn accounting through the capture layer — the data tier prices are
  // set against, and what the budget guard reads back. Never throws.
  await emitEvent({ surface: ctx.surface, orgId: ctx.orgId, userId: ctx.userId },
    'agent_turn_completed', {
      turn_kind: turnKind,
      model: usage.model,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      cost_estimate_microgbp: usage.cost_estimate_microgbp,
      duration_ms: usage.duration_ms,
      tool_names: usage.tool_names,
      loop_iterations: usage.loop_iterations,
    })

  emit({ type: 'done', usage })
  return { text: finalText, messages, usage }
}

export { ORCHESTRATOR_PROMPT_VERSION }
