// Field provenance merger for scraped_grants.
//
// Every write path that mutates content fields on scraped_grants must go through
// mergeGrantUpdate(). The merger:
//   - stamps provenance (source, set_at, pinned) on every changed tracked field
//   - applies the trust ladder to decide whether to accept incoming writes
//   - preserves admin overrides via the `pinned` flag
//   - lets a source clear its own values (fixes the detect-only-adds anti-pattern)
//   - is idempotent — re-writing the same value by the same source is a no-op
//
// Untracked fields (is_active, url_status, saved_for_later, raw_data, etc.) pass
// through to the UPDATE without provenance — they're metadata, not content.
//
// See docs in CLAUDE.md / Phase A draft for the trust ladder and merger rule.

import type { SupabaseClient } from '@supabase/supabase-js'
import { deriveEquivalentStructures } from '@/lib/structure-equivalents'

// ── Tracked fields ────────────────────────────────────────────────────────────

export const TRACKED_FIELDS = [
  'title',
  'funder',
  'funder_type',
  'funding_type',
  'apply_url',
  'description',
  'amount_min',
  'amount_max',
  'amount_undisclosed',   // affirmative "funder discloses no fixed amount" flag — pinned admin writes only
  'deadline',
  'is_rolling',
  'next_open_date',
  'location_tag',
  'is_local',
  'eligible_structures',
  'impact_sectors',
  'target_beneficiaries',
  'is_invite_only',
  'funder_brief',
  'deadline_cycle',   // v1 — structured cycle dates, replaces prose-parsed cycles in expire-grants cron
  'min_org_income',   // org-income / turnover floor — feeds eligibility.ts income check
  'max_org_income',   // org-income / turnover cap — feeds eligibility.ts income check
  'si_min_investment',        // investment ticket floor (mostly null; engine falls back to amount_min)
  'si_max_investment',        // investment ticket ceiling (informational)
  'si_repayment_term_months', // repayment term (catalogue values are all ranges — left null)
  'si_interest_rate_percent', // feeds eligibility.ts charity_repayable_finance
  'si_security_required',     // feeds eligibility.ts si_security_vs_asset_lock
  'si_instrument_type',       // instrument kind (informational)
  'spend_restriction',        // restricted | unrestricted — matcher input, tracked BEFORE anything writes to it
  'spend_types',              // {capital} / {revenue} / both — the orthogonal axis; see migration 048
] as const

export type TrackedField = typeof TRACKED_FIELDS[number]

const TRACKED_SET = new Set<string>(TRACKED_FIELDS)

export function isTrackedField(field: string): field is TrackedField {
  return TRACKED_SET.has(field)
}

// ── Provenance types ──────────────────────────────────────────────────────────

export type ProvenanceSource = string  // "scraper:gov_uk" | "admin:foo@bar.com" | "ai_classifier:v3" | …

export type ProvenanceEntry = {
  source: ProvenanceSource
  set_at: string           // ISO timestamp
  pinned: boolean
  backfilled?: boolean
  previous?: { source: string; value: unknown }
  // Pipeline v1 — citation + confidence per AI-written field.
  // Populated by enrich/classify prompts; required for tracked AI sources.
  citation?: {
    snippet:         string                  // 50-300 chars verbatim from source
    snippet_offset?: number                  // byte offset in fetched page text
    confidence:      'high' | 'med' | 'low'
    reason?:         string                  // required when confidence='low'
  }
}

export type FieldProvenance = Record<string, ProvenanceEntry>

// ── Trust ladder ──────────────────────────────────────────────────────────────

const TRUST_BY_TYPE: Record<string, number> = {
  admin:           100,
  '360giving':      80,
  ai_classifier:    60,
  ai_enrich:        60,
  ai_audit:         60,
  // `system` sits above scraper because system routes carry authoritative
  // lifecycle knowledge (e.g. expire-grants knows today's date; admin_api
  // bearer-token callers are internal scripts with the admin secret).
  // Below AI sources because AI reads content and system doesn't.
  system:           50,
  manual_extract:   50,
  // Deterministic regex extraction over already-stored text (e.g. income gate).
  // Above scraper so a daily crawl can't clobber a verified value, below ai_enrich
  // so a richer LLM read can still improve it. NOT ai_detect (30) — that sits
  // below the scraper and would silently revert on the next crawl.
  ai_extract:       50,
  scraper:          40,
  ai_detect:        30,
  seed:             25,
  discovery:        25,
  unknown:          10,
}

