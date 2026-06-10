// POST /api/builder/generate — scaffold generation (builder v0, spec B3-4/B4).
// Single-pass, STREAMED: the model's output is forwarded to the client as it
// generates (first card readable in seconds), then the complete JSON is
// zod-validated server-side and persisted onto the application. The builder
// produces the first 10% — scaffold sections, the org's own content mapped in
// verbatim, gaps flagged — never finished prose in the org's voice.
//
// Response protocol: newline-delimited JSON events —
//   {"t":"delta","text":"..."}   raw model text as it streams
//   {"t":"done","questions":[...]}  validated + persisted result
//   {"t":"error","message":"..."}
//
// Cost instrumentation is first-class: builder_scaffold_generated carries
// model + token counts on every generation.
//
// Body: { application_id: string }

import { NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getBuilderUser } from '@/lib/builder/access'
import { emitEvent } from '@/lib/events/emit'
import {
  GenerationResultSchema,
  type ApplicationQuestion,
  type CoreContentBlock,
  type GeneratedQuestion,
} from '@/lib/builder/types'

export const dynamic     = 'force-dynamic'
export const maxDuration = 300

const GENERATION_MODEL = 'claude-sonnet-4-6'

// ── Prompt assembly ──────────────────────────────────────────────────────────
// The system prompt is static (cacheable). Org content, funder context and
// questions arrive in the user turn.

const SYSTEM_PROMPT = `You are the application builder inside Grant Tracker, working for a UK charity or social enterprise. You produce the FIRST 10% of a funding application — the scaffold — never the finished draft. The user writes the actual answers in their own voice.

For each question you produce three things:

1. SCAFFOLD — what a strong answer to this question covers and in what order, as sections. Each section has a heading and guidance. Guidance is written TO the user ("Open with the need in your area — your need_evidence block has the figures"), never AS the user. No finished narrative sentences they could paste in.

2. MAPPED CONTENT — verbatim excerpts from the organisation's own content blocks or profile that belong in this answer. Quote their words exactly as written; never paraphrase, polish, or extend them. Each mapped excerpt carries the block id it came from and a one-line note on where it fits.

3. GAPS — what their material does not cover that this answer needs. severity "blocking" = an eligibility or required-evidence hole; severity "weakens" = a strong application would have this. gap_type is a short snake_case label (e.g. "no_outcome_figures", "missing_budget_detail") and is shown to the user as the gap's title, so make it readable when the underscores become spaces. description is AT MOST two sentences: what is missing and what to add.

THE RULES, in priority order:
- NEVER FABRICATE. Use only the supplied organisation content and profile. If their material does not cover something, that is a GAP — flag it, never fill it. Do not invent numbers, partners, outcomes, or history.
- SCAFFOLD, NOT PROSE. Output structure, guidance and mapped excerpts. If you find yourself writing flowing sentences in the organisation's voice, stop — that is their job.
- FUNDER-TUNED. Where funder context states priorities, exclusions or emphasis, say specifically how to angle each answer to this funder, and name the catalogue field it came from (e.g. "the funder's priorities field says...") so the claim stays auditable. Do not invent funder preferences beyond the supplied context.
- KEEP GUIDANCE SHORT. Each scaffold section's guidance is at most two crisp sentences, written as instructions ("Name your primary beneficiaries. Add one sentence on why support is needed now, around 60 words."). No paragraphs.
- Respect word limits in your guidance: tell the user roughly how to budget the words across sections.
- British English. Sentence case. NEVER use an em dash anywhere in any output; use a comma, colon, or full stop instead. No buzzwords.

OUTPUT: a single JSON object, no markdown fences, exactly this shape:
{"questions":[{"question_text":"<verbatim>","scaffold":[{"heading":"...","guidance":"...","suggested_order":1}],"mapped_content":[{"block_id":"<id or 'profile'>","block_type":"...","excerpt":"<their words, verbatim>","relevance_note":"..."}],"gaps":[{"gap_type":"...","description":"...","severity":"blocking|weakens"}]}]}
One questions[] entry per question, in the order given.`

