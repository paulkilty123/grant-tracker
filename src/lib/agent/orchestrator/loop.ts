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
import { checkResearchBudget } from './budget'
import { RESEARCH_SERVER_TOOLS, RESEARCH_SYSTEM_PROMPT, researchSteering } from './research'
import { PANEL_RESULT_SLIMMERS } from './panel-slimmers'
import { canonicaliseFunderIdentity, findCatalogueMatchByFunder } from '../tools/research'

// Anthropic charges web_search per call, separate from token pricing — web_fetch
// is token-metered only (fetched content counts as input tokens). USD, applied
// through the same USD_TO_GBP conversion as llm.ts. Approximate; correct if
// Anthropic's published rate moves.
const WEB_SEARCH_COST_USD_PER_CALL = 0.01
const USD_TO_GBP = 0.79

// compose_research_note ref hydration, tolerant fallback (v1.1 §7 fix 1b).
// Fix 1a hardens the tool description to stop the model reformatting a ref;
// this is the structural half — a ref that identifies the SAME funder under
// different punctuation (hyphens standing in for the real spaces, a dropped
// leading "the") still resolves, rather than silently losing a genuinely-
// earned verdict. Runs canonicaliseFunderIdentity (research.ts) — the SAME
// identity form used everywhere a funder is compared, including the new
// catalogue-provenance check below. Exact match is always tried first — this
// is only a fallback, never a substitute for it, so two distinct real ids
// can't collide (a get_briefing/assess_opportunity_against_plan
// opportunity_id is a UUID; two different UUIDs never canonicalise to the
// same string).
function resolveRef(cardPool: Map<string, { tool: string; data: unknown }>, ref: string): { tool: string; data: unknown } | undefined {
  const exact = cardPool.get(ref)
  if (exact) return exact
  const target = canonicaliseFunderIdentity(ref)
  for (const key of Array.from(cardPool.keys())) {
    if (canonicaliseFunderIdentity(key) === target) return cardPool.get(key)
  }
  return undefined
}

// v1.1 §7 fix B (defect 1, the guarantee): the "researched live · not yet in
// catalogue" tag used to be a pure tool-provenance label (cards.ts's
// cardFromEntry: variant:'researched' iff entry.tool === 'cache_researched_
// funder') — no catalogue lookup behind it at all, so it could lie for any
// fund the model chose to research live regardless of whether it was
// actually catalogued (confirmed: Paul Hamlyn Foundation's Arts-based
// Learning Fund, a real, high-scoring get_briefing candidate). This runs a
// REAL catalogue check at hydration time, once, and freezes the result into
// the persisted card data — cards.ts/OpportunityCard.tsx render the tag off
// this stored field, never off which tool produced the card. Fix A should
// make this rare in practice (the model is steered to catalogue tools before
// it ever reaches cache_researched_funder for an already-catalogued fund);
// when it still fires, that's the acceptable backstop path Fix A can't fully
// close (a deliberate live re-check for fresher detail, or the model
// bypassing the steering) — logged, not blocked, per the "the harm was the
// lie, not the live call" decision.
async function withCatalogueProvenance(pooled: { tool: string; data: unknown }): Promise<unknown> {
  if (pooled.tool !== 'cache_researched_funder') return pooled.data
  const d = pooled.data as { funder_name?: string } | undefined
  if (!d?.funder_name) return pooled.data
  const catalogueMatch = await findCatalogueMatchByFunder(d.funder_name)
  if (catalogueMatch) {
    console.warn(`[research] cache_researched_funder card resolved to an ACTIVE catalogue match despite live research — backstop path for '${d.funder_name}' -> ${catalogueMatch.opportunity_id}`)
    return { ...(pooled.data as object), catalogue_match: catalogueMatch }
  }
  return pooled.data
}

export type OrchestratorEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_start'; name: string }
  | { type: 'tool_done'; name: string; ok: boolean; data?: unknown }
  | { type: 'note'; note: ComposedNote }
  | { type: 'done'; usage: TurnUsage }
  | { type: 'error'; message: string }

