// GET /api/builder/export?application_id=... — working document (v0.x).
// Real-world workflow B: most applicants draft in Word or Google Docs, share
// with a colleague or trustee, then transfer into the funder's portal. This
// exports the whole working state as a Word-compatible document: per question
// the answer so far, the guide, open gaps, and the org's mapped material.
// HTML served as .doc opens cleanly in Word and Google Docs.

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getBuilderUser } from '@/lib/builder/access'
import { emitEvent } from '@/lib/events/emit'
import type { ApplicationQuestion } from '@/lib/builder/types'

export const dynamic = 'force-dynamic'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function para(s: string): string {
  return esc(s).split(/\n+/).map(p => `<p>${p}</p>`).join('')
}

export async function GET(req: NextRequest) {
  const user = await getBuilderUser()
  if (!user) return NextResponse.json({ error: 'The application builder is currently cohort-only' }, { status: 403 })

  const applicationId = req.nextUrl.searchParams.get('application_id')
  if (!applicationId) return NextResponse.json({ error: 'application_id required' }, { status: 400 })

  const supabase = await createServerClient()
  const { data: app } = await supabase
    .from('applications')
    .select('*')
    .eq('id', applicationId)
    .maybeSingle()
  if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 })

  const questions = (app.questions ?? []) as ApplicationQuestion[]
  const title = app.grant_name || app.funder_name || 'Application'

  const sections = questions.map((q, i) => {
    const guide = (q.scaffold ?? [])
      .slice().sort((a, b) => a.suggested_order - b.suggested_order)
      .map(s => `<li><b>${esc(s.heading)}.</b> ${esc(s.guidance)}</li>`)
      .join('')
    const gaps = (q.gaps ?? []).filter(g => !g.dismissed)
      .map(g => `<li>${esc(g.description)}${g.severity === 'blocking' ? ' <b>(needed)</b>' : ''}</li>`)
      .join('')
    const material = (q.mapped_content ?? [])
      .map(m => `<li>&ldquo;${esc(m.excerpt)}&rdquo; <i>(${esc(m.relevance_note)})</i></li>`)
      .join('')
    return `
      <h2>Q${i + 1}. ${esc(q.question_text)}</h2>
      ${q.word_limit ? `<p class="meta">Word limit: ${q.word_limit}</p>` : ''}
      <h3>Your answer</h3>
      ${q.user_answer.trim() ? para(q.user_answer) : '<p class="empty">[Write your answer here]</p>'}
      ${guide ? `<h3>Guide: what a strong answer covers</h3><ol>${guide}</ol>` : ''}
      ${gaps ? `<h3>Still missing</h3><ul>${gaps}</ul>` : ''}
      ${material ? `<h3>Your material, ready to use</h3><ul>${material}</ul>` : ''}
      <hr/>`
  }).join('')

  const html = `<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<title>${esc(title)} working document</title>
<style>
  body { font-family: 'Calibri', 'Segoe UI', sans-serif; color: #2C2C2A; line-height: 1.5; max-width: 720px; }
  h1 { font-size: 20pt; color: #173404; }
  h2 { font-size: 14pt; color: #173404; margin-top: 24pt; }
  h3 { font-size: 11pt; color: #3B6D11; text-transform: uppercase; letter-spacing: 0.5pt; margin-bottom: 4pt; }
  p, li { font-size: 11pt; }
  .meta { color: #5F5E5A; font-size: 10pt; }
  .empty { color: #8A8986; font-style: italic; }
  hr { border: none; border-top: 1pt solid #DDD; margin: 18pt 0; }
</style>
</head>
<body>
<h1>${esc(title)}</h1>
<p class="meta">${app.funder_name && app.grant_name ? esc(app.funder_name) + ' · ' : ''}Working document from Grant Tracker, ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.
Anything in [ADD: ...] brackets is a placeholder for your own material. Edit freely; this document is yours.</p>
<hr/>
${sections}
</body>
</html>`

  await emitEvent(
    { surface: 'app', orgId: app.org_id, userId: user.id },
    'data_exported',
    { export_type: 'application_doc' },
  )

  const safeName = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'application'
  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'application/msword',
      'Content-Disposition': `attachment; filename="${safeName}-working-document.doc"`,
    },
  })
}
