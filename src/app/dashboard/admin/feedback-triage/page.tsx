'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  TRIAGE_CLASSES, TRIAGE_CLASS_LABEL, TRIAGE_CLASS_HELP, CORRECTABLE_FIELDS, noteRequiredFor,
  type TriageClass as TC,
  type TriageClass, type TriageFlag, type FieldPin,
} from '@/lib/feedback/triage'

const UI = "var(--font-space-grotesk), Space Grotesk, sans-serif"

/** Fields whose value is a list, entered comma-separated. */
const ARRAY_FIELDS = new Set(['eligible_structures', 'impact_sectors', 'target_beneficiaries'])
/** Fields whose value is a yes/no. */
const BOOL_FIELDS = new Set(['is_invite_only', 'is_rolling', 'is_local'])
/** Fields whose value is a number. */
const NUM_FIELDS = new Set(['max_org_income', 'min_org_income'])

function displayValue(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (Array.isArray(v)) return v.join(', ')
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  return String(v)
}

/** Parse an edited string back to the field's real type. Empty means null. */
function parseValue(field: string, raw: string): unknown {
  const t = raw.trim()
  if (t === '') return null
  if (ARRAY_FIELDS.has(field)) return t.split(',').map(s => s.trim()).filter(Boolean)
  if (BOOL_FIELDS.has(field)) return t.toLowerCase() === 'true' || t.toLowerCase() === 'yes'
  if (NUM_FIELDS.has(field)) {
    const n = Number(t.replace(/[£,\s]/g, ''))
    return Number.isFinite(n) ? n : null
  }
  return t
}

type MergeResult = { applied: string[]; rejected: { field: string; reason: string }[] }