export function trustOf(source: string, backfilled?: boolean): number {
  const type = source.split(':', 1)[0]
  const base = TRUST_BY_TYPE[type] ?? 10
  if (!backfilled) return base
  // Phase A backfill stamped admin:legacy on every row where the original
  // `source` column was 'manual'. In practice those rows weren't deliberately
  // admin-edited — they carried default-ish AI-classifier tags or seed values.
  // Treating admin:legacy as full admin authority (trust 95) blocks legitimate
  // classifier corrections (e.g. v2 prompt rollout). Drop to scraper level
  // so real ai_* runs can override; real admin edits (admin:<email>) keep
  // their full trust because they aren't tagged backfilled=true.
  if (source === 'admin:legacy') return 35
  return Math.max(0, base - 5)
}

// ── Per-field merge decision ──────────────────────────────────────────────────

export type MergeFieldDecision =
  | { write: true; value: unknown; prov: ProvenanceEntry }
  | { write: false; reason: 'idempotent' | 'pinned' | 'lower_trust' }

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a == null || b == null) return a == b
  if (typeof a !== typeof b) return false
  if (typeof a === 'object') {
    try { return JSON.stringify(a) === JSON.stringify(b) } catch { return false }
  }
  return false
}

export function mergeFieldUpdate(
  currentValue: unknown,
  currentProv: ProvenanceEntry | undefined,
  newValue: unknown,
  newProv: ProvenanceEntry,
): MergeFieldDecision {
  // Case 1 — first write to this field
  if (!currentProv) {
    return { write: true, value: newValue, prov: newProv }
  }

  // Case 2 — the value is not actually changing.
  //
  // Source-agnostic on purpose. An unchanged value carries no decision, so
  // recording one — and, for an admin caller, PINNING it at trust 100 — invents
  // a human judgement nobody made.
  //
  // This is the mechanism behind the catalogue's pinning debt. Grant Manager
  // sends its whole form state on save, so every field on screen is written,
  // whether or not the admin looked at it. update-grant then pins all of them
  // (route.ts:57, an admin session cannot be downgraded). Measured 2026-07-26:
  // 392 of 720 active rows (54%) carry at least one pinned field, and 53 have
  // `deadline` pinned to NULL — frozen empty because the form's date box was
  // empty when something unrelated was saved. CLA Charitable Trust's round
  // closes tomorrow and its deadline field cannot be populated by anything.
  //
  // Each of those was stamped in the same second as up to six other fields,
  // which is the signature of a form save rather than a per-field decision.
  //
  // This mirrors the rule the Review Inbox already follows: confirming that a
  // machine got it right is not the same as deciding the value must never
  // improve, so an accept writes nothing and the value keeps its provenance.
  // Locking a value should require deliberately changing it, not merely
  // having it on screen while saving something else.
  if (valuesEqual(currentValue, newValue)) {
    return { write: false, reason: 'idempotent' }
  }

  // Case 2b — same source rewriting its own value with something different.
  if (currentProv.source === newProv.source) {
    return { write: true, value: newValue, prov: newProv }
  }

  // Case 3 — current value is pinned (admin deliberately set it)
  if (currentProv.pinned) {
    if (newProv.source.startsWith('admin:')) {
      // Admin can re-pin to a new value or unpin (pinned=false in newProv)
      return { write: true, value: newValue, prov: newProv }
    }
    return { write: false, reason: 'pinned' }
  }

  // Case 4 — trust ladder
  const newTrust     = trustOf(newProv.source,     newProv.backfilled)
  const currentTrust = trustOf(currentProv.source, currentProv.backfilled)
  if (newTrust < currentTrust) {
    return { write: false, reason: 'lower_trust' }
  }

  // Admin overriding a non-admin value: auto-pin and preserve the previous value
  // so a future "reset to scraper value" affordance is possible.
  let resultProv = newProv
  if (newProv.source.startsWith('admin:') && !currentProv.source.startsWith('admin:')) {
    resultProv = {
      ...newProv,
      pinned: true,
      previous: { source: currentProv.source, value: currentValue },
    }
  }
  return { write: true, value: newValue, prov: resultProv }
}

// ── Whole-grant merger (single id) ────────────────────────────────────────────

export type MergeGrantOptions = {
  id: string
  fields: Record<string, unknown>
  source: ProvenanceSource
  pinned?: boolean
  db: SupabaseClient
  // Pipeline v1 — optional per-field citations stamped into field_provenance.
  // Required for AI sources writing tracked fields; ignored if no citation
  // present for a given field (legacy callers continue to work unchanged).
  citations?: Record<string, NonNullable<ProvenanceEntry['citation']>>
}

