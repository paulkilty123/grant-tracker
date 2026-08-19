// POST /api/projects/extract — project-first phase 2.
// One fast-model call turns a free-text project description (typed or pasted)
// into the structured project sections + relevance tags, then creates the
// project row. The user reviews/edits the extraction on the project page —
// same cheap-correction-point pattern as the question parse.
//
// Body: { org_id: string, raw_text: string, budget_hint?: number | null }
// Returns: { id: string, completeness: number }

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getBuilderUser } from '@/lib/builder/access'
import { emitEvent } from '@/lib/events/emit'
import { projectCompleteness, type Project } from '@/lib/builder/projects'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60

const EXTRACT_MODEL = 'claude-haiku-4-5'

// Canonical taxonomy slugs — must match src/types/index.ts exactly so the
// extracted tags flow straight into computeMatchScore without translation.
const SECTOR_SLUGS = [
  'creative', 'environment', 'health', 'mental_health', 'education', 'tech',
  'housing', 'food', 'employment', 'community', 'justice', 'financial',
  'international', 'young_people', 'women', 'disability', 'older_people',
  'heritage', 'sport', 'social_economy', 'social_innovation',
] as const

const BENEFICIARY_SLUGS = [
  'children', 'young_people', 'older_people', 'families', 'women_girls',
  'men_boys', 'lgbtq', 'ethnic_minorities', 'refugees_migrants',
  'disabled_people', 'mental_health', 'carers', 'veterans', 'ex_offenders',
  'homeless', 'people_in_poverty', 'rural_communities', 'general_public',
] as const

const ExtractSchema = z.object({
  name:                z.string().min(1).max(120),
  type_label:          z.enum(['project', 'campaign', 'programme']).catch('project'),
  what_it_will_do:     z.string().nullable().catch(null),
  who_benefits:        z.string().nullable().catch(null),
  difference_it_makes: z.string().nullable().catch(null),
  duration:            z.string().nullable().catch(null),
  outreach:            z.string().nullable().catch(null),
  learning:            z.string().nullable().catch(null),
  budget_amount:       z.number().int().positive().nullable().catch(null),
  sectors:             z.array(z.enum(SECTOR_SLUGS)).catch([]),
  beneficiary_groups:  z.array(z.enum(BENEFICIARY_SLUGS)).catch([]),
})

const EXTRACT_PROMPT = `You extract a structured project record from a free-text description of a charity or social-enterprise project. The description may be a rough note or a polished paste from an old document.

Rules:
- Use ONLY what the text actually says. Never invent activities, numbers, or outcomes. A field with no real support in the text must be null. It is correct and expected to return null for most fields when the description is short.
- Keep the writer's own voice and facts; you may tidy grammar lightly but never add new claims.
- name: a short working title for the project (under 8 words). If the text names the project, use that name verbatim; otherwise derive a plain descriptive one from the activity (e.g. "Youth football coaching programme").
- type_label: "campaign" only if it is clearly a time-bound awareness/fundraising campaign; "programme" if it is an ongoing multi-strand service; otherwise "project".
- what_it_will_do: the core activity — what happens, where, how often.
- who_benefits: who it serves AND any evidence of need the text gives.
- difference_it_makes: the intended change or outcomes.
- duration: how long it runs (e.g. "12 months", "3-year programme"), only if stated.
- outreach: how participants will hear about it, only if stated.
- learning: how they will evaluate or learn from it, only if stated.
- budget_amount: the amount of funding sought in whole pounds, only if a figure is stated. Convert "£15k" to 15000. If several figures appear, use the total project cost or amount sought, not per-item costs.
- sectors: 1-3 slugs from exactly this list that describe the project's themes: ${SECTOR_SLUGS.join(', ')}. Choose the closest fits; never output a slug not on the list.
- beneficiary_groups: 0-3 slugs from exactly this list for who benefits: ${BENEFICIARY_SLUGS.join(', ')}. Only tag groups the text actually identifies; do not default to general_public unless the text says it is open to everyone.
- Never use em dashes in any text you return.

Return ONLY a JSON object with keys: name, type_label, what_it_will_do, who_benefits, difference_it_makes, duration, outreach, learning, budget_amount, sectors, beneficiary_groups. No markdown fences, no other text.`

// House style: no em dashes anywhere in user-facing text (deterministic scrub,
// same rule as the generation routes).
const scrub = (s: string | null) => (s ? s.replace(/\s*—\s*/g, ', ').trim() || null : null)

