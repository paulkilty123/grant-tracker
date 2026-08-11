'use client'

// The grant detail view.
//
// ── The pinning rule, inherited from the Review Inbox ────────────────────────
// /api/admin/update-grant stamps pinned:true on EVERY field an admin session
// sends. The old Grant Manager staged a near-complete form after each enrich
// (Detect all auto-fired) and then Save pinned all of it, including values
// nobody had looked at — 54% of the live catalogue carries such a pin.
//
// So this page NEVER sends a field the reviewer did not deliberately change.
// It is read-first: everything is displayed, and only explicit single-field
// actions write. There is no "Save all".

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import GrantDetailModal from '@/components/GrantDetailModal'
import { useToast } from '@/components/ui/Toast'
import type { ReviewReason, FieldDiff } from '@/lib/admin/review-reasons'

const display = { fontFamily: 'var(--font-space-grotesk)' } as const
const gbp = (n: unknown) => (typeof n === 'number' ? `£${n.toLocaleString('en-GB')}` : '—')
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null)
const arr = (v: unknown) => (Array.isArray(v) ? v.map(String) : [])

const SEV: Record<string, { bg: string; ink: string }> = {
  critical: { bg: 'var(--coral-pale)', ink: 'var(--coral-deep)' },
  check:    { bg: 'var(--amber-pale)', ink: 'var(--amber-deep)' },
  changed:  { bg: 'var(--blue-pale)',  ink: 'var(--blue-deep)' },
}

/** The 13 brief fields, in the order a reviewer reads them. */
const BRIEF_FIELDS: Array<[string, string]> = [
  ['what_they_fund',     'What they fund'],
  ['who_can_apply',      'Who can apply'],
  ['typical_award',      'Typical award'],
  ['geographic_focus',   'Where'],
  ['priorities',         'Priorities'],
  ['exclusions',         'What they will not fund'],
  ['strong_application', 'What makes a strong application'],
  ['decision_timeline',  'Decision timeline'],
  ['funder_tips',        'Tips'],
]

type Source = { label: string; url: string; text: string }

/** One user's flag on this grant, plus whatever was decided about it. */
export type GrantFeedback = {
  id: string
  direction: 'up' | 'down'
  reasons: string[] | null
  free_text: string | null
  match_score_at_time: number
  created_at: string
  reviewed_at: string | null
  resolution: string | null
  triage_class: string | null
  reviewer_note: string | null
}

