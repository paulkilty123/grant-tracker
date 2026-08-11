import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, isAdminBearerToken } from '@/lib/auth/require-admin'
import { getAdminDb } from '@/lib/admin/admin-db'
import { mergeGrantUpdate } from '@/lib/grant-merge'
import { resolveFlagGrant, type GrantKey } from '@/lib/feedback/resolve-grant'
import { fetchFlagCandidates } from '@/lib/feedback/fetch-candidates'
import {
  TRIAGE_CLASSES, RESOLUTIONS, isCorrectableField, acceptSource,
  pinsOnCorrectableFields, CORRECTABLE_FIELDS, noteRequiredFor,
  type TriageClass, type Resolution, type TriageFlag, type TriageGrant,
} from '@/lib/feedback/triage'

export const dynamic = 'force-dynamic'

/**
 * Admin triage for match_feedback.
 *
 * GET  — untriaged negative flags with the current row values beside them, plus
 *        any pins that would block a correction.
 * POST — record a triage decision, and for a catalogue_gap optionally write the
 *        correction at user_verified trust.
 *
 * Nothing here writes a grant field unless the caller explicitly sends
 * corrections. Classifying a flag is not the same as editing a row.
 */

async function isAuthorised(req: NextRequest): Promise<boolean> {
  if (isAdminBearerToken(req.headers.get('authorization'))) return true
  const auth = await requireAdmin()
  return auth.ok
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const GRANT_COLUMNS = [
  'id', 'external_id', 'title', 'funder', 'is_active', 'pipeline_state', 'apply_url',
  'field_provenance', ...CORRECTABLE_FIELDS,
].join(', ')

// ── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!await isAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  // 'rich' (default) is the hand-triage starting set: a stated reason on a grant
  // users can still see. 'all' includes tag-only flags, which say a grant was
  // wrong for someone without saying what is wrong with the row.
  const scope = req.nextUrl.searchParams.get('scope') === 'all' ? 'all' : 'rich'
  // A decision you cannot read back is barely a decision. Triaged flags leave
  // the working queue but stay reachable here, otherwise the note an admin
  // wrote is only recoverable by hand-writing SQL.
  const state = req.nextUrl.searchParams.get('state') === 'triaged' ? 'triaged' : 'untriaged'
  const db = getAdminDb()

  let query = db
    .from('match_feedback')
    .select('id, user_id, grant_id, direction, reasons, free_text, match_score_at_time, created_at, reviewer_note, reviewed_at, resolution, triage_class')
    .eq('direction', 'down')
    .order(state === 'triaged' ? 'reviewed_at' : 'created_at', { ascending: false })
    .limit(500)
  query = state === 'triaged' ? query.not('reviewed_at', 'is', null) : query.is('reviewed_at', null)
  const { data: flagRows, error: flagErr } = await query

  if (flagErr) return NextResponse.json({ error: flagErr.message }, { status: 500 })
  const flags = (flagRows ?? []) as Array<{
    id: string; user_id: string; grant_id: string; direction: 'up' | 'down'
    reasons: string[] | null; free_text: string | null
    match_score_at_time: number; created_at: string
    reviewer_note: string | null; reviewed_at: string | null
    resolution: string | null; triage_class: string | null
  }>

  if (flags.length === 0) return NextResponse.json({ flags: [], counts: { total: 0, rich: 0 } })

  // Candidate grants, queried on BOTH key forms so external_id-keyed flags are
  // not silently dropped (which is what the older feedback page does), and
  // chunked so the filter cannot outgrow the query string.
  let candidates: Array<GrantKey & Record<string, unknown>>
  try {
    candidates = await fetchFlagCandidates<GrantKey & Record<string, unknown>>(
      db, flags.map(f => f.grant_id), GRANT_COLUMNS)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Grant lookup failed' }, { status: 500 })
  }

  // Org names for context. match_feedback keys on user_id, and a user can own
  // more than one org, so take the oldest — the same one the app resolves.
  const { data: orgRows } = await db
    .from('organisations')
    .select('owner_id, name, created_at')
    .in('owner_id', Array.from(new Set(flags.map(f => f.user_id))))
    .order('created_at', { ascending: true })
  const orgByOwner = new Map<string, string>()
  for (const o of (orgRows ?? []) as Array<{ owner_id: string; name: string | null }>) {
    if (!orgByOwner.has(o.owner_id)) orgByOwner.set(o.owner_id, o.name ?? '')
  }

  const out: TriageFlag[] = flags.map(f => {
    const resolved = resolveFlagGrant(f.grant_id, candidates)
    const row = resolved.ok ? resolved.grant : null
    return {
      id: f.id,
      created_at: f.created_at,
      direction: f.direction,
      reasons: f.reasons ?? [],
      free_text: f.free_text,
      match_score_at_time: f.match_score_at_time,
      org_name: orgByOwner.get(f.user_id) ?? null,
      reviewer_note: f.reviewer_note,
      reviewed_at: f.reviewed_at,
      resolution: f.resolution as TriageFlag['resolution'],
      triage_class: f.triage_class as TriageFlag['triage_class'],
      grant: row ? (pickGrant(row) as TriageGrant) : null,
      unresolved: resolved.ok ? null : resolved.reason,
      pins: row ? pinsOnCorrectableFields(row.field_provenance as never) : [],
    }
  })

  const rich = out.filter(f =>
    f.free_text != null && f.free_text.trim().length > 2 && f.grant?.is_active === true)

  return NextResponse.json({
    flags: state === 'triaged' ? out : (scope === 'all' ? out : rich),
    counts: { total: out.length, rich: rich.length },
    state,
  })
}

