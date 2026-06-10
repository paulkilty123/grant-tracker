// POST /api/builder/bank — the accrual loop (builder v0, spec B3 step 6).
// Banks a finished answer as a reusable content block, so every application
// makes the next one easier and the org model richer. This is the strategic
// point of the builder, not a nice-to-have.
//
// Body: { application_id: string, question_id: string, block_type: string, title: string }
// Returns: { block_id: string }

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getBuilderUser } from '@/lib/builder/access'
import { emitEvent } from '@/lib/events/emit'
import { BLOCK_TYPES, type ApplicationQuestion, type BlockType } from '@/lib/builder/types'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const user = await getBuilderUser()
  if (!user) return NextResponse.json({ error: 'The application builder is currently cohort-only' }, { status: 403 })

  let body: { application_id?: string; question_id?: string; block_type?: string; title?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body.application_id || !body.question_id) {
    return NextResponse.json({ error: 'application_id and question_id required' }, { status: 400 })
  }
  const blockType = (BLOCK_TYPES as readonly string[]).includes(body.block_type ?? '')
    ? (body.block_type as BlockType)
    : 'other'

  const supabase = await createServerClient()
  const { data: app } = await supabase
    .from('applications')
    .select('id, org_id, funder_name, grant_name, questions')
    .eq('id', body.application_id)
    .maybeSingle()
  if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 })

  const questions = (app.questions ?? []) as ApplicationQuestion[]
  const question = questions.find(q => q.id === body.question_id)
  if (!question) return NextResponse.json({ error: 'Question not found' }, { status: 404 })
  if (!question.user_answer.trim()) {
    return NextResponse.json({ error: 'Write the answer before saving it to your material' }, { status: 400 })
  }

  const title = body.title?.trim()
    || `${question.question_text.slice(0, 60)}${question.question_text.length > 60 ? '…' : ''}`

  const { data: block, error: insertError } = await supabase
    .from('org_core_content')
    .insert({
      org_id: app.org_id,
      block_type: blockType,
      title,
      content: question.user_answer.trim(),
      source: 'banked_from_application',
    })
    .select('id')
    .single()
  if (insertError || !block) {
    return NextResponse.json({ error: insertError?.message ?? 'Could not bank the answer' }, { status: 500 })
  }

  // Merge-on-write: re-read so an autosave during the insert is preserved.
  const { data: freshRow } = await supabase
    .from('applications')
    .select('questions')
    .eq('id', app.id)
    .maybeSingle()
  const freshQuestions = (freshRow?.questions ?? questions) as ApplicationQuestion[]
  const updatedQuestions = freshQuestions.map(q =>
    q.id === body.question_id ? { ...q, answer_banked: true } : q)
  await supabase
    .from('applications')
    .update({ questions: updatedQuestions, updated_at: new Date().toISOString() })
    .eq('id', app.id)

  await emitEvent(
    { surface: 'app', orgId: app.org_id, userId: user.id },
    'builder_answer_banked',
    { application_id: app.id, block_type: blockType },
  )

  return NextResponse.json({ block_id: block.id })
}