export function GrantDetail({ row, reasons, diffs, feedback = [] }: {
  row: Record<string, unknown>
  reasons: ReviewReason[]
  diffs: FieldDiff[]
  feedback?: GrantFeedback[]
}) {
  const router = useRouter()
  const toast = useToast()
  const id = String(row.id)

  const [busy, setBusy] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [sources, setSources] = useState<Source[]>(
    // Seeded from grant_sources so previously saved sources reappear rather than
    // looking like they were lost.
    (Array.isArray(row.grant_sources) ? row.grant_sources : []).map((s: unknown) => {
      const o = (s ?? {}) as Record<string, unknown>
      return { label: String(o.label ?? ''), url: String(o.url ?? ''), text: String(o.text ?? '') }
    }),
  )

  const brief = (row.funder_brief ?? null) as Record<string, unknown> | null
  const cites = ((brief?._citations ?? {}) as Record<string, { snippet?: string; confidence?: string }>)
  const prov  = ((row.field_provenance ?? {}) as Record<string, { source?: string; pinned?: boolean }>)

  const run = useCallback(async (
    label: string, url: string, body: unknown, method: 'POST' | 'PATCH' = 'POST',
  ): Promise<boolean> => {
    setBusy(label)
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        toast.error(`${label} failed: ${j.error ?? `HTTP ${res.status}`}`)
        return false
      }
      // A write the trust ladder refused is not a success. Saying nothing is how
      // "I fixed it and it reverted" happens.
      const j = await res.json().catch(() => ({})) as { rejected?: { field: string; reason: string }[] }
      const pinned = (j.rejected ?? []).filter(r => r.reason === 'pinned').map(r => r.field)
      if (pinned.length) {
        toast.error(`${label}: ${pinned.join(', ')} is pinned to an earlier decision and did not change.`)
        return false
      }
      return true
    } catch (err) {
      toast.error(`${label} failed: ${err instanceof Error ? err.message : String(err)}`)
      return false
    } finally {
      setBusy(null)
    }
  }, [toast])

  const reRead = useCallback(async (withSources: boolean) => {
    const usable = sources.filter(s => s.text.trim().length > 50 || s.url.trim().length > 5)
    const label = withSources ? `Reading the page and ${usable.length} extra ${usable.length === 1 ? 'source' : 'sources'}` : 'Reading the page'
    if (!await run(label, '/api/admin/enrich-grant', withSources ? { grantId: id, additionalSources: usable } : { grantId: id })) return
    // enrich writes the brief and amounts; it never writes tags. Re-tagging has
    // to follow or the fields most likely to be wrong are the ones left alone.
    if (!await run('Re-tagging', '/api/admin/classify-grants', {
      grant_ids: [id], include_review: true, force: true, preserve_empty: true,
    })) {
      toast.error('The page was read and the summary updated, but re-tagging failed.')
      router.refresh(); return
    }
    toast.success('Re-read and re-tagged')
    router.refresh()
  }, [id, sources, run, router, toast])

  const setActive = useCallback(async (next: boolean) => {
    // is_active and pipeline_state move together. Setting only is_active leaves
    // a row invisible to users but stuck in a queue state, which is the desync
    // that hides rows from every admin view.
    const fields = next
      ? { is_active: true, pipeline_state: 'published' }
      : { is_active: false, pipeline_state: 'archived' }
    if (!await run(next ? 'Publishing' : 'Hiding', '/api/admin/update-grant', { id, fields }, 'PATCH')) return
    toast.success(next ? 'Published — users can see it' : 'Hidden from users')
    router.refresh()
  }, [id, run, router, toast])

  const fixLink = useCallback(async () => {
    const next = window.prompt('Application link', String(row.apply_url ?? ''))
    if (!next || !next.trim() || next.trim() === row.apply_url) return
    if (!await run('Saving the link', '/api/admin/update-grant', {
      id, fields: { apply_url: next.trim(), url_status: 'unchecked', url_last_checked: null, url_quality_score: null },
    }, 'PATCH')) return
    toast.success('Link saved')
    router.refresh()
  }, [id, row.apply_url, run, router, toast])

  const isActive = row.is_active === true

  return (
    <>
      <header style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 16px', alignItems: 'baseline', justifyContent: 'space-between', margin: '10px 0 6px' }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ ...display, fontSize: 23, fontWeight: 500, letterSpacing: '-0.02em', margin: 0 }}>
            {String(row.title ?? 'Untitled')}
          </h1>
          <div style={{ color: 'var(--color-text-secondary)', fontSize: 13.5 }}>{String(row.funder ?? '')}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {isActive
            ? <Pill bg="var(--green-pale-1)" ink="var(--green-text-deep)">Live to users</Pill>
            : <Pill bg="var(--bg-pill-neutral)" ink="var(--color-text-secondary)">Hidden</Pill>}
          <Pill bg="var(--cream-1)" ink="var(--color-text-tertiary)">{String(row.pipeline_state ?? '').replace(/_/g, ' ')}</Pill>
        </div>
      </header>

      {reasons.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '12px 0 0' }}>
          {reasons.map(r => {
            const s = SEV[r.severity] ?? SEV.changed
            return (
              <span key={r.code} style={{ fontSize: 12, borderRadius: 8, padding: '4px 9px', background: s.bg, color: s.ink, display: 'inline-flex', gap: 6, alignItems: 'baseline' }}>
                <b style={{ ...display, fontWeight: 700, fontSize: 11 }}>{r.label}</b>
                <span style={{ opacity: 0.9 }}>{r.detail}</span>
              </span>
            )
          })}
        </div>
      )}

      {/* ── Actions ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', margin: '16px 0 22px' }}>
        <button onClick={() => reRead(false)} disabled={!!busy} style={primaryBtn}>
          {busy ?? 'Re-read the page'}
        </button>
        <button onClick={fixLink} disabled={!!busy} style={secondaryBtn}>Fix the link</button>
        {str(row.apply_url) && (
          <a href={String(row.apply_url)} target="_blank" rel="noopener noreferrer" style={secondaryBtn}>Open funder page</a>
        )}
        <button onClick={() => setShowPreview(true)} disabled={!!busy} style={secondaryBtn}>
          See what a user sees
        </button>
        <span style={{ flex: '1 1 auto' }} />
        <button onClick={() => setActive(!isActive)} disabled={!!busy} style={isActive ? dangerBtn : primaryBtn}>
          {isActive ? 'Hide from users' : 'Publish'}
        </button>
      </div>

      <div style={{ display: 'grid', gap: 22, gridTemplateColumns: 'minmax(0, 1fr)' }}>

        {/* ── What is recorded ─────────────────────────────────────────── */}
        <Section title="What is recorded">
          <Grid>
            <Field k="Amount"      p={prov.amount_max}>{gbp(row.amount_min)} to {gbp(row.amount_max)}</Field>
            <Field k="Deadline"    p={prov.deadline}>{str(row.deadline) ?? (row.is_rolling ? 'Rolling' : 'none')}</Field>
            <Field k="Next opens"  p={prov.next_open_date}>{str(row.next_open_date) ?? 'not recorded'}</Field>
            <Field k="Where"       p={prov.location_tag}>{str(row.location_tag) ?? 'not recorded'}</Field>
            <Field k="Funding type" p={prov.funding_type}>{str(row.funding_type) ?? 'not recorded'}</Field>
            <Field k="Link status">{str(row.url_status) ?? 'unchecked'}</Field>
            {/* Both of these were already stored and already used — invite-only
                drives a badge and a filter on Find Funding, and the income
                limits are a hard eligibility gate that caps the match score at
                30. Neither was shown here, so the one screen meant to say what
                is recorded was silent about the two fields users complain about
                most. */}
            <Field k="Invite only" p={prov.is_invite_only}>
              {row.is_invite_only === true
                ? <span style={{ color: 'var(--coral-deep)' }}>yes, applications not accepted</span>
                : row.is_invite_only === false ? 'no' : 'not recorded'}
            </Field>
            <Field k="Income limits" p={prov.max_org_income ?? prov.min_org_income}>
              {row.min_org_income == null && row.max_org_income == null
                ? 'none recorded'
                : `${row.min_org_income == null ? 'no floor' : gbp(row.min_org_income)} to ${row.max_org_income == null ? 'no cap' : gbp(row.max_org_income)}`}
            </Field>
          </Grid>
        </Section>

        {/* ── What users said ──────────────────────────────────────────
            Put here, next to the values, because this is where someone decides
            whether a row is right. Previously a flag and its triage note lived
            only in match_feedback and were unreachable outside SQL. */}
        {feedback.length > 0 && (
          <Section title={`What users said (${feedback.length})`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {feedback.map(f => (
                <div key={f.id} style={{
                  background: f.direction === 'down' ? 'var(--coral-pale, #FAECE7)' : 'var(--color-surface-2, #F1F7E4)',
                  borderRadius: 10, padding: '12px 14px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                    <span style={{ ...display, fontSize: 11.5 }}>
                      {f.direction === 'down' ? 'Not for us' : 'Good match'} · scored {f.match_score_at_time}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                      {f.created_at.slice(0, 10)}
                      {f.reviewed_at ? ` · triaged ${f.reviewed_at.slice(0, 10)}` : ' · not yet triaged'}
                    </span>
                  </div>
                  {f.free_text && <p style={{ fontSize: 13.5, marginTop: 6 }}>&ldquo;{f.free_text}&rdquo;</p>}
                  {f.reasons && f.reasons.length > 0 && (
                    <p style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
                      {f.reasons.join(', ')}
                    </p>
                  )}
                  {f.triage_class && (
                    <p style={{ fontSize: 11.5, marginTop: 6 }}>
                      <strong style={{ ...display }}>{f.triage_class.replace(/_/g, ' ')}</strong>
                      {f.resolution ? ` — ${f.resolution}` : ''}
                    </p>
                  )}
                  {f.reviewer_note && (
                    <p style={{ fontSize: 12.5, marginTop: 6, whiteSpace: 'pre-wrap', opacity: 0.9 }}>
                      {f.reviewer_note}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ── Tags ─────────────────────────────────────────────────────── */}
        <Section title="Tags — what the matcher uses">
          <TagRow label="Eligibility" values={arr(row.eligible_structures)}  p={prov.eligible_structures} />
          <TagRow label="Sectors"     values={arr(row.impact_sectors)}       p={prov.impact_sectors} />
          <TagRow label="Who it helps" values={arr(row.target_beneficiaries)} p={prov.target_beneficiaries} />
          <TagRow label="Niche"       values={arr(row.niche_tags)}           p={prov.niche_tags} />
          <p style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)', margin: '10px 0 0', maxWidth: '76ch' }}>
            An empty eligibility list matches nobody, and a missing structure silently hides this fund
            from organisations that could apply. That is the more expensive direction of error, because
            nothing reports it.
          </p>
        </Section>

        {diffs.length > 0 && (
          <Section title="What the last re-read changed">
            {diffs.map(d => (
              <div key={d.field} style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', padding: '7px 0', borderBottom: '0.5px solid var(--border-light)', fontSize: 12.5 }}>
                <span style={{ ...display, minWidth: 130, color: 'var(--color-text-secondary)' }}>{d.field.replace(/_/g, ' ')}</span>
                {d.removed.length > 0 && <span style={{ color: 'var(--coral-deep)' }}>took away <b>{d.removed.join(', ')}</b></span>}
                {d.added.length > 0   && <span style={{ color: 'var(--blue-deep)' }}>added <b>{d.added.join(', ')}</b></span>}
              </div>
            ))}
          </Section>
        )}

        {/* ── The brief ─────────────────────────────────────────────────── */}
        <Section title="Enriched summary">
          {!brief ? (
            <Empty>Nothing has been written yet. Re-read the page to generate it.</Empty>
          ) : (
            <>
              {brief.source === 'knowledge_fallback' && (
                <div style={{ fontSize: 12.5, background: 'var(--coral-pale)', color: 'var(--coral-deep)', borderRadius: 'var(--radius-input)', padding: '10px 13px', marginBottom: 12 }}>
                  <b style={{ ...display }}>This was written from memory, not from the funder&rsquo;s page.</b>{' '}
                  The page could not be read, so amounts and dates were deliberately dropped. Treat
                  everything below as unverified until a re-read succeeds.
                </div>
              )}
              {brief.source === 'desk_research' && (
                <div style={{ fontSize: 12.5, background: 'var(--cream)', color: 'var(--mid)', borderRadius: 'var(--radius-input)', padding: '10px 13px', marginBottom: 12 }}>
                  <b style={{ ...display }}>Desk research, not a full enrichment.</b>{' '}
                  Who can apply and what they fund were read from the funder&rsquo;s page by hand.
                  Priorities, typical award, exclusions and decision timeline are still missing.
                  Re-enrich to complete it.
                </div>
              )}
              {BRIEF_FIELDS.map(([key, label]) => {
                const v = str(brief[key])
                if (!v) return null
                const c = cites[key]
                return (
                  <div key={key} style={{ marginBottom: 13 }}>
                    <div style={{ ...display, fontSize: 10.5, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', marginBottom: 4 }}>
                      {label}
                      {c?.confidence && (
                        <span style={{
                          marginLeft: 8, borderRadius: 999, padding: '1px 7px', fontSize: 9.5, letterSpacing: '0.05em',
                          background: c.confidence === 'high' ? 'var(--green-pale-1)' : c.confidence === 'low' ? 'var(--coral-pale)' : 'var(--amber-pale)',
                          color: c.confidence === 'high' ? 'var(--green-text-deep)' : c.confidence === 'low' ? 'var(--coral-deep)' : 'var(--amber-deep)',
                        }}>{c.confidence}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 13.5, lineHeight: 1.6, maxWidth: '80ch' }}>{v}</div>
                    {c?.snippet && (
                      // The quote the value was derived from. It existed only inside
                      // a title="" tooltip before — unselectable and gone on mouse-out.
                      <div style={{ marginTop: 5, fontSize: 12, lineHeight: 1.55, color: 'var(--color-text-secondary)', background: 'var(--cream-1)', borderRadius: 'var(--radius-input)', padding: '8px 11px', maxWidth: '80ch' }}>
                        <q>{c.snippet}</q>
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}
        </Section>

        {/* ── Sources ───────────────────────────────────────────────────── */}
        <Section title="Extra sources">
          <p style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', margin: '0 0 11px', maxWidth: '78ch' }}>
            When the main page is thin, or eligibility lives on a separate page such as an
            &ldquo;Essential information&rdquo; or &ldquo;Who can apply&rdquo; page, add it here. Paste a
            URL to have it fetched, or paste the text straight in when the funder blocks automated
            reading. Sources are saved with the grant and reused on future re-reads.
          </p>
          {sources.map((s, i) => (
            <div key={i} style={{ border: '0.5px solid var(--border-subtle)', borderRadius: 'var(--radius-input)', padding: 11, marginBottom: 9, display: 'grid', gap: 7 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={s.label} placeholder="Label (optional)"
                  onChange={e => setSources(v => v.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                  style={{ ...input, flex: '0 1 200px' }}
                />
                <input
                  value={s.url} placeholder="https://… (fetched automatically)"
                  onChange={e => setSources(v => v.map((x, j) => j === i ? { ...x, url: e.target.value } : x))}
                  style={{ ...input, flex: '1 1 260px' }}
                />
                <button onClick={() => setSources(v => v.filter((_, j) => j !== i))} style={miniBtn} aria-label="Remove source">✕</button>
              </div>
              <textarea
                value={s.text} placeholder="…or paste the page text here"
                onChange={e => setSources(v => v.map((x, j) => j === i ? { ...x, text: e.target.value } : x))}
                rows={3} style={{ ...input, resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => setSources(v => [...v, { label: '', url: '', text: '' }])} style={secondaryBtn}>
              + Add a source
            </button>
            {sources.length > 0 && (
              <button onClick={() => reRead(true)} disabled={!!busy} style={primaryBtn}>
                {busy ?? 'Re-read using these sources'}
              </button>
            )}
          </div>
        </Section>

        {/* ── Provenance ────────────────────────────────────────────────── */}
        <Section title="Where each value came from">
          <p style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', margin: '0 0 10px', maxWidth: '78ch' }}>
            A field written by an <code>admin:</code> source outranks every automated one, so nothing
            can improve it again without another admin write. That is deliberate for a decision you
            made, and a trap for one you did not.
          </p>
          <Grid>
            {Object.entries(prov).sort(([a], [b]) => a.localeCompare(b)).map(([field, p]) => (
              <div key={field} style={{ display: 'flex', gap: 10, fontSize: 12 }}>
                <code style={{ minWidth: 150, color: 'var(--color-text-tertiary)' }}>{field}</code>
                <span style={{ color: p?.source?.startsWith('admin:') ? 'var(--coral-deep)' : 'var(--color-text-secondary)' }}>
                  {p?.source ?? '—'}{p?.pinned ? ' · pinned' : ''}
                </span>
              </div>
            ))}
          </Grid>
        </Section>
      </div>

      {/* The genuine user-facing component, fetching the genuine public API. */}
      {showPreview && (
        <GrantDetailModal
          grantId={String(row.external_id ?? row.id)}
          onClose={() => setShowPreview(false)}
        />
      )}
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 style={{ ...display, fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', margin: '0 0 10px' }}>
        {title}
      </h2>
      <div style={{ background: '#fff', border: '0.5px solid var(--border-subtle)', borderRadius: 'var(--radius-card)', padding: '15px 17px' }}>
        {children}
      </div>
    </section>
  )
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gap: 7, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>{children}</div>
}

function Field({ k, p, children }: { k: string; p?: { source?: string; pinned?: boolean }; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 10, fontSize: 13, alignItems: 'baseline' }}>
      <span style={{ ...display, minWidth: 104, color: 'var(--color-text-tertiary)', fontSize: 11.5 }}>{k}</span>
      <span>{children}</span>
      {p?.pinned && <span style={{ ...display, fontSize: 9.5, color: 'var(--coral-deep)' }}>pinned</span>}
    </div>
  )
}

function TagRow({ label, values, p }: { label: string; values: string[]; p?: { source?: string; pinned?: boolean } }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 10px', alignItems: 'baseline', padding: '7px 0', borderBottom: '0.5px solid var(--border-light)' }}>
      <span style={{ ...display, minWidth: 104, fontSize: 11.5, color: 'var(--color-text-tertiary)' }}>{label}</span>
      {values.length === 0
        ? <span style={{ fontSize: 12.5, color: 'var(--coral-deep)' }}>none recorded</span>
        : values.map(v => (
            <span key={v} style={{ fontSize: 11.5, background: 'var(--cream-1)', borderRadius: 8, padding: '3px 9px' }}>{v}</span>
          ))}
      {p?.source && (
        <span style={{ ...display, fontSize: 10, color: p.source.startsWith('admin:') ? 'var(--coral-deep)' : 'var(--color-text-tertiary)', marginLeft: 'auto' }}>
          {p.source}{p.pinned ? ' · pinned' : ''}
        </span>
      )}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: 0 }}>{children}</p>
}

function Pill({ children, bg, ink }: { children: React.ReactNode; bg: string; ink: string }) {
  return <span style={{ ...display, fontSize: 10.5, fontWeight: 500, borderRadius: 8, padding: '3px 8px', background: bg, color: ink }}>{children}</span>
}

const input: React.CSSProperties = {
  fontSize: 12.5, padding: '7px 10px', borderRadius: 'var(--radius-input)',
  border: '0.5px solid var(--border-subtle)', background: '#fff',
  color: 'var(--color-text-primary)', minWidth: 0, width: '100%',
}
const primaryBtn: React.CSSProperties = {
  fontFamily: 'var(--font-space-grotesk)', fontSize: 12.5, fontWeight: 600,
  borderRadius: 'var(--radius-input)', padding: '8px 16px', cursor: 'pointer',
  border: '0.5px solid transparent', background: 'var(--green-lime)', color: 'var(--green-deep)',
}
const secondaryBtn: React.CSSProperties = {
  fontFamily: 'var(--font-space-grotesk)', fontSize: 12.5, fontWeight: 600,
  borderRadius: 'var(--radius-input)', padding: '8px 16px', cursor: 'pointer',
  border: '0.5px solid var(--border-subtle)', background: '#fff',
  color: 'var(--color-text-primary)', textDecoration: 'none',
}
const dangerBtn: React.CSSProperties = {
  fontFamily: 'var(--font-space-grotesk)', fontSize: 12.5, fontWeight: 600,
  borderRadius: 'var(--radius-input)', padding: '8px 16px', cursor: 'pointer',
  border: '0.5px solid transparent', background: 'transparent', color: 'var(--coral-deep)',
}
const miniBtn: React.CSSProperties = {
  fontFamily: 'var(--font-space-grotesk)', fontSize: 12, borderRadius: 8,
  border: '0.5px solid var(--border-subtle)', background: '#fff',
  color: 'var(--color-text-secondary)', padding: '4px 9px', cursor: 'pointer',
}