function pickGrant(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of ['id', 'title', 'funder', 'is_active', 'pipeline_state', 'apply_url', ...CORRECTABLE_FIELDS]) {
    out[k] = row[k] ?? null
  }
  return out
}

// ── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!await isAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  let body: {
    flag_id?: unknown; triage_class?: unknown; resolution?: unknown
    corrections?: unknown; lock?: unknown; supersede_flag_ids?: unknown
    reviewer_note?: unknown
  }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 })
  }

  const flagId = body.flag_id
  if (typeof flagId !== 'string' || !UUID_RE.test(flagId)) {
    return NextResponse.json({ error: 'flag_id must be a UUID' }, { status: 400 })
  }
  if (!TRIAGE_CLASSES.includes(body.triage_class as TriageClass)) {
    return NextResponse.json({ error: `triage_class must be one of ${TRIAGE_CLASSES.join(', ')}` }, { status: 400 })
  }
  if (!RESOLUTIONS.includes(body.resolution as Resolution)) {
    return NextResponse.json({ error: `resolution must be one of ${RESOLUTIONS.join(', ')}` }, { status: 400 })
  }
  const triageClass = body.triage_class as TriageClass
  const resolution  = body.resolution as Resolution
  const lock        = body.lock === true

  const noteRaw = body.reviewer_note
  if (noteRaw !== undefined && noteRaw !== null && typeof noteRaw !== 'string') {
    return NextResponse.json({ error: 'reviewer_note must be a string' }, { status: 400 })
  }
  const reviewerNote = typeof noteRaw === 'string' ? noteRaw.trim() : ''
  // match_precision and taxonomy_gap write nothing to the grant, so the note is
  // the only record that the decision was ever made, or why.
  if (noteRequiredFor(triageClass) && reviewerNote.length === 0) {
    return NextResponse.json(
      { error: `${triageClass} writes nothing to the grant, so a note explaining the decision is required.` },
      { status: 400 },
    )
  }

  const corrections = (body.corrections ?? {}) as Record<string, unknown>
  if (typeof corrections !== 'object' || corrections === null || Array.isArray(corrections)) {
    return NextResponse.json({ error: 'corrections must be an object' }, { status: 400 })
  }
  for (const field of Object.keys(corrections)) {
    if (!isCorrectableField(field)) {
      return NextResponse.json(
        { error: `"${field}" is not correctable from feedback. Allowed: ${CORRECTABLE_FIELDS.join(', ')}` },
        { status: 400 },
      )
    }
  }

  // A correction is only meaningful for a catalogue gap that was applied.
  // match_precision in particular must never write: the row is accurate.
  const hasCorrections = Object.keys(corrections).length > 0
  if (hasCorrections && (triageClass !== 'catalogue_gap' || resolution !== 'applied')) {
    return NextResponse.json(
      { error: 'corrections are only allowed with triage_class=catalogue_gap and resolution=applied' },
      { status: 400 },
    )
  }
  if (resolution === 'applied' && !hasCorrections) {
    return NextResponse.json(
      { error: 'resolution=applied needs at least one correction; use rejected to close with no change' },
      { status: 400 },
    )
  }

  const db = getAdminDb()

  const { data: flagRow, error: flagErr } = await db
    .from('match_feedback')
    .select('id, grant_id, reviewed_at')
    .eq('id', flagId)
    .maybeSingle()
  if (flagErr) return NextResponse.json({ error: flagErr.message }, { status: 500 })
  if (!flagRow) return NextResponse.json({ error: 'No flag with that id' }, { status: 404 })
  if ((flagRow as { reviewed_at: string | null }).reviewed_at) {
    return NextResponse.json({ error: 'That flag has already been triaged' }, { status: 409 })
  }

  let merge: { applied: string[]; rejected: { field: string; reason: string }[] } = { applied: [], rejected: [] }
  let grantId: string | null = null

  if (hasCorrections) {
    const grantKey = (flagRow as { grant_id: string }).grant_id
    let grantRows: GrantKey[]
    try {
      grantRows = await fetchFlagCandidates<GrantKey>(db, [grantKey], 'id, external_id, title')
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Grant lookup failed' }, { status: 500 })
    }
    const resolved = resolveFlagGrant(grantKey, grantRows)
    if (!resolved.ok) {
      return NextResponse.json(
        { error: `Could not resolve this flag to a single grant (${resolved.reason}). Corrections not written.` },
        { status: 409 },
      )
    }
    grantId = resolved.grant.id

    // Lock writes as admin, which auto-pins at trust 100 and permanently blocks
    // every automated source. Deliberate and rare; the default is user_verified,
    // which outranks enrichment but leaves the value improvable.
    let source = acceptSource(flagId)
    if (lock) {
      const auth = await requireAdmin()
      source = auth.ok ? `admin:${auth.user.email}` : 'admin:feedback-lock'
    }

    merge = await mergeGrantUpdate({ id: grantId, fields: corrections, source, db })

    // Nothing landed: report it rather than claiming success. With 54% of active
    // rows carrying a pin this is a live possibility, not a theoretical one.
    if (merge.applied.length === 0) {
      return NextResponse.json({
        ok: false,
        error: 'No correction was saved.',
        merge,
        grant_id: grantId,
      }, { status: 409 })
    }
  }

  const { error: updErr } = await db
    .from('match_feedback')
    .update({
      reviewed_at: new Date().toISOString(),
      resolution,
      triage_class: triageClass,
      reviewer_note: reviewerNote || null,
    })
    .eq('id', flagId)
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  // Sibling flags the admin marked as covered by this same correction.
  const supersede = Array.isArray(body.supersede_flag_ids)
    ? (body.supersede_flag_ids as unknown[]).filter((v): v is string => typeof v === 'string' && UUID_RE.test(v))
    : []
  if (supersede.length > 0) {
    await db
      .from('match_feedback')
      .update({ reviewed_at: new Date().toISOString(), resolution: 'superseded', triage_class: triageClass })
      .in('id', supersede)
      .is('reviewed_at', null)
  }

  return NextResponse.json({ ok: true, merge, grant_id: grantId, superseded: supersede.length })
}