function orgProfileBlock(org: Record<string, unknown>): string {
  const arr = (v: unknown) => (Array.isArray(v) ? (v as unknown[]).join(', ') : '')
  return [
    `Name: ${org.name ?? '(not set)'}`,
    org.mission            ? `Mission: ${org.mission}` : '',
    arr(org.impact_sectors)     ? `Impact sectors: ${arr(org.impact_sectors)}` : '',
    arr(org.beneficiary_groups) ? `Beneficiary groups: ${arr(org.beneficiary_groups)}` : '',
    org.primary_location   ? `Location: ${org.primary_location}` : '',
    org.legal_structure    ? `Legal structure: ${org.legal_structure}` : '',
    arr(org.areas_of_work) ? `Areas of work: ${arr(org.areas_of_work)}` : '',
    arr(org.key_outcomes)  ? `Key outcomes: ${arr(org.key_outcomes)}` : '',
    org.annual_income_band ? `Annual income band: ${org.annual_income_band}` : '',
    org.years_operating    ? `Years operating: ${org.years_operating}` : '',
  ].filter(Boolean).join('\n')
}

// Funder-context block — harvested from the Phase 0 spike's buildFunderContext;
// the verified catalogue entry is the data advantage, injected richly.
function buildFunderContext(g: Record<string, unknown>): string {
  const fb  = (g.funder_brief ?? {}) as Record<string, unknown>
  const arr = (v: unknown) => (Array.isArray(v) ? (v as unknown[]).join(', ') : '')
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  return [
    str(g.title)               ? `Grant: ${str(g.title)}` : '',
    str(g.funder)              ? `Funder: ${str(g.funder)}` : '',
    str(g.description)         ? `Summary: ${str(g.description)}` : '',
    str(fb.what_they_fund)     ? `What they fund: ${str(fb.what_they_fund)}` : '',
    str(fb.priorities)         ? `Priorities: ${str(fb.priorities)}` : '',
    str(fb.who_can_apply)      ? `Who can apply: ${str(fb.who_can_apply)}` : '',
    str(fb.exclusions)         ? `What they will NOT fund: ${str(fb.exclusions)}` : '',
    str(fb.strong_application) ? `What makes a strong application here: ${str(fb.strong_application)}` : '',
    str(fb.funder_tips)        ? `Funder tips: ${str(fb.funder_tips)}` : '',
    str(fb.typical_award)      ? `Typical award: ${str(fb.typical_award)}` : '',
    str(fb.geographic_focus)   ? `Geographic focus: ${str(fb.geographic_focus)}` : '',
    arr(g.eligibility_criteria)   ? `Eligibility: ${arr(g.eligibility_criteria)}` : '',
    arr(g.impact_sectors)         ? `Sectors: ${arr(g.impact_sectors)}` : '',
    arr(g.target_beneficiaries)   ? `Target beneficiaries: ${arr(g.target_beneficiaries)}` : '',
    (g.amount_min || g.amount_max) ? `Funding range: ${g.amount_min ?? '?'} to ${g.amount_max ?? '?'}` : '',
    g.deadline                    ? `Deadline: ${g.deadline}` : '',
  ].filter(Boolean).join('\n')
}

function contentBlocksSection(blocks: CoreContentBlock[]): string {
  if (blocks.length === 0) return 'The organisation has no content blocks yet — map from the profile only (block_id "profile") and expect more gaps.'
  return blocks.map(b =>
    `[block_id: ${b.id}] [type: ${b.block_type}] "${b.title}"\n${b.content}`
  ).join('\n\n---\n\n')
}

