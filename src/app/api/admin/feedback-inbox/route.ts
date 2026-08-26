import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, isAdminBearerToken } from '@/lib/auth/require-admin'
import { getAdminDb } from '@/lib/admin/admin-db'

export const dynamic = 'force-dynamic'

/**
 * Admin inbox for the in-app Feedback form (the `feedback` table).
 *
 * This is the "place to write it" half of replacing the status chip with a
 * reply. Without it the reply column would be exactly the dead end the chip
 * was: a thing the UI can render and nothing can ever set.
 *
 * GET  — every submission, newest first, with any reply already written.
 * POST — write, edit or clear the reply on one submission.
 *
 * Note this is a different table from /api/admin/feedback, which serves
 * `match_feedback` (the thumbs up/down on individual grants).
 */

async function isAuthorised(req: NextRequest): Promise<boolean> {
  if (isAdminBearerToken(req.headers.get('authorization'))) return true
  const auth = await requireAdmin()
  return auth.ok
}

const COLUMNS = 'id, created_at, type, message, extra, email, user_id, response, response_label, responded_at'

export async function GET(req: NextRequest) {
  if (!(await isAuthorised(req))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await getAdminDb()
    .from('feedback')
    .select(COLUMNS)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rows: data ?? [] })
}

export async function POST(req: NextRequest) {
  if (!(await isAuthorised(req))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body.id !== 'string') {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const response = typeof body.response === 'string' ? body.response.trim() : ''
  const label    = typeof body.response_label === 'string' ? body.response_label.trim() : ''

  // An empty reply clears the row rather than writing a blank one, so a reply
  // sent by mistake can be taken back off the submitter's screen.
  const patch = response.length > 0
    ? { response, response_label: label || null, responded_at: new Date().toISOString() }
    : { response: null, response_label: null, responded_at: null }

  const { data, error } = await getAdminDb()
    .from('feedback')
    .update(patch)
    .eq('id', body.id)
    .select(COLUMNS)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'No submission with that id' }, { status: 404 })
  }

  return NextResponse.json({ row: data[0] })
}
