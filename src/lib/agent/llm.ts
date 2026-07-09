// Goal agent — isolated LLM client wrapper (build-spec §2, §8).
//
// All agent inference goes through here so cost instrumentation and caps apply
// only to agent traffic and can be killed independently. Model id is a config
// constant (recorded per run). Structured output is tool-enforced (build-spec
// §6.2) — a forced tool call, never prose-then-parse.

import Anthropic from '@anthropic-ai/sdk'

// Default reasoning model (build-spec §6.2). Override with AGENT_MODEL, e.g.
// claude-opus-4-8 for the quality fallback, or claude-fable-5 to A/B the
// hardest heartland cases. Bare aliases only — no date suffixes.
export const AGENT_MODEL = process.env.AGENT_MODEL ?? 'claude-sonnet-4-6'
export const JUDGE_MODEL = process.env.AGENT_JUDGE_MODEL ?? 'claude-sonnet-4-6'
export const SUBTASK_MODEL = 'claude-haiku-4-5'

// USD per 1M tokens (input, output) — for cost instrumentation only.
const PRICES: Record<string, [number, number]> = {
  'claude-fable-5': [10, 50],
  'claude-opus-4-8': [5, 25],
  'claude-opus-4-7': [5, 25],
  'claude-sonnet-5': [3, 15], // sticker; $2/$10 intro pricing runs to 2026-08-31 — instrument at sticker so estimates stay conservative
  'claude-sonnet-4-6': [3, 15],
  'claude-haiku-4-5': [1, 5],
}
const USD_TO_GBP = 0.79

export interface Usage {
  model: string
  inputTokens: number
  outputTokens: number
  costMicroGbp: number
}

export function estimateCostMicroGbp(model: string, inTok: number, outTok: number): number {
  const [inP, outP] = PRICES[model] ?? PRICES['claude-sonnet-4-6']
  const usd = (inTok / 1e6) * inP + (outTok / 1e6) * outP
  return Math.round(usd * USD_TO_GBP * 1e6)
}

let _client: Anthropic | null = null
function client(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set — agent LLM calls need it (load .env.local first).')
    _client = new Anthropic({ apiKey })
  }
  return _client
}

/** The one agent-scoped Anthropic client (build-spec §2: all agent inference
 *  behind this wrapper so cost instrumentation and caps apply only to agent
 *  traffic). The conversational orchestrator streams through this. */
export function getAgentClient(): Anthropic {
  return client()
}

export interface ToolSchema {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

export interface StructuredResult<T> {
  data: T
  usage: Usage
  stopReason: string | null
}

// One forced-tool call → the tool input, parsed. Retries once on max_tokens
// with a larger budget (memory: silent catch hid stop_reason: max_tokens).
export async function callStructuredTool<T>(opts: {
  system: string
  user: string
  tool: ToolSchema
  model?: string
  maxTokens?: number
}): Promise<StructuredResult<T>> {
  const model = opts.model ?? AGENT_MODEL
  let maxTokens = opts.maxTokens ?? 8000

  for (let attempt = 0; attempt < 2; attempt++) {
    const msg = await client().messages.create({
      model,
      max_tokens: maxTokens,
      system: opts.system,
      messages: [{ role: 'user', content: opts.user }],
      tools: [{ name: opts.tool.name, description: opts.tool.description, input_schema: opts.tool.input_schema as Anthropic.Tool.InputSchema }],
      tool_choice: { type: 'tool', name: opts.tool.name },
    })
    const usage: Usage = {
      model,
      inputTokens: msg.usage.input_tokens,
      outputTokens: msg.usage.output_tokens,
      costMicroGbp: estimateCostMicroGbp(model, msg.usage.input_tokens, msg.usage.output_tokens),
    }
    if (msg.stop_reason === 'max_tokens' && attempt === 0) {
      maxTokens = Math.min(maxTokens * 2, 16000)
      continue
    }
    const block = msg.content.find(b => b.type === 'tool_use')
    if (!block || block.type !== 'tool_use') {
      throw new Error(`No tool_use in response (stop_reason=${msg.stop_reason}).`)
    }
    return { data: block.input as T, usage, stopReason: msg.stop_reason }
  }
  throw new Error('callStructuredTool exhausted retries on max_tokens')
}