export default function FeedbackTriagePage() {
  const [flags, setFlags]     = useState<TriageFlag[]>([])
  const [counts, setCounts]   = useState<{ total: number; rich: number }>({ total: 0, rich: 0 })
  const [scope, setScope]     = useState<'rich' | 'all'>('rich')
  // Triaged flags leave the working queue but must stay readable — a decision
  // you cannot look up again is barely recorded.
  const [state, setState]     = useState<'untriaged' | 'triaged'>('untriaged')
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/admin/feedback-triage?scope=${scope}&state=${state}`)
      if (res.status === 401) { setError('Admin only.'); setLoading(false); return }
      const data = await res.json()
      if (data.error) { setError(data.error); setLoading(false); return }
      setFlags(data.flags ?? [])
      setCounts(data.counts ?? { total: 0, rich: 0 })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed')
    }
    setLoading(false)
  }, [scope, state])

  useEffect(() => { load() }, [load])

  async function runSync() {
    setSyncing(true); setSyncMsg(null)
    try {
      const res = await fetch('/api/admin/feedback-triage/sync', { method: 'POST' })
      const data = await res.json()
      setSyncMsg(res.ok
        ? `Queued ${data.queued}, released ${data.released}, skipped ${data.skipped}.`
        : (data.error ?? 'Sync failed'))
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : 'Sync failed')
    }
    setSyncing(false)
  }

  if (loading) return <div className="p-12 text-sm text-mid">Loading feedback…</div>
  if (error)   return <div className="p-12 text-sm text-coral-deep">{error}</div>

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <div className="mb-6">
        <h2 className="font-display text-2xl font-bold text-charcoal" style={{ fontFamily: UI }}>Feedback triage</h2>
        <p className="text-mid text-sm mt-1">
          What users told us was wrong with a match. A flag means &ldquo;wrong for me&rdquo;, which is not
          always &ldquo;this row is wrong&rdquo; — classify before correcting.
        </p>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {state === 'untriaged' && ([
          { key: 'rich', label: `With a stated reason (${counts.rich})` },
          { key: 'all',  label: `All untriaged (${counts.total})` },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setScope(t.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              scope === t.key ? 'bg-forest text-white' : 'border border-warm bg-white text-mid hover:text-charcoal'
            }`}
          >
            {t.label}
          </button>
        ))}
        <button
          onClick={() => setState(s => (s === 'triaged' ? 'untriaged' : 'triaged'))}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
            state === 'triaged' ? 'bg-forest text-white' : 'border border-warm bg-white text-mid hover:text-charcoal'
          }`}
        >
          {state === 'triaged' ? `Triaged (${counts.total})` : 'Triaged'}
        </button>
        <div className="flex-1" />
        <button
          onClick={runSync}
          disabled={syncing}
          className="rounded-full border border-warm bg-white px-3 py-1.5 text-xs font-semibold text-mid hover:text-charcoal disabled:opacity-50"
          title="Move flagged grants into the review queue, and release ones whose flags are all triaged"
        >
          {syncing ? 'Syncing…' : 'Sync review queue'}
        </button>
      </div>
      {syncMsg && <p className="mb-4 text-xs text-mid">{syncMsg}</p>}

      {flags.length === 0 ? (
        <div className="rounded-xl bg-white p-12 text-center text-sm text-mid" style={{ border: '0.5px solid rgba(23,52,4,0.08)' }}>
          {state === 'triaged' ? 'Nothing triaged yet.' : 'Nothing left to triage.'}
        </div>
      ) : (
        <div className="space-y-5">
          {flags.map(f => f.reviewed_at
            ? <TriagedCard key={f.id} flag={f} />
            : <FlagCard key={f.id} flag={f} onDone={load} />)}
        </div>
      )}
    </div>
  )
}

// ── A decision already made ──────────────────────────────────────────────────

const RESOLUTION_LABEL: Record<string, string> = {
  applied:    'correction applied',
  rejected:   'closed with no change',
  superseded: 'covered by another flag',
}

/**
 * Read-only view of a triaged flag.
 *
 * Exists because the write path shipped without a read path: three notes were
 * written and none could be read back outside SQL. For match_precision and
 * taxonomy_gap the note IS the whole output, so a decision with no way to
 * revisit it records nothing anyone can use.
 */
function TriagedCard({ flag }: { flag: TriageFlag }) {
  const grant = flag.grant
  const cls = flag.triage_class as TC | null | undefined
  return (
    <div className="rounded-xl bg-white p-5" style={{ border: '0.5px solid rgba(23,52,4,0.08)' }}>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="min-w-0">
          <p className="font-semibold text-charcoal" style={{ fontFamily: UI }}>
            {grant?.title ?? <span className="text-coral-deep">Unresolved grant</span>}
          </p>
          <p className="text-xs text-mid">{grant?.funder}</p>
        </div>
        <div className="text-right flex-shrink-0">
          {cls && (
            <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                  style={{ background: '#EAF3DE', color: '#3B6D11', fontFamily: UI }}>
              {TRIAGE_CLASS_LABEL[cls]}
            </span>
          )}
          <p className="text-[11px] text-light mt-1">
            {flag.reviewed_at?.slice(0, 10)}
            {flag.resolution ? ` · ${RESOLUTION_LABEL[flag.resolution] ?? flag.resolution}` : ''}
          </p>
        </div>
      </div>

      <div className="rounded-lg px-4 py-3 mb-3" style={{ background: '#F5F1E8' }}>
        {flag.free_text
          ? <p className="text-sm text-charcoal">&ldquo;{flag.free_text}&rdquo;</p>
          : <p className="text-sm text-mid italic">No comment left.</p>}
        <p className="text-[11px] text-mid mt-1.5">{flag.org_name ?? 'unknown org'} · scored {flag.match_score_at_time}</p>
      </div>

      {flag.reviewer_note && (
        <div className="rounded-lg px-4 py-3" style={{ background: '#FAFAF7', border: '0.5px solid rgba(23,52,4,0.08)' }}>
          <p className="text-[11px] font-semibold text-mid mb-1" style={{ fontFamily: UI }}>Your note</p>
          <p className="text-sm text-charcoal whitespace-pre-wrap">{flag.reviewer_note}</p>
        </div>
      )}

      {grant && (
        <a href={`/dashboard/admin/grants/${grant.id}`}
           className="inline-block mt-3 text-xs text-sage underline">
          Open the catalogue record →
        </a>
      )}
    </div>
  )
}

// ── One flag ─────────────────────────────────────────────────────────────────

function FlagCard({ flag, onDone }: { flag: TriageFlag; onDone: () => void }) {
  const [cls, setCls]         = useState<TriageClass | null>(null)
  const [edits, setEdits]     = useState<Record<string, string>>({})
  const [lock, setLock]       = useState(false)
  const [note, setNote]       = useState('')
  const [busy, setBusy]       = useState(false)
  const [result, setResult]   = useState<{ ok: boolean; message: string; merge?: MergeResult } | null>(null)

  const grant = flag.grant
  const pinByField = useMemo(() => {
    const m = new Map<string, FieldPin>()
    for (const p of flag.pins) m.set(p.field, p)
    return m
  }, [flag.pins])

  const corrections = useMemo(() => {
    const out: Record<string, unknown> = {}
    for (const [field, raw] of Object.entries(edits)) {
      const parsed = parseValue(field, raw)
      const current = grant ? (grant as unknown as Record<string, unknown>)[field] : null
      if (displayValue(parsed) !== displayValue(current)) out[field] = parsed
    }
    return out
  }, [edits, grant])

  async function submit(resolution: 'applied' | 'rejected', overrideLock = false) {
    if (!cls) return
    setBusy(true); setResult(null)
    try {
      const res = await fetch('/api/admin/feedback-triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          flag_id: flag.id,
          triage_class: cls,
          resolution,
          corrections: resolution === 'applied' ? corrections : {},
          lock: overrideLock || lock,
          reviewer_note: note,
        }),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        setResult({ ok: true, message: resolution === 'applied'
          ? `Saved: ${data.merge.applied.join(', ')}`
          : 'Closed with no change.', merge: data.merge })
        setTimeout(onDone, 900)
      } else {
        setResult({ ok: false, message: data.error ?? `Failed (${res.status})`, merge: data.merge })
      }
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : 'Request failed' })
    }
    setBusy(false)
  }

  return (
    <div className="rounded-xl bg-white p-5" style={{ border: '0.5px solid rgba(23,52,4,0.08)' }}>
      {/* Grant + provenance of the complaint */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="min-w-0">
          <p className="font-semibold text-charcoal" style={{ fontFamily: UI }}>
            {grant?.title ?? <span className="text-coral-deep">Unresolved grant ({flag.unresolved})</span>}
          </p>
          <p className="text-xs text-mid">{grant?.funder}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xs text-mid">scored {flag.match_score_at_time}</p>
          <p className="text-[11px] text-light">{flag.created_at.slice(0, 10)}</p>
        </div>
      </div>

      {/* What the user actually said — the whole point */}
      <div className="rounded-lg px-4 py-3 mb-4" style={{ background: '#F5F1E8' }}>
        {flag.free_text
          ? <p className="text-sm text-charcoal">&ldquo;{flag.free_text}&rdquo;</p>
          : <p className="text-sm text-mid italic">No comment left.</p>}
        <p className="text-[11px] text-mid mt-1.5">
          {flag.org_name ? `${flag.org_name}` : 'unknown org'}
          {flag.reasons.length > 0 && ` · ${flag.reasons.join(', ')}`}
        </p>
      </div>

      {/* Pins. Shown BEFORE the editor, because a pinned field cannot be
          corrected and finding that out after typing a value is the failure
          this panel exists to prevent. */}
      {flag.pins.length > 0 && (
        <div
          className="rounded-lg px-4 py-3 mb-4 text-xs"
          style={{ background: '#FAEEDA', color: '#854F0B', border: '0.5px solid rgba(133,79,11,0.22)' }}
        >
          <p className="font-semibold mb-1" style={{ fontFamily: UI }}>
            {flag.pins.length === 1 ? 'One field on this row is frozen' : `${flag.pins.length} fields on this row are frozen`}
          </p>
          <ul className="space-y-0.5">
            {flag.pins.map(p => (
              <li key={p.field}>
                <code>{p.field}</code> — set by <code>{p.source}</code>
                {p.set_at ? ` on ${p.set_at.slice(0, 10)}` : ''} (trust {p.trust}).
                A correction here will be refused unless you tick Lock.
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Triage */}
      <p className="text-xs font-semibold text-mid mb-2" style={{ fontFamily: UI }}>What kind of problem is this?</p>
      <div className="flex flex-wrap gap-2 mb-4">
        {TRIAGE_CLASSES.map(c => (
          <button
            key={c}
            onClick={() => setCls(c)}
            title={TRIAGE_CLASS_HELP[c]}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              cls === c ? 'bg-forest text-white' : 'border border-warm bg-white text-mid hover:text-charcoal'
            }`}
          >
            {TRIAGE_CLASS_LABEL[c]}
          </button>
        ))}
      </div>
      {cls && <p className="text-xs text-mid mb-4">{TRIAGE_CLASS_HELP[cls]}</p>}

      {/* Correction editor — only for a catalogue gap */}
      {cls === 'catalogue_gap' && grant && (
        <div className="rounded-lg p-4 mb-4" style={{ background: '#FAFAF7', border: '0.5px solid rgba(23,52,4,0.08)' }}>
          <p className="text-xs font-semibold text-charcoal mb-3" style={{ fontFamily: UI }}>
            Current values. Edit only what this flag actually evidences.
          </p>
          <div className="space-y-2">
            {CORRECTABLE_FIELDS.map(field => {
              const current = (grant as unknown as Record<string, unknown>)[field]
              const pin = pinByField.get(field)
              const value = edits[field] ?? displayValue(current)
              const changed = Object.prototype.hasOwnProperty.call(corrections, field)
              return (
                <div key={field} className="flex items-center gap-3">
                  <label className="w-48 flex-shrink-0 text-[11px] text-mid font-mono">
                    {field}{pin && <span title={`pinned by ${pin.source}`}> 🔒</span>}
                  </label>
                  <input
                    value={value}
                    onChange={e => setEdits(p => ({ ...p, [field]: e.target.value }))}
                    placeholder={BOOL_FIELDS.has(field) ? 'true / false' : ARRAY_FIELDS.has(field) ? 'comma, separated' : '—'}
                    className="flex-1 rounded-lg px-3 py-1.5 text-xs"
                    style={{
                      border: changed ? '1px solid #8ECB3C' : '0.5px solid rgba(0,0,0,0.14)',
                      background: pin ? '#FAEEDA' : '#fff',
                    }}
                  />
                </div>
              )
            })}
          </div>
          <p className="text-[11px] text-mid mt-3">
            Saves at <code>user_verified</code> trust (70), which outranks enrichment but leaves the
            value improvable.
          </p>
          <label className="flex items-center gap-2 mt-2 text-[11px] text-mid">
            <input type="checkbox" checked={lock} onChange={e => setLock(e.target.checked)} />
            Lock these values. Writes as admin and pins them, so nothing automated can ever update
            them again.
          </label>
        </div>
      )}

      {/* Your reasoning. Always visible: it was previously revealed only after a
          class was chosen, which hid its existence and forced you to classify
          before writing, when in practice the note is often how you work the
          classification out. */}
      <div className="mb-4">
        <label className="block text-xs font-semibold text-mid mb-1.5" style={{ fontFamily: UI }}>
          Your note{cls && noteRequiredFor(cls) && <span style={{ color: '#993C1D' }}> (required)</span>}
        </label>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={2}
          placeholder={cls && noteRequiredFor(cls)
            ? 'Nothing is written to the grant for this class, so this is the only record of why. What did you check?'
            : 'Why you decided this. Anything worth knowing later.'}
          className="w-full rounded-lg px-3 py-2 text-xs"
          style={{ border: '0.5px solid rgba(0,0,0,0.14)', fontFamily: 'inherit', resize: 'vertical' }}
        />
      </div>

      {/* Result — never softened. A write that did not land must say so. */}
      {result && (
        <div
          className="rounded-lg px-4 py-3 mb-3 text-xs"
          style={result.ok
            ? { background: '#F1F7E4', color: '#3B6D11', border: '0.5px solid rgba(59,109,17,0.2)' }
            : { background: '#FAECE7', color: '#993C1D', border: '0.5px solid rgba(153,60,29,0.25)' }}
        >
          <p className="font-semibold" style={{ fontFamily: UI }}>{result.message}</p>
          {result.merge && result.merge.rejected.length > 0 && (
            <>
              <ul className="mt-1.5 space-y-0.5">
                {result.merge.rejected.map(r => {
                  const pin = pinByField.get(r.field)
                  return (
                    <li key={r.field}>
                      <code>{r.field}</code> not saved ({r.reason})
                      {pin && <> — blocked by <code>{pin.source}</code>{pin.set_at ? ` from ${pin.set_at.slice(0, 10)}` : ''}</>}
                    </li>
                  )
                })}
              </ul>
              {result.merge.rejected.some(r => r.reason === 'pinned' || r.reason === 'lower_trust') && (
                <button
                  onClick={() => submit('applied', true)}
                  disabled={busy}
                  className="mt-2 rounded-lg px-3 py-1.5 text-[11px] font-semibold"
                  style={{ background: '#993C1D', color: '#fff' }}
                >
                  Override with admin lock
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => submit('applied')}
          disabled={busy || cls !== 'catalogue_gap' || Object.keys(corrections).length === 0}
          className="rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-40"
          style={{ background: '#8ECB3C', color: '#173404', fontFamily: UI }}
          title={
            !cls                        ? 'Pick what kind of problem this is first'
            : cls !== 'catalogue_gap'   ? `${TRIAGE_CLASS_LABEL[cls]} never writes to the grant, so there is nothing to accept. Use Record and close.`
            : Object.keys(corrections).length === 0 ? 'Edit a field above to accept a correction'
            : undefined
          }
        >
          {busy ? 'Saving…' : `Accept${Object.keys(corrections).length ? ` (${Object.keys(corrections).length})` : ''}`}
        </button>
        <button
          onClick={() => submit('rejected')}
          disabled={busy || !cls || (noteRequiredFor(cls) && note.trim().length === 0)}
          className="rounded-lg border px-4 py-2 text-xs font-semibold text-charcoal disabled:opacity-40"
          style={{ borderColor: '#2C2C2A', fontFamily: UI }}
        >
          {/* "Close with no change" reads like discard, but this button saves the
              class and the note either way. For the classes that can never write
              to the grant, "no change" is not a choice the admin is making, so
              saying so is misleading. */}
          {cls && noteRequiredFor(cls) ? 'Record and close' : 'Close with no change'}
        </button>
        {grant?.apply_url && (
          <a href={grant.apply_url} target="_blank" rel="noopener noreferrer" className="text-xs text-sage underline">
            Funder page ↗
          </a>
        )}
      </div>
    </div>
  )
}