export type MergeGrantResult = {
  applied: string[]
  rejected: { field: string; reason: 'idempotent' | 'pinned' | 'lower_trust' }[]
}

export async function mergeGrantUpdate(opts: MergeGrantOptions): Promise<MergeGrantResult> {
  const { id, fields, source, pinned = false, db, citations } = opts

  if (Object.keys(fields).length === 0) {
    return { applied: [], rejected: [] }
  }

  // Split into tracked (run through merger) and untracked (pass through)
  const trackedFields:   Record<string, unknown> = {}
  const untrackedFields: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(fields)) {
    if (isTrackedField(k)) trackedFields[k] = v
    else                   untrackedFields[k] = v
  }

  // Untracked-only update path. Even though no tracked field is changing,
  // we still need to compute the pipeline_state auto-transition based on
  // the untracked fields (is_active, url_status). Without this, Hide /
  // publish / deactivate actions — which all pass ONLY untracked fields —
  // silently bypass the state machine, leaving rows in inconsistent states
  // (e.g. is_active=false + url_status='dead' + pipeline_state='tagged'
  // instead of 'archived'). Bug fixed 2026-05-26.
  if (Object.keys(trackedFields).length === 0) {
    const writePayload: Record<string, unknown> = { ...untrackedFields }
    const applied = Object.keys(untrackedFields)

    // Skip transition if caller passed pipeline_state explicitly (admin override).
    if (!('pipeline_state' in fields)) {
      const { data: current, error: fetchErr } = await db
        .from('scraped_grants')
        .select('pipeline_state')
        .eq('id', id)
        .maybeSingle()
      if (fetchErr) throw new Error(`mergeGrantUpdate (untracked) fetch: ${fetchErr.message}`)
      if (!current)  throw new Error(`mergeGrantUpdate (untracked): no row for id ${id}`)

      const currentState = readPipelineState(current as Record<string, unknown>)
      const computed = transitionPipelineState({
        current: currentState,
        source,
        fields,
        anyTrackedWritten: false,
      })
      if (computed !== currentState) {
        writePayload.pipeline_state = computed
        applied.push('pipeline_state')
      }
    }

    const { error } = await db.from('scraped_grants').update(writePayload).eq('id', id)
    if (error) throw new Error(`mergeGrantUpdate (untracked): ${error.message}`)
    return { applied, rejected: [] }
  }

  // Fetch current values + provenance + pipeline_state.
  // pipeline_state is always selected so the auto-transition below can decide
  // if the row's state should change as a side effect of this write.
  const trackedCols = Object.keys(trackedFields)
  // location_tag / funder_brief are pulled even when untouched: the structure
  // equivalence derivation below needs the row's geography to decide whether a
  // SCIO or CIO is implied, and geography is usually NOT part of this write.
  const needsGeo    = trackedCols.includes('eligible_structures')
  const selectCols  = Array.from(new Set([
    ...trackedCols, 'field_provenance', 'pipeline_state',
    ...(needsGeo ? ['location_tag', 'funder_brief'] : []),
  ])).join(', ')
  const { data: current, error: fetchErr } = await db
    .from('scraped_grants')
    .select(selectCols)
    .eq('id', id)
    .maybeSingle()
  if (fetchErr) throw new Error(`mergeGrantUpdate fetch: ${fetchErr.message}`)
  if (!current)  throw new Error(`mergeGrantUpdate: no scraped_grants row for id ${id}`)

  const currentRow  = current as unknown as Record<string, unknown>
  const currentProv = (currentRow.field_provenance ?? {}) as FieldProvenance

  const now = new Date().toISOString()

  const valuesToWrite: Record<string, unknown> = { ...untrackedFields }
  const nextProv: FieldProvenance = { ...currentProv }
  const applied:  string[] = [...Object.keys(untrackedFields)]
  const rejected: MergeGrantResult['rejected'] = []
  let anyTrackedWritten = false

  // Expand implicit charity-form equivalents BEFORE the merge decision, so the
  // derived value is what gets compared, written and stamped. Running it after
  // would either re-trigger a second write or be silently discarded when the
  // merger judged the undecorated value idempotent.
  //
  // A funder saying "open to registered charities" has accepted SCIOs in
  // Scotland and CIOs in England & Wales; the classifier reads literally and
  // drops the form it did not see spelled out. Wee Grants lost `scio` that way
  // on a re-read and went invisible to its core audience.
  if (trackedFields.eligible_structures !== undefined) {
    const brief = currentRow.funder_brief as Record<string, unknown> | null
    const geo = [
      currentRow.location_tag,
      brief?.geographic_focus,
    ].filter(Boolean).join(' ')
    const eligText = [brief?.who_can_apply, brief?.exclusions].filter(Boolean).join(' ')
    trackedFields.eligible_structures = deriveEquivalentStructures(
      trackedFields.eligible_structures as string[] | null,
      geo,
      eligText,
    )
  }

  for (const [field, newValue] of Object.entries(trackedFields)) {
    // Per-field provenance so each tracked field can carry its own citation.
    // Citations are looked up in the caller-supplied `citations` map; absent
    // entries leave the provenance citation-less (back-compat for legacy callers).
    const fieldCitation = citations?.[field]
    const fieldProv: ProvenanceEntry = {
      source, set_at: now, pinned,
      ...(fieldCitation ? { citation: fieldCitation } : {}),
    }
    const decision = mergeFieldUpdate(
      currentRow[field],
      currentProv[field],
      newValue,
      fieldProv,
    )
    if (decision.write) {
      valuesToWrite[field] = decision.value
      nextProv[field]      = decision.prov
      applied.push(field)
      anyTrackedWritten = true
    } else {
      rejected.push({ field, reason: decision.reason })
    }
  }

  // Auto-transition pipeline_state. Skip if the caller passed an explicit
  // pipeline_state (escape hatch for admin overrides via SQL or ops scripts).
  const currentState = readPipelineState(currentRow)
  let nextState: PipelineState | null = null
  if (!('pipeline_state' in fields)) {
    const computed = transitionPipelineState({
      current: currentState,
      source,
      fields,
      anyTrackedWritten,
    })
    if (computed !== currentState) nextState = computed
  }

  // Nothing actually changing (no fields applied AND no state transition)
  if (applied.length === 0 && nextState === null) return { applied, rejected }

  // Only include field_provenance in the update if a tracked field changed
  const updatePayload: Record<string, unknown> = { ...valuesToWrite }
  if (anyTrackedWritten) updatePayload.field_provenance = nextProv
  if (nextState !== null) {
    updatePayload.pipeline_state = nextState
    applied.push('pipeline_state')
  }

  const { error: updateErr } = await db
    .from('scraped_grants')
    .update(updatePayload)
    .eq('id', id)
  if (updateErr) throw new Error(`mergeGrantUpdate write: ${updateErr.message}`)

  return { applied, rejected }
}

