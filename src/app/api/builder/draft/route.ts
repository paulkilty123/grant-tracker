// POST /api/builder/draft — per-question guided draft (builder v0.x).
// Composition, not creation: the draft is assembled from the organisation's
// OWN blocks and profile, lightly stitched, with visible [ADD: ...]
// placeholders wherever their material runs out. Deliberately unfinished;
// the user's voice is structurally present because the sentences are theirs.
//
// Streams NDJSON like /api/builder/generate:
//   {"t":"delta","text":"..."}  draft text as it generates
//   {"t":"done","draft":"...","voice_prompts":[...]}
//   {"t":"error","message":"..."}
//
// Body: { application_id: string, question_id: string }

import { NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getBuilderUser } from '@/lib/builder/access'
import { emitEvent } from '@/lib/events/emit'
import { projectMaterialBlock, type Project } from '@/lib/builder/projects'
import type { ApplicationQuestion, CoreContentBlock } from '@/lib/builder/types'

export const dynamic     = 'force-dynamic'
export const maxDuration = 120

const DRAFT_MODEL = 'claude-sonnet-4-6'

const VOICE_MARKER = '---VOICE---'

const SYSTEM_PROMPT = `You assemble a STARTING DRAFT of one grant-application answer for a UK charity or social enterprise. This is composition, not creation: you stitch together the organisation's OWN written material. The user finishes it in their voice.

THE RULES, in priority order:
1. THEIR SENTENCES FIRST. Reuse sentences and phrases from the organisation's content blocks and profile wherever they fit, lightly adapted for flow. Match the register of their own writing. The more of the draft that is literally their words, the better.
2. NEVER FABRICATE. No invented numbers, partners, outcomes, names, or history. If their material does not cover something the answer needs, insert a visible placeholder in square brackets: [ADD: one sentence on X, in your words]. Placeholders are the honest seams of the draft.
3. DELIBERATELY UNFINISHED. Draft to roughly 70-80% of the word limit; the remaining space belongs to the user. Do not polish the draft into something submission-ready.
4. PLAIN REGISTER. UK English, sentence case, direct and warm. NEVER use an em dash anywhere; use a comma, colon, or full stop instead. Banned: transformative, empower, journey, passionate, vibrant, innovative solutions, making a difference, and any phrase that smells of machine writing. Funders now screen that out.
5. ANSWER THE QUESTION. Use the scaffold's structure where one is supplied. Respect what the funder context says this funder weights.

OUTPUT FORMAT:
First the draft text only (no heading, no preamble).
Then a line containing exactly ${VOICE_MARKER}
Then a JSON array of 2-3 short voice prompts telling the user how to make the draft theirs (specific, not generic: name the paragraph or placeholder, e.g. "Rewrite the opening line the way you would say it to a neighbour").`

function orgProfileBlock(org: Record<string, unknown>): string {
  const arr = (v: unknown) => (Array.isArray(v) ? (v as unknown[]).join(', ') : '')
  return [
    `Name: ${org.name ?? '(not set)'}`,
    org.mission            ? `Mission: ${org.mission}` : '',
    arr(org.impact_sectors)     ? `Impact sectors: ${arr(org.impact_sectors)}` : '',
    arr(org.beneficiary_groups) ? `Beneficiary groups: ${arr(org.beneficiary_groups)}` : '',
    org.primary_location   ? `Location: ${org.primary_location}` : '',
    org.legal_structure    ? `Legal structure: ${org.legal_structure}` : '',
    arr(org.key_outcomes)  ? `Key outcomes: ${arr(org.key_outcomes)}` : '',
    org.annual_income_band ? `Annual income band: ${org.annual_income_band}` : '',
    org.years_operating    ? `Years operating: ${org.years_operating}` : '',
  ].filter(Boolean).join('\n')
}

function buildFunderContext(g: Record<string, unknown>): string {
  const fb  = (g.funder_brief ?? {}) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  return [
    str(g.title)               ? `Grant: ${str(g.title)}` : '',
    str(g.funder)              ? `Funder: ${str(g.funder)}` : '',
    str(fb.what_they_fund)     ? `What they fund: ${str(fb.what_they_fund)}` : '',
    str(fb.priorities)         ? `Priorities: ${str(fb.priorities)}` : '',
    str(fb.exclusions)         ? `What they will NOT fund: ${str(fb.exclusions)}` : '',
    str(fb.strong_application) ? `What makes a strong application here: ${str(fb.strong_application)}` : '',
    str(fb.funder_tips)        ? `Funder tips: ${str(fb.funder_tips)}` : '',
  ].filter(Boolean).join('\n')
}