/** v1.1 §2 (compose-then-render). One card's data is whatever
 *  PANEL_RESULT_SLIMMERS already produced for its source tool (get_briefing /
 *  assess_opportunity_against_plan / cache_researched_funder) — the SAME
 *  shape cards.ts's cardFromEntry already knows how to render — plus the
 *  model's own authored judgment for THIS turn (verdict for a shortlist item,
 *  reason for a weaker one). */
export interface ComposedNoteCard {
  tool: string
  data: unknown
  verdict?: string
  reason?: string
  /** v1.1 §3.3: present only when the verdict genuinely carries a check-
   *  before-committing point — a plain question, doubles as the card's chip
   *  label and the message sent when tapped. Shortlist items only. */
  caveat?: string
}
export interface ComposedNote {
  schema_version: number
  read: string
  shortlist: ComposedNoteCard[]
  weaker: ComposedNoteCard[]
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
  /** v1.1 §2: the composed research note, when opts.research is true. Always
   *  non-null for a completed research turn (break-at-compose, or the
   *  finalText-based fallback when compose was never called or was
   *  degenerate) — null for every non-research turn. */
  composedNote: ComposedNote | null
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
  // e.message already carries the specific reason (which field, or how many
  // chars over assertScaffoldOnly's cap) — surfacing it lets the model
  // self-correct (e.g. shorten a field) instead of reading a generic
  // "this looks like application content" refusal as the actual problem.
  if (e instanceof AuthorshipError) return e.message
  return e instanceof Error ? e.message : 'Tool failed.'
}