// ── Whole-grant merger (batch — same fields applied to N ids) ─────────────────
// Used by update-grant batch mode ("Approve all 50 grants"). Loops the single
// merger over ids; each row runs its own fetch + write because the trust check
// and pinned check depend on per-row provenance state.

export type MergeGrantBatchResult = {
  totalApplied: number
  totalRejected: number
  perGrant: { id: string; applied: string[]; rejected: MergeGrantResult['rejected']; error?: string }[]
}

export async function mergeGrantUpdateBatch(opts: {
  ids: string[]
  fields: Record<string, unknown>
  source: ProvenanceSource
  pinned?: boolean
  db: SupabaseClient
}): Promise<MergeGrantBatchResult> {
  const { ids, fields, source, pinned, db } = opts
  const perGrant: MergeGrantBatchResult['perGrant'] = []
  let totalApplied = 0
  let totalRejected = 0

  for (const id of ids) {
    try {
      const r = await mergeGrantUpdate({ id, fields, source, pinned, db })
      perGrant.push({ id, applied: r.applied, rejected: r.rejected })
      totalApplied  += r.applied.length
      totalRejected += r.rejected.length
    } catch (err) {
      perGrant.push({ id, applied: [], rejected: [], error: err instanceof Error ? err.message : String(err) })
    }
  }

  return { totalApplied, totalRejected, perGrant }
}

// ── Insert helper for new rows ────────────────────────────────────────────────
// Used by upsertGrants() in crawl.ts when inserting a brand-new grant. Builds
// the initial field_provenance jsonb in-process (no merger round-trip needed
// because there's nothing to merge against). Returns the row augmented with
// field_provenance ready for direct INSERT.
//
// pipeline_state for new rows is derived from the row's is_active flag and
// the source family — see deriveInitialPipelineState() below.

