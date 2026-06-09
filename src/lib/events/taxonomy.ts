// Event taxonomy v1 — the single source of truth for the capture layer.
// One typed payload interface per event type, plus runtime validation.
//
// Rules (build spec A3):
// - Adding a new event type is fine; changing a payload shape requires
//   bumping SCHEMA_VERSION and handling both shapes downstream.
// - Payloads carry no free-text PII beyond what the user typed as a query.
//   Never log auth tokens, emails, or full conversation text.
// - opportunity ids are ALWAYS the catalogue UUID (scraped_grants.id), never
//   the normalised grant.id (which is external_id ?? id — the match_feedback
//   trap). Use toCatalogueUuid() at call sites that hold a normalised id.
//
// Schema: supabase/migrations/024_events.sql

export const SCHEMA_VERSION = 1

export type EventSurface = 'app' | 'mcp' | 'email'

// ── Payload shapes ─────────────────────────────────────────────────────────

export interface EventPayloads {
  search_executed: {
    query_text: string
    filters: Record<string, unknown>
    result_count: number
  }
  results_shown: {
    opportunity_ids: string[]
    context: 'search' | 'matches' | 'mcp'
  }
  opportunity_viewed: {
    opportunity_id: string
    source: string
  }
  opportunity_saved: {
    opportunity_id: string
  }
  opportunity_dismissed: {
    opportunity_id: string
    reason: string | null
  }
  // Deviation from spec v1 (documented): pipeline_items has no catalogue FK
  // and manual/off-catalogue adds are common, so opportunity_id is nullable
  // and pipeline_item_id is carried so events can be joined to the CRM row.
  pipeline_added: {
    opportunity_id: string | null
    pipeline_item_id: string
  }
  pipeline_stage_changed: {
    opportunity_id: string | null
    pipeline_item_id: string
    from_stage: string
    to_stage: string
  }
  mcp_tool_called: {
    tool_name: string
    arguments: Record<string, unknown>
    result_count: number | null
    duration_ms: number
    /** Optional caller segmentation, mirroring mcp_query_log. Not PII. */
    channel?: string
    auth_state?: string
  }
  profile_updated: {
    fields_changed: string[]
  }
  builder_questions_submitted: {
    application_id: string
    question_count: number
    opportunity_id: string | null
  }
  builder_scaffold_generated: {
    application_id: string
    model: string
    input_tokens: number
    output_tokens: number
    duration_ms: number
  }
  builder_gap_flagged: {
    application_id: string
    gap_types: string[]
  }
  builder_eligibility_warning: {
    application_id: string
    opportunity_id: string
    warning_codes: string[]
  }
  builder_answer_banked: {
    application_id: string
    block_type: string
  }
  data_exported: {
    export_type: string
  }
}

export type EventType = keyof EventPayloads

export const EVENT_TYPES = [
  'search_executed',
  'results_shown',
  'opportunity_viewed',
  'opportunity_saved',
  'opportunity_dismissed',
  'pipeline_added',
  'pipeline_stage_changed',
  'mcp_tool_called',
  'profile_updated',
  'builder_questions_submitted',
  'builder_scaffold_generated',
  'builder_gap_flagged',
  'builder_eligibility_warning',
  'builder_answer_banked',
  'data_exported',
] as const satisfies readonly EventType[]

// ── Runtime validation ─────────────────────────────────────────────────────
// Required keys per event type, with a lightweight kind check. Enough to make
// a malformed payload fail loudly in dev and log-and-drop in prod, without
// pulling a schema library into every call site.

type Kind = 'string' | 'number' | 'boolean' | 'object' | 'string[]' | 'nullable-string' | 'nullable-number'

const REQUIRED_KEYS: Record<EventType, Record<string, Kind>> = {
  search_executed:             { query_text: 'string', filters: 'object', result_count: 'number' },
  results_shown:               { opportunity_ids: 'string[]', context: 'string' },
  opportunity_viewed:          { opportunity_id: 'string', source: 'string' },
  opportunity_saved:           { opportunity_id: 'string' },
  opportunity_dismissed:       { opportunity_id: 'string', reason: 'nullable-string' },
  pipeline_added:              { opportunity_id: 'nullable-string', pipeline_item_id: 'string' },
  pipeline_stage_changed:      { opportunity_id: 'nullable-string', pipeline_item_id: 'string', from_stage: 'string', to_stage: 'string' },
  mcp_tool_called:             { tool_name: 'string', arguments: 'object', result_count: 'nullable-number', duration_ms: 'number' },
  profile_updated:             { fields_changed: 'string[]' },
  builder_questions_submitted: { application_id: 'string', question_count: 'number', opportunity_id: 'nullable-string' },
  builder_scaffold_generated:  { application_id: 'string', model: 'string', input_tokens: 'number', output_tokens: 'number', duration_ms: 'number' },
  builder_gap_flagged:         { application_id: 'string', gap_types: 'string[]' },
  builder_eligibility_warning: { application_id: 'string', opportunity_id: 'string', warning_codes: 'string[]' },
  builder_answer_banked:       { application_id: 'string', block_type: 'string' },
  data_exported:               { export_type: 'string' },
}

function kindOk(value: unknown, kind: Kind): boolean {
  switch (kind) {
    case 'string':          return typeof value === 'string'
    case 'number':          return typeof value === 'number' && Number.isFinite(value)
    case 'boolean':         return typeof value === 'boolean'
    case 'object':          return typeof value === 'object' && value !== null && !Array.isArray(value)
    case 'string[]':        return Array.isArray(value) && value.every(v => typeof v === 'string')
    case 'nullable-string': return value === null || typeof value === 'string'
    case 'nullable-number': return value === null || (typeof value === 'number' && Number.isFinite(value))
  }
}

export function isKnownEventType(type: string): type is EventType {
  return (EVENT_TYPES as readonly string[]).includes(type)
}

/** Returns null if valid, else a human-readable reason. */
export function validateEvent(type: string, payload: unknown): string | null {
  if (!isKnownEventType(type)) return `unknown event_type "${type}"`
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return `payload for "${type}" must be an object`
  }
  const shape = REQUIRED_KEYS[type]
  for (const [key, kind] of Object.entries(shape)) {
    const value = (payload as Record<string, unknown>)[key]
    if (value === undefined) return `payload for "${type}" missing required key "${key}"`
    if (!kindOk(value, kind)) return `payload key "${key}" of "${type}" is not ${kind}`
  }
  return null
}

// ── Id discipline ──────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Normalised grants carry id = external_id ?? uuid, and a separate uuid field
 * (grants-normalise sets `uuid` to the scraped_grants.id). Event payloads must
 * always carry the catalogue UUID. Pass whatever id the surface holds plus the
 * grant's uuid field if available; returns the UUID or null when none exists
 * (off-catalogue rows are not loggable as opportunity events).
 */
export function toCatalogueUuid(id: string | null | undefined, uuid?: string | null): string | null {
  if (uuid && UUID_RE.test(uuid)) return uuid
  if (id && UUID_RE.test(id)) return id
  return null
}
