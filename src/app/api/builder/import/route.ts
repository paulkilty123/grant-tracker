// POST /api/builder/import — previous-application import (builder v0.x).
// The content-bank cold start: a past application holds the org's voice,
// numbers and stories, already written. One fast-model call splits the paste
// into proposed typed blocks (VERBATIM chunks, their words untouched); the
// user reviews before anything lands in the bank.
//
// Two actions in one route:
//   { raw_text }  -> { blocks: proposed blocks } (nothing persisted)
//   { blocks }    -> inserts confirmed blocks, emits builder_content_imported
//                    -> { created: n }

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getBuilderUser } from '@/lib/builder/access'
import { emitEvent } from '@/lib/events/emit'
import { BLOCK_TYPES, ImportProposalSchema, type BlockType } from '@/lib/builder/types'

export const dynamic     = 'force-dynamic'
export const maxDuration = 120

const IMPORT_MODEL = 'claude-haiku-4-5'

const IMPORT_PROMPT = `You split a previous grant application into reusable content blocks for the organisation's content library.

Rules:
- Each block's content must be VERBATIM text from the paste. Do not rewrite, summarise, improve, or merge sentences. You are chunking their words, not editing them. Light trimming of form labels and question text at chunk edges is fine.
- Choose the best-fitting block_type for each chunk from exactly this list: ${BLOCK_TYPES.join(', ')}.
- Give each block a short descriptive title (their topic, not the funder's question).
- Skip answers that are application-specific administrivia (declarations, bank details, contact info, signatures).
- Aim for substantial, reusable chunks: a paragraph to a few paragraphs each. Typically 4-10 blocks from a full application.

Return ONLY a JSON object: {"blocks":[{"block_type":"...","title":"...","content":"..."}]} with no markdown fences.`

export async function POST(req: NextRequest) {
  const user = await getBuilderUser()
  if (!user) return NextResponse.json({ error: 'The application builder is currently cohort-only' }, { status: 403 })

  let body: {
    raw_text?: string
    blocks?: { block_type?: string; title?: string; content?: string }[]
    org_id?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const supabase = await createServerClient()

  // ── Action 2: insert confirmed blocks ──
  if (Array.isArray(body.blocks)) {
    if (!body.org_id) return NextResponse.json({ error: 'org_id required' }, { status: 400 })
    const clean = body.blocks
      .filter(b => b.title?.trim() && b.content?.trim())
      .map(b => ({
        org_id: body.org_id,
        block_type: ((BLOCK_TYPES as readonly string[]).includes(b.block_type ?? '') ? b.block_type : 'other') as BlockType,
        title: b.title!.trim(),
        content: b.content!.trim(),
        source: 'imported_from_application' as const,
      }))
    if (clean.length === 0) return NextResponse.json({ error: 'No blocks to add' }, { status: 400 })

    const { data: created, error } = await supabase
      .from('org_core_content')
      .insert(clean)
      .select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await emitEvent(
      { surface: 'app', orgId: body.org_id, userId: user.id },
      'builder_content_imported',
      {
        method: 'paste',
        block_count: clean.length,
        block_types: Array.from(new Set(clean.map(b => b.block_type))),
      },
    )
    return NextResponse.json({ created: created?.length ?? clean.length })
  }

  // ── Action 1: propose blocks from a paste ──
  const rawText = (body.raw_text ?? '').trim()
  if (rawText.length < 100) {
    return NextResponse.json({ error: 'Paste the previous application first (it looks too short)' }, { status: 400 })
  }
  if (rawText.length > 60_000) {
    return NextResponse.json({ error: 'That paste is very long. Trim it to the written answers' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })

  let text: string
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      IMPORT_MODEL,
        max_tokens: 8000,
        system:     IMPORT_PROMPT,
        messages:   [{ role: 'user', content: rawText }],
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { message?: string } }
      return NextResponse.json({ error: `Import failed (${err.error?.message ?? res.statusText})` }, { status: 502 })
    }
    const data = await res.json() as { content?: { type: string; text: string }[] }
    text = (data.content?.[0]?.text ?? '').trim()
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Import request failed' }, { status: 502 })
  }

  text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim()
  if (!text.startsWith('{')) {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return NextResponse.json({ error: 'Could not split that into blocks. Try a cleaner paste' }, { status: 502 })
    text = match[0]
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: 'Could not split that into blocks. Try a cleaner paste' }, { status: 502 })
  }
  const result = ImportProposalSchema.safeParse(parsed)
  if (!result.success) {
    return NextResponse.json({ error: 'No reusable content found in that paste' }, { status: 422 })
  }

  return NextResponse.json(result.data)
}