export async function POST(req: NextRequest) {
  const user = await getBuilderUser()
  if (!user) {
    return new Response(JSON.stringify({ t: 'error', message: 'The application builder is currently cohort-only' }) + '\n', { status: 403 })
  }
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ t: 'error', message: 'ANTHROPIC_API_KEY not configured' }) + '\n', { status: 500 })
  }

  let body: { application_id?: string; question_id?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ t: 'error', message: 'Invalid JSON body' }) + '\n', { status: 400 })
  }
  if (!body.application_id || !body.question_id) {
    return new Response(JSON.stringify({ t: 'error', message: 'application_id and question_id required' }) + '\n', { status: 400 })
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
  const question = questions.find(q => q.id === body.question_id)
  if (!question) {
    return new Response(JSON.stringify({ t: 'error', message: 'Question not found' }) + '\n', { status: 404 })
  }

  const [{ data: org }, { data: blocks }, grantRes, projRes] = await Promise.all([
    supabase.from('organisations').select('*').eq('id', app.org_id).maybeSingle(),
    supabase.from('org_core_content').select('*').eq('org_id', app.org_id),
    app.opportunity_id
      ? supabase.from('grants_with_funder').select('*').eq('id', app.opportunity_id).maybeSingle()
      : Promise.resolve({ data: null }),
    app.project_id
      ? supabase.from('projects').select('*').eq('id', app.project_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  if (!org) {
    return new Response(JSON.stringify({ t: 'error', message: 'Organisation profile not found' }) + '\n', { status: 404 })
  }

  const contentBlocks = (blocks ?? []) as CoreContentBlock[]
  const funderContext = grantRes.data ? buildFunderContext(grantRes.data as Record<string, unknown>) : ''
  // Project-first phase 3: a linked project's sections feed the draft as
  // primary material (session-client read, cross-org links resolve null).
  const projectBlock = projRes.data ? projectMaterialBlock(projRes.data as Project) : ''
  const scaffoldBlock = question.scaffold && question.scaffold.length > 0
    ? question.scaffold
        .slice().sort((a, b) => a.suggested_order - b.suggested_order)
        .map((s, i) => `${i + 1}. ${s.heading}: ${s.guidance}`)
        .join('\n')
    : ''

  const userPrompt = `THE QUESTION
${question.question_text}
Word limit: ${question.word_limit ?? 'none stated; keep it to a sensible length'}

${scaffoldBlock ? `THE SCAFFOLD (structure the draft this way)\n${scaffoldBlock}\n` : ''}
THE APPLICANT ORGANISATION (profile)
${orgProfileBlock(org as Record<string, unknown>)}

${projectBlock ? `THE PROJECT BEING FUNDED (the applicant's own project; reuse its sentences for project-specific parts of the answer)\n${projectBlock}\n` : ''}
THE ORGANISATION'S OWN WRITTEN MATERIAL (reuse their sentences; this is the source of the draft's voice)
${contentBlocks.length > 0
    ? contentBlocks.map(b => `[${b.block_type}] "${b.title}"\n${b.content}`).join('\n\n---\n\n')
    : 'No content blocks. The draft will be mostly placeholders; say so in the voice prompts and suggest importing a previous application.'}

${funderContext ? `THE FUNDER (verified catalogue entry)\n${funderContext}\n` : ''}${app.supplied_guidelines ? `\nTHE FUNDER'S APPLICATION GUIDANCE (supplied by the applicant, unverified; use it to angle the draft, and if the draft or a voice prompt refers to it, call it "the guidance you supplied", never present it as verified catalogue data)\n${String(app.supplied_guidelines).slice(0, 12000)}\n` : ''}`

  const started = Date.now()

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      DRAFT_MODEL,
      max_tokens: 4000,
      stream:     true,
      system:     [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages:   [{ role: 'user', content: userPrompt }],
    }),
  })

  if (!anthropicRes.ok || !anthropicRes.body) {
    const err = await anthropicRes.json().catch(() => ({})) as { error?: { message?: string } }
    return new Response(
      JSON.stringify({ t: 'error', message: `Draft failed (${err.error?.message ?? anthropicRes.statusText})` }) + '\n',
      { status: 502 },
    )
  }

  const upstream = anthropicRes.body
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))

      let fullText = ''
      let inputTokens = 0
      let outputTokens = 0
      let sseBuffer = ''
      const reader = upstream.getReader()
      try {
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
                fullText += delta.text
                send({ t: 'delta', text: delta.text })
              }
            } else if (type === 'message_delta') {
              const usage = (evt.usage as { output_tokens?: number }) ?? {}
              if (typeof usage.output_tokens === 'number') outputTokens = usage.output_tokens
            }
          }
        }

        // Split the draft from the voice prompts. Em dashes scrubbed
        // deterministically (hard design rule, not trusted to the prompt).
        fullText = fullText.replace(/\s*—\s*/g, ', ')
        const markerIdx = fullText.indexOf(VOICE_MARKER)
        const draft = (markerIdx === -1 ? fullText : fullText.slice(0, markerIdx)).trim()
        let voicePrompts: string[] = []
        if (markerIdx !== -1) {
          const tail = fullText.slice(markerIdx + VOICE_MARKER.length).trim()
          try {
            const parsed = JSON.parse(tail.replace(/^```json\s*/i, '').replace(/\s*```$/, ''))
            if (Array.isArray(parsed)) voicePrompts = parsed.filter((p): p is string => typeof p === 'string')
          } catch { /* prompts are a nice-to-have */ }
        }

        if (!draft) {
          send({ t: 'error', message: 'The draft came back empty. Try again' })
          controller.close()
          return
        }

        await emitEvent(
          { surface: 'app', orgId: app.org_id, userId: user.id },
          'builder_answer_drafted',
          {
            application_id: app.id,
            question_id: question.id,
            model: DRAFT_MODEL,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            duration_ms: Date.now() - started,
          },
        )

        send({ t: 'done', draft, voice_prompts: voicePrompts })
        controller.close()
      } catch (err) {
        send({ t: 'error', message: err instanceof Error ? err.message : 'Draft stream failed' })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  })
}
