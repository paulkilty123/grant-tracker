// POST /api/events — capture-layer ingestion for client-originated events.
// Validates the session and the taxonomy, then inserts with the service role
// (clients never touch the events table directly). Responses are intentionally
// small and fast; the client fires-and-forgets.
//
// Taxonomy: src/lib/events/taxonomy.ts   Schema: migrations/024_events.sql

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { emitEvent } from '@/lib/events/emit'
import { isKnownEventType, validateEvent, type EventType, type EventPayloads } from '@/lib/events/taxonomy'

export const dynamic = 'force-dynamic'

// Only user-action events may arrive from the browser. Server-originated
// types (mcp_tool_called, builder_*, data_exported) are emitted by their own
// server routes and rejected here.
const CLIENT_ALLOWED: ReadonlySet<string> = new Set([
  'search_executed',
  'results_shown',
  'opportunity_viewed',
  'opportunity_saved',
  'opportunity_dismissed',
  'pipeline_added',
  'pipeline_stage_changed',
  'profile_updated',
])

const isDev = process.env.NODE_ENV !== 'production'

function reject(reason: string): NextResponse {
  console.error(`[events:api] dropped event: ${reason}`)
  // Fail loudly in dev; log-and-drop in prod (client fired-and-forgot anyway).
  return isDev
    ? NextResponse.json({ error: reason }, { status: 400 })
    : new NextResponse(null, { status: 204 })
}

export async function POST(req: NextRequest) {
  let body: { org_id?: string | null; event_type?: string; payload?: unknown }
  try {
    body = await req.json()
  } catch {
    return reject('invalid JSON body')
  }

  const eventType = body.event_type ?? ''
  if (!CLIENT_ALLOWED.has(eventType) || !isKnownEventType(eventType)) {
    return reject(`event_type "${eventType}" not permitted from client`)
  }
  const problem = validateEvent(eventType, body.payload)
  if (problem) return reject(problem)

  // Session check — anonymous browsers don't write capture events.
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return reject('no session')

  // Org scoping: trust the claimed org only if this user owns it. When the
  // client doesn't know its org (e.g. the grant-detail view tracker), resolve
  // it from the session so events stay org-attributed wherever possible.
  let orgId: string | null = null
  if (body.org_id) {
    const { data: org } = await supabase
      .from('organisations')
      .select('id')
      .eq('id', body.org_id)
      .eq('owner_id', user.id)
      .maybeSingle()
    orgId = org?.id ?? null
    if (!orgId) return reject('org_id does not belong to session user')
  } else {
    const { data: org } = await supabase
      .from('organisations')
      .select('id')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    orgId = org?.id ?? null
  }

  await emitEvent(
    { surface: 'app', orgId, userId: user.id },
    eventType as EventType,
    body.payload as EventPayloads[EventType],
  )
  return new NextResponse(null, { status: 204 })
}