export async function POST(req: NextRequest) {
  const user = await getBuilderUser()
  if (!user) return NextResponse.json({ error: 'Projects are not switched on for this organisation' }, { status: 403 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })

  let body: { org_id?: string; raw_text?: string; budget_hint?: number | null }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body.org_id) {
    return NextResponse.json({ error: 'An organisation profile is required' }, { status: 400 })
  }
  const rawText = (body.raw_text ?? '').trim()
  if (rawText.length < 30) {
    return NextResponse.json({ error: 'Describe the project in a sentence or two first' }, { status: 400 })
  }
  if (rawText.length > 40_000) {
    return NextResponse.json({ error: 'That description is too long. Trim it to the project itself' }, { status: 400 })
  }
  const budgetHint =
    typeof body.budget_hint === 'number' && Number.isFinite(body.budget_hint) && body.budget_hint > 0
      ? Math.round(body.budget_hint)
      : null

  // Session client — RLS enforces org ownership on the insert below, and the
  // org read here confirms the claimed org belongs to this user.
  const supabase = await createServerClient()
  const { data: org } = await supabase
    .from('organisations')
    .select('id, name, mission, impact_sectors, beneficiary_groups')
    .eq('id', body.org_id)
    .maybeSingle()
  if (!org) return NextResponse.json({ error: 'Organisation not found' }, { status: 404 })

  // Light org context so pronouns ("we", "our members") resolve correctly.
  // Deliberately thin: the project's tags must come from the project text,
  // not be parroted from the org profile.
  const orgContext = [
    `Organisation: ${org.name ?? 'unknown'}`,
    org.mission ? `Mission: ${String(org.mission).slice(0, 400)}` : null,
  ].filter(Boolean).join('\n')

  let text: string
  let usage: { input_tokens?: number; output_tokens?: number } = {}
  const started = Date.now()
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      EXTRACT_MODEL,
        max_tokens: 3000,
        system:     EXTRACT_PROMPT,
        messages:   [{
          role: 'user',
          content: `${orgContext}\n\nProject description:\n${rawText}`,
        }],
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { message?: string } }
      return NextResponse.json(
        { error: `Could not read the description (${err.error?.message ?? res.statusText})` },
        { status: 502 },
      )
    }
    const data = await res.json() as {
      content?: { type: string; text: string }[]
      usage?: { input_tokens?: number; output_tokens?: number }
    }
    text = (data.content?.[0]?.text ?? '').trim()
    usage = data.usage ?? {}
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Extraction request failed' },
      { status: 502 },
    )
  }

  text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim()
  if (!text.startsWith('{')) {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return NextResponse.json({ error: 'Could not read that description. Try rewording it' }, { status: 502 })
    text = match[0]
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: 'Could not read that description. Try rewording it' }, { status: 502 })
  }
  const result = ExtractSchema.safeParse(parsed)
  if (!result.success) {
    return NextResponse.json({ error: 'Could not extract the project from that description' }, { status: 422 })
  }
  const e = result.data

  const row = {
    org_id:              org.id,
    name:                scrub(e.name) ?? 'Untitled project',
    type_label:          e.type_label,
    status:              'active',
    description_raw:     rawText,
    what_it_will_do:     scrub(e.what_it_will_do),
    who_benefits:        scrub(e.who_benefits),
    difference_it_makes: scrub(e.difference_it_makes),
    duration:            scrub(e.duration),
    outreach:            scrub(e.outreach),
    learning:            scrub(e.learning),
    // The explicit budget field on the form wins over anything extracted.
    budget_amount:       budgetHint ?? e.budget_amount,
    sectors:             Array.from(new Set(e.sectors)).slice(0, 3),
    beneficiary_groups:  Array.from(new Set(e.beneficiary_groups)).slice(0, 3),
  }

  const { data: inserted, error: insertError } = await supabase
    .from('projects')
    .insert(row)
    .select('*')
    .single()
  if (insertError || !inserted) {
    return NextResponse.json({ error: insertError?.message ?? 'Could not save the project' }, { status: 500 })
  }

  const completeness = projectCompleteness(inserted as Project)

  await Promise.all([
    emitEvent({ surface: 'app', orgId: org.id, userId: user.id }, 'project_created', {
      project_id: inserted.id,
      completeness,
    }),
    emitEvent({ surface: 'app', orgId: org.id, userId: user.id }, 'builder_parse_run', {
      kind: 'project',
      application_id: null,
      model: EXTRACT_MODEL,
      input_tokens: usage.input_tokens ?? 0,
      output_tokens: usage.output_tokens ?? 0,
      duration_ms: Date.now() - started,
    }),
  ])

  return NextResponse.json({ id: inserted.id, completeness })
}
