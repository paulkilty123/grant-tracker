// POST /api/builder/applications — create an application from confirmed
// questions (builder v0). Server-side so the cohort gate is enforced and the
// builder_questions_submitted capture event carries the new application id.
//
// Body: {
//   org_id: string
//   opportunity_id?: string | null      // scraped_grants.id (catalogue UUID)
//   grant_name?: string | null
//   funder_name?: string | null
//   questions: { question_text: string; word_limit: number | null }[]
// }
// Returns: { id: string }

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getBuilderUser } from '@/lib/builder/access'
import { emitEvent } from '@/lib/events/emit'
import type { ApplicationQuestion } from '@/lib/builder/types'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  const user = await getBuilderUser()
  if (!user) return NextResponse.json({ error: 'Applications are not switched on for this organisation' }, { status: 403 })

  let body: {
    org_id?: string
    opportunity_id?: string | null
    project_id?: string | null
    pipeline_item_id?: string | null
    project_brief?: string | null
    grant_name?: string | null
    funder_name?: string | null
    questions?: { question_text?: string; word_limit?: number | null }[]
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const questions = (body.questions ?? [])
    .filter(q => typeof q.question_text === 'string' && q.question_text.trim().length > 0)
  if (questions.length === 0) {
    return NextResponse.json({ error: 'Add at least one question' }, { status: 400 })
  }
  if (!body.org_id) {
    return NextResponse.json({ error: 'An organisation profile is required' }, { status: 400 })
  }

  // Session client — RLS enforces org ownership on the insert.
  const supabase = await createServerClient()

  const opportunityId =
    body.opportunity_id && UUID_RE.test(body.opportunity_id) ? body.opportunity_id : null
  // Project link (project-first phase 3). FK checks bypass RLS, so ownership
  // is verified explicitly: the session-client read only sees own-org rows.
  let projectId: string | null = null
  if (body.project_id && UUID_RE.test(body.project_id)) {
    const { data: proj } = await supabase
      .from('projects')
      .select('id')
      .eq('id', body.project_id)
      .eq('org_id', body.org_id)
      .maybeSingle()
    projectId = proj?.id ?? null
  }
  // Pipeline link — when an application is started from a "Ready to start"
  // pipeline item. Verified against the org so it can't link a foreign item.
  let pipelineItemId: string | null = null
  if (body.pipeline_item_id && UUID_RE.test(body.pipeline_item_id)) {
    const { data: pi } = await supabase
      .from('pipeline_items')
      .select('id')
      .eq('id', body.pipeline_item_id)
      .eq('org_id', body.org_id)
      .maybeSingle()
    pipelineItemId = pi?.id ?? null
  }

  const questionRows: ApplicationQuestion[] = questions.map(q => ({
    id: randomUUID(),
    question_text: q.question_text!.trim(),
    word_limit: typeof q.word_limit === 'number' && q.word_limit > 0 ? Math.round(q.word_limit) : null,
    scaffold: null,
    mapped_content: [],
    gaps: [],
    user_answer: '',
    answer_banked: false,
  }))

  const { data: created, error } = await supabase
    .from('applications')
    .insert({
      org_id:           body.org_id,
      opportunity_id:   opportunityId,
      project_id:       projectId,
      pipeline_item_id: pipelineItemId,
      project_brief:    body.project_brief?.trim().slice(0, 8000) || null,
      grant_name:       body.grant_name?.trim() || null,
      funder_name:      body.funder_name?.trim() || null,
      status:           'draft',
      questions:        questionRows,
    })
    .select('id')
    .single()

  if (error || !created) {
    return NextResponse.json({ error: error?.message ?? 'Could not create the application' }, { status: 500 })
  }

  await emitEvent(
    { surface: 'app', orgId: body.org_id, userId: user.id },
    'builder_questions_submitted',
    {
      application_id: created.id,
      question_count: questionRows.length,
      opportunity_id: opportunityId,
    },
  )

  return NextResponse.json({ id: created.id })
}
