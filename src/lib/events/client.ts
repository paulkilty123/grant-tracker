// Browser-side event emitter for the capture layer. Fire-and-forget POST to
// /api/events — callers never await this and the user is never blocked on a
// capture write. keepalive lets the request survive a navigation (e.g. a
// click-through to a grant page right after opportunity_viewed fires).
//
// Clients never write the events table directly: the server route validates
// the session + taxonomy and inserts with the service role.

import type { EventPayloads, EventType } from './taxonomy'

/** Event types a browser client is allowed to emit. Server-originated types
 *  (MCP, builder generation internals) are rejected by the API route. */
export type ClientEventType = Extract<
  EventType,
  | 'search_executed'
  | 'results_shown'
  | 'opportunity_viewed'
  | 'opportunity_saved'
  | 'opportunity_dismissed'
  | 'pipeline_added'
  | 'pipeline_removed'
  | 'pipeline_stage_changed'
  | 'profile_updated'
  | 'builder_path_chosen'
  | 'project_match_run'
>

export function emitClientEvent<T extends ClientEventType>(
  orgId: string | null,
  eventType: T,
  payload: EventPayloads[T],
): void {
  try {
    void fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({ org_id: orgId, event_type: eventType, payload }),
    }).catch(() => {
      // Capture is best-effort; never surface to the user.
    })
  } catch {
    // Same: a lost event is acceptable, a broken interaction is not.
  }
}