export function stampNewGrant<T extends Record<string, unknown>>(
  row: T,
  source: ProvenanceSource,
  opts: { pinned?: boolean } = {},
): T & { field_provenance: FieldProvenance; pipeline_state: PipelineState } {
  const now = new Date().toISOString()
  const baseEntry: ProvenanceEntry = { source, set_at: now, pinned: opts.pinned ?? false }
  const prov: FieldProvenance = {}
  for (const field of TRACKED_FIELDS) {
    if (row[field] !== undefined && row[field] !== null) {
      prov[field] = baseEntry
    }
  }
  return {
    ...row,
    field_provenance: prov,
    pipeline_state:   deriveInitialPipelineState(row, source),
  }
}

// ── Pipeline state machine ────────────────────────────────────────────────────
// Explicit 4-state lifecycle. See migrations/007_pipeline_state.sql.
// State transitions are computed by transitionPipelineState() and stamped by
// each write path alongside its content fields.

// Pipeline v1 expansion — 'tagged' kept for legacy rows; new writes use
// 'tagged_awaiting_review'. See docs/pipeline-v1-spec.md §3.
export const PIPELINE_STATES = [
  'captured',
  'enriched',
  'tagged',                    // legacy — pre-v1 terminal-pre-review state
  'tagged_awaiting_review',    // v1 — citations populated, ready for founder review
  'published',
  'archived',
  'rejected',                  // v1 — soft-rejected with rejection_reason
  'between_rounds_scheduled',  // v1 — closed now, future cycle date pending promotion
] as const
export type PipelineState = typeof PIPELINE_STATES[number]

const AI_SOURCE_PREFIXES = ['ai_classifier:', 'ai_enrich:', 'ai_audit:', 'ai_detect:', '360giving:']

function isAiSource(source: string): boolean {
  return AI_SOURCE_PREFIXES.some(p => source.startsWith(p))
}

// Initial state for a brand-new row at INSERT time.
//   - promote-grant / promote-all-seeds set is_active=true → 'published'
//   - scraper / discovery / 360giving inserts set is_active=false → 'captured'
//     (even if from 360giving, since the row hasn't been admin-reviewed yet)
function deriveInitialPipelineState<T extends Record<string, unknown>>(
  row: T,
  _source: ProvenanceSource,
): PipelineState {
  if (row.is_active === true) return 'published'
  // url_status='dead' on an INSERT is unusual but treat as archived for consistency
  if (row.url_status === 'dead') return 'archived'
  return 'captured'
}

// Action-based state transitions for existing rows. Called from write paths
// that mutate state (admin save, classifier run, etc.).
//
// The function is pure — callers decide whether to include `pipeline_state`
// in the merger fields list (passing it as an untracked field flows through
// without provenance stamping).

export type StateTransitionInput = {
  current:            PipelineState
  source:             ProvenanceSource
  fields:             Record<string, unknown>  // the write being applied
  anyTrackedWritten?: boolean                  // did at least one tracked field actually get written by the merger?
}

export function transitionPipelineState({ current, source, fields, anyTrackedWritten }: StateTransitionInput): PipelineState {
  // Explicit admin archive: is_active=false + url_status='dead' → archived
  if (fields.is_active === false && fields.url_status === 'dead') return 'archived'

  // Admin un-archive / approve: is_active=true takes the row to published
  // regardless of previous state.
  if (fields.is_active === true) return 'published'

  // Admin de-publish without archive: is_active=false but URL not dead.
  if (fields.is_active === false && current === 'published') {
    return 'captured'  // conservative — re-publishing always requires explicit approval
  }

  // AI source successfully writing a tracked field on a captured row → tagged.
  // Requires anyTrackedWritten so a rejected AI write (admin-pinned, etc.)
  // doesn't promote the state — the row didn't actually get tagged.
  if (current === 'captured' && isAiSource(source) && anyTrackedWritten === true) {
    return 'tagged'
  }

  // No transition triggered — preserve current state.
  return current
}

// Helper: read the current pipeline_state from a row fetch result so a write
// path can compute the next state without an extra round-trip.
export function readPipelineState(row: unknown): PipelineState {
  if (!row || typeof row !== 'object') return 'captured'
  const v = (row as Record<string, unknown>).pipeline_state
  if (typeof v === 'string' && (PIPELINE_STATES as readonly string[]).includes(v)) {
    return v as PipelineState
  }
  return 'captured'
}
