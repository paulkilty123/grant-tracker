// Server-side event emitter for the capture layer. Service-role insert into
// public.events, guarded so a logging failure can never break a request.
// Follows the proven mcp-query-log pattern: awaited (not detached) so the
// write flushes inside the serverless function, but fully wrapped — the
// request path never sees an error from here.
//
// Taxonomy + validation: src/lib/events/taxonomy.ts
// Schema: supabase/migrations/024_events.sql

import { createClient } from '@supabase/supabase-js'
import {
  SCHEMA_VERSION,
  validateEvent,
  type EventPayloads,
  type EventSurface,
  type EventType,
} from './taxonomy'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export interface EmitContext {
  surface: EventSurface
  orgId?: string | null
  userId?: string | null
}

/**
 * Emit one event. Never throws in production (logs and drops); throws in dev
 * on a malformed payload so taxonomy violations surface immediately.
 */
export async function emitEvent<T extends EventType>(
  ctx: EmitContext,
  eventType: T,
  payload: EventPayloads[T],
): Promise<void> {
  const problem = validateEvent(eventType, payload)
  if (problem) {
    console.error(`[events] dropped malformed event: ${problem}`)
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(`[events] ${problem}`)
    }
    return
  }
  try {
    const sb = getServiceClient()
    const { error } = await sb.from('events').insert({
      org_id:         ctx.orgId ?? null,
      user_id:        ctx.userId ?? null,
      surface:        ctx.surface,
      event_type:     eventType,
      schema_version: SCHEMA_VERSION,
      payload,
    })
    if (error) console.error(`[events] insert failed for ${eventType}: ${error.message}`)
  } catch (err) {
    // Capture is best-effort. A lost event is acceptable; a broken request is not.
    console.error(`[events] insert threw for ${eventType}:`, err)
  }
}