function userPrompt(
  org: Record<string, unknown>,
  blocks: CoreContentBlock[],
  funderContext: string,
  suppliedGuidelines: string,
  questions: ApplicationQuestion[],
): string {
  const questionsBlock = questions.map((q, i) =>
    `Q${i + 1}. ${q.question_text}  [Word limit: ${q.word_limit ?? 'none stated'}]`
  ).join('\n')
  return `THE APPLICANT ORGANISATION (profile — mapped content from here uses block_id "profile")
${orgProfileBlock(org)}

THE ORGANISATION'S CONTENT BLOCKS (quote verbatim, reference by block_id)
${contentBlocksSection(blocks)}

${funderContext ? `THE FUNDER (verified catalogue entry — use it to angle the scaffolds, cite the field names)\n${funderContext}\n` : 'No catalogue entry is linked — scaffold to what a UK funder of this type typically weights, and say so in the guidance.\n'}
${suppliedGuidelines ? `THE FUNDER'S APPLICATION GUIDANCE (supplied by the applicant, unverified — use it to angle the scaffolds; when citing it say "the guidance you supplied", never present it as verified catalogue data)\n${suppliedGuidelines}\n` : ''}
THE QUESTIONS
${questionsBlock}`
}

// ── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const user = await getBuilderUser()
  if (!user) {
    return new Response(JSON.stringify({ t: 'error', message: 'The application builder is currently cohort-only' }) + '\n', { status: 403 })
  }
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ t: 'error', message: 'ANTHROPIC_API_KEY not configured' }) + '\n', { status: 500 })
  }

  let body: { application_id?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ t: 'error', message: 'Invalid JSON body' }) + '\n', { status: 400 })
  }
  if (!body.application_id) {
    return new Response(JSON.stringify({ t: 'error', message: 'application_id required' }) + '\n', { status: 400 })
  }

  const supabase = await createServerClient()
  const { data: app } = await supabase
    .from('applications')
    .select('*')
    .eq('id', body.application_id)
    .maybeSingle()
  if (!app) {
    return new Response(JSON.stringify({ t: 'error', message: 'Application not found' }) + '\n', { status: 404 })
  }
  const questions = (app.questions ?? []) as ApplicationQuestion[]
  if (questions.length === 0) {
    return new Response(JSON.stringify({ t: 'error', message: 'This application has no questions' }) + '\n', { status: 400 })
  }

  const [{ data: org }, { data: blocks }, grantRes] = await Promise.all([
    supabase.from('organisations').select('*').eq('id', app.org_id).maybeSingle(),
    supabase.from('org_core_content').select('*').eq('org_id', app.org_id),
    app.opportunity_id
      ? supabase.from('grants_with_funder').select('*').eq('id', app.opportunity_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  if (!org) {
    return new Response(JSON.stringify({ t: 'error', message: 'Organisation profile not found' }) + '\n', { status: 404 })
  }

  const funderContext = grantRes.data ? buildFunderContext(grantRes.data as Record<string, unknown>) : ''
  const contentBlocks = (blocks ?? []) as CoreContentBlock[]

  const started = Date.now()
  const suppliedGuidelines = app.supplied_guidelines ? String(app.supplied_guidelines).slice(0, 16000) : ''

  // ── Parallel chunked generation ──
  // Questions are split into chunks generated CONCURRENTLY, so a 9-question
  // application takes one chunk's wall-clock (~30s), not three. Deltas are
  // tagged with the chunk index; the client maps chunk-local question
  // positions to global ones via the plan event.
  const CHUNK_SIZE = 4
  const chunks: ApplicationQuestion[][] = []
  for (let i = 0; i < questions.length; i += CHUNK_SIZE) {
    chunks.push(questions.slice(i, i + CHUNK_SIZE))
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))

      send({ t: 'plan', chunks: chunks.map(c => c.length) })

      // Stream one chunk's generation, forwarding tagged deltas.
      async function runChunk(chunkQuestions: ApplicationQuestion[], chunkIdx: number): Promise<{
        text: string; inputTokens: number; outputTokens: number
      }> {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type':      'application/json',
            'x-api-key':         apiKey!,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model:      GENERATION_MODEL,
            max_tokens: 8000,
            stream:     true,
            system: [
              { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
            ],
            messages: [{
              role: 'user',
              content: userPrompt(
                org as Record<string, unknown>,
                contentBlocks,
                funderContext,
                suppliedGuidelines,
                chunkQuestions,
              ),
            }],
          }),
        })
        if (!res.ok || !res.body) {
          const err = await res.json().catch(() => ({})) as { error?: { message?: string } }
          throw new Error(err.error?.message ?? res.statusText)
        }
        const decoder = new TextDecoder()
        const reader = res.body.getReader()
        let text = ''
        let inputTokens = 0
        let outputTokens = 0
        let sseBuffer = ''
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          sseBuffer += decoder.decode(value, { stream: true })
          const lines = sseBuffer.split('\n')
          sseBuffer = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const payload = line.slice(6).trim()
            if (!payload || payload === '[DONE]') continue
            let evt: Record<string, unknown>
            try { evt = JSON.parse(payload) } catch { continue }
            const type = evt.type as string
            if (type === 'message_start') {
              const usage = (evt.message as { usage?: { input_tokens?: number } })?.usage
              inputTokens = usage?.input_tokens ?? 0
            } else if (type === 'content_block_delta') {
              const delta = (evt.delta as { type?: string; text?: string }) ?? {}
              if (delta.type === 'text_delta' && delta.text) {
                text += delta.text
                send({ t: 'delta', c: chunkIdx, text: delta.text })
              }
            } else if (type === 'message_delta') {
              const usage = (evt.usage as { output_tokens?: number }) ?? {}
              if (typeof usage.output_tokens === 'number') outputTokens = usage.output_tokens
            }
          }
        }
        return { text, inputTokens, outputTokens }
      }

      try {
        const results = await Promise.all(chunks.map((c, i) => runChunk(c, i)))

        // ── Validate each chunk + merge in order (stream-then-validate) ──
        let inputTokens = 0
        let outputTokens = 0
        const allGenerated: (GeneratedQuestion | undefined)[] = []
        for (const r of results) {
          inputTokens += r.inputTokens
          outputTokens += r.outputTokens
          let cleaned = r.text.trim()
            .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim()
          if (!cleaned.startsWith('{')) {
            const match = cleaned.match(/\{[\s\S]*\}/)
            cleaned = match ? match[0] : cleaned
          }
          let chunkQuestions: GeneratedQuestion[] = []
          try {
            // Hard design rule: no em dashes in product copy, enforced
            // deterministically on the model output.
            const parsed = JSON.parse(cleaned.replace(/\s*—\s*/g, ', '))
            const result = GenerationResultSchema.safeParse(parsed)
            if (result.success) chunkQuestions = result.data.questions
          } catch { /* chunk failed validation — its questions stay unscaffolded */ }
          allGenerated.push(...chunkQuestions)
        }

        if (allGenerated.filter(Boolean).length === 0) {
          send({ t: 'error', message: 'The scaffold came back malformed. Try generating again' })
          controller.close()
          return
        }

        // Merge generated scaffolds onto the stored questions by order
        // (each chunk returns its questions in the order given).
        const merged: ApplicationQuestion[] = questions.map((q, i) => {
          const gen = allGenerated[i]
          if (!gen) return q
          return {
            ...q,
            scaffold: gen.scaffold,
            mapped_content: gen.mapped_content,
            gaps: gen.gaps.map(g => ({ ...g, dismissed: false })),
          }
        })

        const { error: saveError } = await supabase
          .from('applications')
          .update({ questions: merged, status: 'in_progress', updated_at: new Date().toISOString() })
          .eq('id', app.id)

        if (saveError) {
          send({ t: 'error', message: `Could not save the scaffolds: ${saveError.message}` })
          controller.close()
          return
        }

        // ── Capture events (cost instrumentation is first-class) ──
        const durationMs = Date.now() - started
        await emitEvent(
          { surface: 'app', orgId: app.org_id, userId: user.id },
          'builder_scaffold_generated',
          {
            application_id: app.id,
            model: GENERATION_MODEL,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            duration_ms: durationMs,
          },
        )
        const gapTypes = Array.from(new Set(merged.flatMap(q => (q.gaps ?? []).map(g => g.gap_type))))
        if (gapTypes.length > 0) {
          await emitEvent(
            { surface: 'app', orgId: app.org_id, userId: user.id },
            'builder_gap_flagged',
            { application_id: app.id, gap_types: gapTypes },
          )
        }

        send({ t: 'done', questions: merged })
        controller.close()
      } catch (err) {
        send({ t: 'error', message: err instanceof Error ? err.message : 'Generation stream failed' })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache',
      // Discourage any proxy/CDN from buffering the stream — first-card
      // latency depends on chunks reaching the browser as they generate.
      'X-Accel-Buffering': 'no',
    },
  })
}