export async function runAgentTurn(opts: {
  ctx: ToolContext
  history: Anthropic.MessageParam[]
  userTurn: string
  turnKind: TurnKind
  /** Research agent v1 thread-kind capability flag (design spec §4). Set only
   *  from a thread whose kind === 'research' — never true for the briefing
   *  generation path (reason.ts, which doesn't call this) or an ordinary
   *  drawer turn. Cost lever 1 (the monthly budget) still gates whether the
   *  live tools actually get offered this turn; a research thread over budget
   *  still works, just catalogue-only. */
  research?: boolean
  onEvent?: (ev: OrchestratorEvent) => void
}): Promise<TurnResult> {
  const { ctx } = opts
  const emit = opts.onEvent ?? (() => {})
  // Model routing lever 3 (spec §4.1): a research thread's turns always run
  // the strategist lane — the model needs to reason well about provenance,
  // discrepancy-flagging, and citation, exactly the bar that lane exists for.
  const turnKind: TurnKind = opts.research ? 'strategist' : opts.turnKind
  const model = pickModel(turnKind)
  const researchBudget = opts.research ? await checkResearchBudget(ctx.orgId) : null
  const researchAllowed = researchBudget?.allowed ?? false
  const tools: Anthropic.ToolUnion[] = toolDefsForTier(ctx.tier, { research: opts.research }).map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as Anthropic.Tool.InputSchema,
  }))
  if (opts.research && researchAllowed) tools.push(...RESEARCH_SERVER_TOOLS)
  const started = Date.now()

  const messages: Anthropic.MessageParam[] = [
    ...opts.history,
    { role: 'user', content: opts.userTurn },
  ]

  let inputTokens = 0
  let outputTokens = 0
  const toolNames: string[] = []
  let webSearchCalls = 0
  let iterations = 0
  let finalText = ''

  // v1.1 §2 (compose-then-render). Turn-scoped, not iteration-scoped —
  // compose_research_note is typically dispatched in a LATER loop iteration
  // than the tool that populated a ref it references, so both must survive
  // across the whole while loop, not just one pass of it.
  const cardPool = new Map<string, { tool: string; data: unknown }>()
  let composedNote: ComposedNote | null = null

  // The model has no inherent knowledge of the current date, so "18 months from
  // today" was being computed against its training-era sense of "now" (a wrong
  // year), producing goal end_dates a year early. Give it today explicitly. Kept
  // OUT of SYSTEM_PROMPT (the frozen cached prefix) as a separate trailing,
  // uncached block so the cache breakpoint stays byte-stable across the day.
  const todayIso = new Date().toISOString().slice(0, 10)
  const dateContext =
    `Today's date is ${todayIso} (UTC). Compute every relative date the user gives ("18 months from today", "by next spring", "end of the financial year") against this date, and pass tools absolute ISO dates (YYYY-MM-DD). Never assume the year — derive it from today.`

  // Server tools (web_search/web_fetch) run in a backend execution container
  // (Anthropic's Message.container). A turn that spans more than one API call
  // AFTER a server tool has fired must carry that container id forward, or the
  // next call 400s ("container_id is required when there are pending tool
  // uses..."). Undefined until the first response that returns one; every
  // later call in this turn's loop passes it back.
  let containerId: string | undefined

  // v1.1 §2: the system prompt alone (however forcefully worded) does not
  // reliably stop the model from ending a research turn with a rich plain-
  // text answer instead of calling compose_research_note — observed live,
  // twice, even with a MANDATORY instruction at the very top of the prompt.
  // Set once the model tries to end a turn this way; forces tool_choice on
  // the immediate retry so the turn still ends through the structured path
  // rather than silently degrading to a truncated snapshot of prose the
  // model chose not to submit as a real answer.
  let forcedCompose = false

  while (iterations < MAX_LOOP_ITERATIONS) {
    iterations += 1
    // Mirror the same paragraph break on the live stream between iterations.
    if (finalText && !finalText.endsWith('\n')) emit({ type: 'text_delta', text: '\n\n' })

    const stream = getAgentClient().messages.stream({
      model,
      max_tokens: MAX_TOKENS_PER_CALL,
      ...(containerId ? { container: containerId } : {}),
      ...(forcedCompose ? { tool_choice: { type: 'tool' as const, name: 'compose_research_note' } } : {}),
      // Frozen prefix (tools render before system) — one breakpoint caches both.
      // A research turn uses its OWN base prompt (RESEARCH_SYSTEM_PROMPT, no
      // goal/plan framing — amendment v1.1 §1), never SYSTEM_PROMPT, so the
      // shared briefing/chat prefix is completely untouched either way.
      // researchSteering gets its own breakpoint after it (static per
      // `researchAllowed` value, so it still caches). Today's date stays
      // last, uncached, so neither breakpoint busts across the day.
      system: opts.research
        ? [
            { type: 'text', text: RESEARCH_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
            { type: 'text', text: researchSteering(researchAllowed), cache_control: { type: 'ephemeral' } },
            { type: 'text', text: dateContext },
          ]
        : [
            { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
            { type: 'text', text: dateContext },
          ],
      tools,
      messages,
    })
    stream.on('text', text => emit({ type: 'text_delta', text }))
    const response = await stream.finalMessage()
    if (response.container?.id) containerId = response.container.id

    inputTokens += effectiveInputTokens(response.usage)
    outputTokens += response.usage.output_tokens ?? 0
    // Server tools (web_search/web_fetch) resolve INSIDE this same response —
    // no separate dispatch round-trip — so their usage only shows up here, not
    // in the tool_use loop below. Folded into toolNames so agent_turn_completed
    // carries them (instrumentation lever 4, and what checkResearchBudget
    // counts against next month).
    const serverTools = response.usage.server_tool_use
    if (serverTools) {
      for (let i = 0; i < serverTools.web_search_requests; i++) toolNames.push('web_search')
      for (let i = 0; i < serverTools.web_fetch_requests; i++) toolNames.push('web_fetch')
      webSearchCalls += serverTools.web_search_requests
    }
    for (const block of response.content) {
      if (block.type !== 'text') continue
      // Text emitted before a tool call and text after its results are separate
      // paragraphs, not one run-on sentence.
      finalText += (finalText && !finalText.endsWith('\n') ? '\n\n' : '') + block.text
    }

    if (response.stop_reason !== 'tool_use') {
      if (opts.research && !composedNote && !forcedCompose) {
        // Discard this attempt WITHOUT pushing it to messages — never
        // persisted, never shown, not even a corrective "user" turn injected
        // into history (which would itself render as a fake message bubble
        // on reload). The exact same messages array is replayed once more,
        // this time with tool_choice forcing compose_research_note, so the
        // model has no way to answer except through the structured path.
        forcedCompose = true
        continue
      }
      messages.push({ role: 'assistant', content: response.content })
      break
    }
    // A forced tool_choice call is satisfied by this response (stop_reason
    // === 'tool_use' now) — reset so a LATER, separate plain-text attempt in
    // the same turn (unlikely, but not impossible) still gets its own retry
    // rather than being silently forced again without cause.
    forcedCompose = false

    // Execute every tool_use block; return ALL results in one user message.
    //
    // v1.1 §2 (compose-then-render): non-compose tools dispatch FIRST, so the
    // card pool is populated before any compose_research_note in the SAME
    // response tries to resolve a ref against it. assess_opportunity_
    // against_plan's opportunity_id and cache_researched_funder's funder_key
    // are both values the model already knows before calling the tool (an
    // echo / a deterministic slug of its own input, unlike get_briefing's
    // DB-generated ids) — so a model can legitimately bundle one of those
    // WITH compose_research_note in one response, and Anthropic does not
    // guarantee block order matches dependency order. compose_research_note
    // block(s) are processed last, deterministically, regardless of the
    // order the model emitted them in.
    //
    // The whole batch is always finished and pushed as ONE tool_result
    // message before the turn can terminate (break-at-compose, below) — an
    // unmatched tool_use in persisted history breaks next-turn replay.
    messages.push({ role: 'assistant', content: response.content })
    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    const composeUses = toolUses.filter(tu => tu.name === 'compose_research_note')
    const otherUses = toolUses.filter(tu => tu.name !== 'compose_research_note')
    const results: Anthropic.ToolResultBlockParam[] = []
    let composedThisIteration = false

    const runOne = async (tu: Anthropic.ToolUseBlock): Promise<void> => {
      toolNames.push(tu.name)
      emit({ type: 'tool_start', name: tu.name })
      // Structural (not prompt-only) block on the restricted-actions rule
      // (design spec §2/§6): eval found the steering alone doesn't hold under
      // a direct "add it to my pipeline anyway" push. A research thread's
      // add_to_pipeline call without a real catalogue opportunity_id is
      // exactly what a freshly-researched, uncatalogued find looks like — an
      // opportunity_id-carrying add (a real catalogue candidate from
      // get_briefing/assess_opportunity_against_plan, surfaced in this SAME
      // thread) is unaffected, and so is every ordinary manual pipeline add
      // outside a research thread (opts.research is false there).
      const input = (tu.input ?? {}) as Record<string, unknown>
      if (opts.research && tu.name === 'add_to_pipeline' && !input.opportunity_id) {
        results.push({
          type: 'tool_result', tool_use_id: tu.id, is_error: true,
          content: 'Refused: add_to_pipeline needs a catalogue opportunity_id in a research thread. A researched, not-yet-catalogued find cannot go to the pipeline — offer Save, Pin, Research deeper, or flag_for_verification instead.',
        })
        emit({ type: 'tool_done', name: tu.name, ok: false })
        return
      }
      try {
        const result = await dispatchTool(ctx, tu.name, input)

        if (tu.name === 'compose_research_note') {
          // Hydrate refs against this turn's card pool rather than trusting
          // the model's own params — a ref that doesn't resolve to something
          // a real tool call actually returned THIS turn is dropped, never
          // rendered as a fabricated card ("steps derive from real tool
          // activity, never invented" extended to the note itself).
          const raw = result.data as { read: string; shortlist?: Array<{ ref: string; verdict: string; caveat?: string }>; weaker?: Array<{ ref: string; reason: string }> }
          const shortlist: ComposedNoteCard[] = []
          for (const item of raw.shortlist ?? []) {
            const pooled = resolveRef(cardPool, item.ref)
            if (!pooled) { console.warn(`[research] compose_research_note: unresolved shortlist ref '${item.ref}' — dropped`); continue }
            // §3.1: a card with no authored text is a compose bug to surface,
            // never papered over with a template fallback — the whole point
            // of hydration is that only AUTHORED cards render.
            let verdict = item.verdict?.trim()
            if (!verdict) { console.warn(`[research] compose_research_note: empty verdict for ref '${item.ref}'`); verdict = 'No verdict authored.' }
            shortlist.push({ tool: pooled.tool, data: await withCatalogueProvenance(pooled), verdict, caveat: item.caveat?.trim() || undefined })
          }
          const weaker: ComposedNoteCard[] = []
          for (const item of raw.weaker ?? []) {
            const pooled = resolveRef(cardPool, item.ref)
            if (!pooled) { console.warn(`[research] compose_research_note: unresolved weaker ref '${item.ref}' — dropped`); continue }
            let reason = item.reason?.trim()
            if (!reason) { console.warn(`[research] compose_research_note: empty reason for ref '${item.ref}'`); reason = 'No reason authored.' }
            weaker.push({ tool: pooled.tool, data: await withCatalogueProvenance(pooled), reason })
          }
          // Degenerate: a call that's technically valid (the tool's own
          // handler already rejects a blank read) but content-poor in every
          // dimension at once — route to the same finalText-based synthesis
          // the no-compose-called fallback uses, rather than a near-blank
          // note. Leaving composedNote unset here (not composedThisIteration)
          // is what routes it there; the turn still terminates below either
          // way, only the CONTENT that ends up persisted/emitted differs.
          const degenerate = !raw.read?.trim() && shortlist.length === 0 && weaker.length === 0
          // schema_version 2 (v1.1 §3.5): adds the optional caveat field. A
          // v1 note (reload of a pre-§3 turn) is caveat-free by definition —
          // the tolerant reader (threads.ts) treats a missing field as
          // "no chip", so it renders identically minus caveats it never had.
          const note: ComposedNote = { schema_version: 2, read: raw.read, shortlist, weaker }

          // Minimal tool_result — the model never sees the full hydrated
          // cards back (the turn is ending), this exists purely for
          // tool_use/tool_result replay integrity on the next turn.
          results.push({
            type: 'tool_result', tool_use_id: tu.id,
            content: JSON.stringify({ data: { ok: true, shortlist_count: shortlist.length, weaker_count: weaker.length }, provenance: {} }),
          })
          emit({ type: 'tool_done', name: tu.name, ok: true })

          // Two compose blocks in one response (unusual): keep the FIRST as
          // the turn's note; the second still gets a tool_result above (for
          // replay integrity) but never overrides an already-set note.
          if (!degenerate && !composedNote) {
            composedNote = note
            composedThisIteration = true
            emit({ type: 'note', note })
          }
        } else {
          results.push({
            type: 'tool_result',
            tool_use_id: tu.id,
            content: JSON.stringify({ data: result.data, provenance: result.provenance }),
          })
          const slim = PANEL_RESULT_SLIMMERS[tu.name]
          const slimmed = slim ? slim(result.data) : undefined
          emit({ type: 'tool_done', name: tu.name, ok: true, ...(slimmed !== undefined ? { data: slimmed } : {}) })

          // Card pool (v1.1 §2): get_briefing's candidate shape carries
          // record_check/next_open_date/open_status/size_note that assess_
          // opportunity_against_plan's slimmed opportunity sub-object does
          // not — richer card, so get_briefing wins a same-ref collision
          // regardless of call order. cache_researched_funder never collides
          // (funder_key is a disjoint key space from opportunity ids).
          if (tu.name === 'get_briefing') {
            const d = slimmed as { candidates?: Array<{ opportunity_id?: string }> } | undefined
            for (const c of d?.candidates ?? []) {
              if (c.opportunity_id) cardPool.set(c.opportunity_id, { tool: tu.name, data: c })
            }
          } else if (tu.name === 'assess_opportunity_against_plan') {
            const d = slimmed as { opportunity?: { id?: string } } | undefined
            const id = d?.opportunity?.id
            if (id && cardPool.get(id)?.tool !== 'get_briefing') cardPool.set(id, { tool: tu.name, data: d })
          } else if (tu.name === 'cache_researched_funder') {
            const d = slimmed as { funder_key?: string } | undefined
            if (d?.funder_key) cardPool.set(d.funder_key, { tool: tu.name, data: d })
          }
        }
      } catch (e) {
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: toolErrorMessage(e), is_error: true })
        emit({ type: 'tool_done', name: tu.name, ok: false })
      }
    }

    for (const tu of otherUses) await runOne(tu)
    for (const tu of composeUses) await runOne(tu)

    messages.push({ role: 'user', content: results })
    // Break-at-compose: a successful, non-degenerate compose_research_note
    // ends the turn here — no further API call for a final plain-text
    // wrap-up. The note SSE event already fired at hydration above, so the
    // live bubble already shows it; asking the model again would be
    // redundant. This REPLACES the old final-text round rather than adding
    // to it, so the iteration budget (config.ts) is unchanged from before
    // this feature.
    if (composedThisIteration) break
  }

  // Fallback (v1.1 §2): the turn ended without a usable composedNote — compose_
  // research_note was never called, the model exhausted its tool-call budget
  // before reaching it, or its own attempt was degenerate (above). Synthesise
  // a minimal note from whatever plain text the model DID produce, so the
  // research UI never has "turn finished but nothing to show." Must ALSO emit
  // the note event, not just be persisted below — otherwise the client's note
  // field stays null and the message falls into the error-branch rendering
  // even though nothing actually errored.
  if (opts.research && !composedNote) {
    const trimmed = finalText.trim()
    // Cut at a word boundary, not mid-word — a hard character slice can land
    // inside a word ("...on its o|wn"), which reads as broken even though
    // it's a deliberate fallback, not an error.
    const read = trimmed.length <= 500 ? trimmed : trimmed.slice(0, trimmed.lastIndexOf(' ', 500)).trimEnd() + '…'
    composedNote = { schema_version: 1, read: read || 'No further detail available.', shortlist: [], weaker: [] }
    emit({ type: 'note', note: composedNote })
  }

  // Post-loop normalization (v1.1 §2): break-at-compose (or hitting
  // MAX_LOOP_ITERATIONS mid-tool-calling) can leave `messages` ending on a
  // user tool_result row, which would break the Anthropic API's strict
  // user/assistant alternation on the NEXT turn (two consecutive user-role
  // messages once the next real user turn is appended). If the last row is
  // already a real assistant reply (compose was never called and the model's
  // own final text ended the turn normally), there is nothing to append —
  // appendTurn (threads.ts) stamps composed_note onto that existing row. If
  // the last row is a tool_result carrier, append a synthetic assistant text
  // row so persisted history stays valid to replay. Never streamed — the
  // note SSE event already showed this live, this is persistence-only.
  if (opts.research && composedNote) {
    const last = messages[messages.length - 1]
    if (last?.role === 'user') {
      messages.push({ role: 'assistant', content: [{ type: 'text', text: composedNote.read }] })
    }
  }

  // web_search is billed per call, separate from token pricing (web_fetch is
  // token-metered only — fetched content counts as input tokens, already in
  // inputTokens above). Added on top of estimateCostMicroGbp's token estimate.
  const webSearchCostMicroGbp = Math.round(webSearchCalls * WEB_SEARCH_COST_USD_PER_CALL * USD_TO_GBP * 1e6)

  const usage: TurnUsage = {
    model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_estimate_microgbp: estimateCostMicroGbp(model, inputTokens, outputTokens) + webSearchCostMicroGbp,
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
  return { text: finalText, messages, usage, composedNote }
}

export { ORCHESTRATOR_PROMPT_VERSION }
