'use client'

// The Inbox list.
//
// ── The pinning rule, which is the whole point of rebuilding this ────────────
// /api/admin/update-grant stamps `pinned: true` on EVERY field in the payload
// whenever an admin session calls it (route.ts:57 — an admin session cannot be
// downgraded). The old Grant Manager sent its entire form state on save, so
// fields nobody had looked at were recorded as human decisions and frozen at
// trust 100 against all future AI correction. 54% of the live catalogue carries
// at least one such pin, and it blocked 78 corrections in one afternoon.
//
// So this component NEVER sends a field the reviewer did not deliberately set:
//
//   Accept   — writes NO fields at all. Accepting a machine suggestion is not a
//              decision about the value, it is a confirmation that the machine
//              was right. The value keeps its ai_classifier provenance and stays
//              improvable. Only is_active is sent, and is_active is untracked so
//              it pins nothing.
//   Revert   — writes that ONE field. This IS a human overruling the machine,
//              so pinning it is correct.
//   Reject   — writes pipeline_state + rejection_reason. Neither is tracked.
//
// The result: reviewing a row no longer degrades the machine's ability to
// improve it. That is what makes the review queue shrink over time instead of
// calcifying.

import { useMemo, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/Toast'
import type { ReviewReason, FieldDiff } from '@/lib/admin/review-reasons'

export type QueueItem = {
  id: string
  title: string
  funder: string
  applyUrl: string | null
  isActive: boolean
  pipelineState: string
  reasons: ReviewReason[]
  /** 0 = one click from done, 3 = cannot be judged until the page is read. */
  readiness: number
  diffs: FieldDiff[]
  brief: {
    source: string | null
    whoCanApply: string | null
    typicalAward: string | null
    whatTheyFund: string | null
    citations: Record<string, { snippet: string; confidence: string } | null>
  } | null
  values: {
    amountMin: number | null
    amountMax: number | null
    deadline: string | null
    isRolling: boolean
    structures: string[]
    sectors: string[]
  }
}

const SEV_STYLE: Record<string, { bg: string; ink: string; edge: string }> = {
  critical: { bg: 'var(--coral-pale)', ink: 'var(--coral-deep)', edge: 'var(--coral-saturated)' },
  check:    { bg: 'var(--amber-pale)', ink: 'var(--amber-deep)', edge: 'var(--amber-saturated)' },
  changed:  { bg: 'var(--blue-pale)',  ink: 'var(--blue-deep)',  edge: 'var(--blue-saturated)' },
}

const display = { fontFamily: 'var(--font-space-grotesk)' } as const
const gbp = (n: number | null) => (n === null ? '—' : `£${n.toLocaleString('en-GB')}`)

export function ReviewQueue({ items }: { items: QueueItem[] }) {
  const router = useRouter()
  const toast = useToast()
  const [openId, setOpenId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [busyLabel, setBusyLabel] = useState<string | null>(null)
  const [done, setDone] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<string | null>(null)

  const live = useMemo(() => items.filter(i => !done.has(i.id)), [items, done])

  const counts = useMemo(() => {
    const m = new Map<string, { label: string; n: number }>()
    for (const i of live) {
      for (const r of i.reasons) {
        const cur = m.get(r.code) ?? { label: r.label.replace(/\d+/g, 'N'), n: 0 }
        cur.n++
        m.set(r.code, cur)
      }
    }
    return Array.from(m.entries()).sort((a, b) => b[1].n - a[1].n)
  }, [live])

  const shown = filter ? live.filter(i => i.reasons.some(r => r.code === filter)) : live
  const liveToUsers = live.filter(i => i.isActive).length

  /** Single place every write goes through, so a failure can never look like success. */
  const patch = useCallback(async (
    id: string,
    fields: Record<string, unknown>,
    what: string,
  ): Promise<boolean> => {
    const res = await fetch('/api/admin/update-grant', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, fields }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      toast.error(`${what} failed: ${j.error ?? `HTTP ${res.status}`}`)
      return false
    }
    const j = await res.json().catch(() => ({})) as { rejected?: { field: string; reason: string }[] }
    // A write the trust ladder refused is NOT a success. The old screen counted
    // it as one and the row simply did not change, with nothing said.
    if (j.rejected?.length) {
      const pinnedFields = j.rejected.filter(r => r.reason === 'pinned').map(r => r.field)
      if (pinnedFields.length) {
        toast.error(`${what}: ${pinnedFields.join(', ')} is pinned to an earlier admin decision and was not changed.`)
        return false
      }
    }
    return true
  }, [toast])

  const publish = useCallback(async (item: QueueItem) => {
    setBusyId(item.id)
    // Only is_active. No tag values are sent, so accepting the machine's work
    // pins nothing and leaves it improvable.
    const ok = await patch(item.id, { is_active: true }, 'Publishing')
    setBusyId(null)
    if (!ok) return
    setDone(d => new Set(d).add(item.id))
    toast.success(`Published ${item.title}`)
    router.refresh()
  }, [patch, router, toast])

  const revertField = useCallback(async (item: QueueItem, diff: FieldDiff) => {
    setBusyId(item.id)
    // A deliberate override of the machine, so this one field is written and
    // pinned. That is the correct use of a pin.
    const ok = await patch(item.id, { [diff.field]: diff.before }, `Reverting ${diff.field}`)
    setBusyId(null)
    if (!ok) return
    toast.success(`${diff.field} reverted`)
    router.refresh()
  }, [patch, router, toast])

  // ── Repair actions ────────────────────────────────────────────────────────
  // The first version of this page offered only Publish and Reject. For the
  // rows at the top of the queue — page unreadable, no eligibility, no deadline
  // — neither is a sane answer: publishing ships a grant nobody can match
  // against, rejecting throws away a real fund. The actual remedy is almost
  // always "read the page again", and for a bad apply_url, "fix the link first".
  // Without these the queue diagnosed problems and offered no treatment.

  const runJob = useCallback(async (
    id: string,
    url: string,
    body: Record<string, unknown>,
    label: string,
  ): Promise<boolean> => {
    setBusyId(id)
    setBusyLabel(label)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        toast.error(`${label} failed: ${j.error ?? `HTTP ${res.status}`}`)
        return false
      }
      // enrich-grant reports fields the trust ladder refused. Surfacing that is
      // the difference between "nothing happened" and "nothing happened because
      // an earlier admin decision is pinned".
      const j = await res.json().catch(() => ({})) as { rejected?: { field: string; reason: string }[] }
      const pinned = (j.rejected ?? []).filter(r => r.reason === 'pinned').map(r => r.field)
      if (pinned.length) {
        toast.error(`${label} ran, but ${pinned.join(', ')} is pinned to an earlier decision and did not change.`)
      }
      return true
    } catch (err) {
      toast.error(`${label} failed: ${err instanceof Error ? err.message : String(err)}`)
      return false
    } finally {
      setBusyId(null)
      setBusyLabel(null)
    }
  }, [toast])

  const reRead = useCallback(async (item: QueueItem) => {
    const ok = await runJob(item.id, '/api/admin/enrich-grant', { grantId: item.id }, 'Re-reading the page')
    if (!ok) return
    toast.success('Page re-read')
    router.refresh()
  }, [runJob, router, toast])

  const reClassify = useCallback(async (item: QueueItem) => {
    const ok = await runJob(item.id, '/api/admin/classify-grants', {
      grant_ids:      [item.id],
      include_review: true,
      force:          true,
      // Automated re-tag: an empty array from the model must not wipe good tags.
      preserve_empty: true,
    }, 'Re-tagging')
    if (!ok) return
    toast.success('Re-tagged')
    router.refresh()
  }, [runJob, router, toast])

  const fixLink = useCallback(async (item: QueueItem) => {
    const next = window.prompt(
      `Application link for "${item.title}"\n\nThe page could not be read, which is usually a wrong or moved URL. Paste the correct one and it will be re-read straight away.`,
      item.applyUrl ?? '',
    )
    if (!next || !next.trim() || next.trim() === item.applyUrl) return

    setBusyId(item.id)
    setBusyLabel('Saving the link')
    // apply_url IS tracked, so this pins — correctly. A URL you typed is a real
    // decision, unlike the tag values Publish deliberately leaves alone.
    const saved = await patch(item.id, {
      apply_url: next.trim(),
      url_status: 'unchecked',
      url_last_checked: null,
      url_quality_score: null,
      url_quality_issues: [],
    }, 'Saving the link')
    setBusyId(null)
    setBusyLabel(null)
    if (!saved) return
    toast.success('Link saved — re-reading')
    await reRead(item)
  }, [patch, reRead, toast])

  const reject = useCallback(async (item: QueueItem) => {
    const reason = window.prompt(
      `Why is "${item.title}" not right for the catalogue?\n\nThis is recorded, so a future pass knows not to re-add it.`,
    )
    if (!reason || !reason.trim()) return
    setBusyId(item.id)
    const ok = await patch(item.id, {
      is_active: false,
      pipeline_state: 'rejected',
      rejection_reason: reason.trim(),
    }, 'Rejecting')
    setBusyId(null)
    if (!ok) return
    setDone(d => new Set(d).add(item.id))
    toast.success('Rejected, with the reason recorded')
    router.refresh()
  }, [patch, router, toast])

  return (
    <main style={{ padding: '30px 24px 80px', maxWidth: 1180, margin: '0 auto' }}>

      <h1 style={{ ...display, fontSize: 25, fontWeight: 500, letterSpacing: '-0.02em', margin: '0 0 5px' }}>
        Review queue
      </h1>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 13.5, margin: '0 0 22px', maxWidth: '64ch' }}>
        Ordered by how much it needs you. Every row says why it stopped and shows the evidence behind it.
      </p>

      {/* The honest count. The old screen's header asserted these were not
          visible to users while its query never filtered on that. */}
      {liveToUsers > 0 && (
        <div style={{
          display: 'flex', gap: 11, alignItems: 'flex-start',
          background: 'var(--coral-pale)', color: 'var(--coral-deep)',
          borderRadius: 'var(--radius-card)', padding: '13px 16px',
          marginBottom: 22, fontSize: 13, lineHeight: 1.45,
        }}>
          <span style={{ ...display, fontWeight: 700 }}>!</span>
          <span>
            <strong style={{ ...display, fontWeight: 700 }}>
              {liveToUsers} of these {live.length} are already visible to users.
            </strong>{' '}
            Publishing confirms what people can see rather than revealing it for the first time.
          </span>
        </div>
      )}

      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 7, alignItems: 'center',
        paddingBottom: 12, borderBottom: '0.5px solid var(--border-subtle)', marginBottom: 16,
      }}>
        <span style={{
          ...display, fontSize: 10.5, fontWeight: 500, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: 'var(--color-text-tertiary)', marginRight: 2,
        }}>Why held</span>
        <Chip active={filter === null} onClick={() => setFilter(null)} label="All" n={live.length} />
        {counts.map(([code, { label, n }]) => (
          <Chip key={code} active={filter === code} onClick={() => setFilter(code)} label={label} n={n} />
        ))}
      </div>

      {shown.length === 0 ? (
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>
          {live.length === 0
            ? 'Nothing waiting. The queue is genuinely empty.'
            : 'No rows match that filter.'}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {shown.map(item => (
            <Row
              key={item.id}
              item={item}
              open={openId === item.id}
              busy={busyId === item.id}
              onToggle={() => setOpenId(openId === item.id ? null : item.id)}
              busyLabel={busyLabel}
              onPublish={() => publish(item)}
              onReject={() => reject(item)}
              onRevert={(d) => revertField(item, d)}
              onReRead={() => reRead(item)}
              onReClassify={() => reClassify(item)}
              onFixLink={() => fixLink(item)}
            />
          ))}
        </div>
      )}
    </main>
  )
}

function Chip({ active, onClick, label, n }: { active: boolean; onClick: () => void; label: string; n: number }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      style={{
        ...display, fontSize: 12, fontWeight: 500, cursor: 'pointer',
        background: active ? 'var(--green-deep)' : 'var(--bg-pill-neutral)',
        color: active ? 'var(--green-pale-2)' : 'var(--color-text-secondary)',
        border: '0.5px solid transparent', borderRadius: 999,
        padding: '5px 12px', display: 'inline-flex', alignItems: 'center', gap: 7,
      }}
    >
      {label}
      <span style={{ fontVariantNumeric: 'tabular-nums', opacity: 0.72, fontSize: 11.5 }}>{n}</span>
    </button>
  )
}

function Row({
  item, open, busy, busyLabel, onToggle, onPublish, onReject, onRevert,
  onReRead, onReClassify, onFixLink,
}: {
  item: QueueItem
  open: boolean
  busy: boolean
  busyLabel: string | null
  onToggle: () => void
  onPublish: () => void
  onReject: () => void
  onRevert: (d: FieldDiff) => void
  onReRead: () => void
  onReClassify: () => void
  onFixLink: () => void
}) {
  const worst = item.reasons.reduce<string>((acc, r) => {
    if (acc === 'critical' || r.severity === 'critical') return 'critical'
    if (acc === 'check' || r.severity === 'check') return 'check'
    return 'changed'
  }, 'changed')
  const sev = SEV_STYLE[worst] ?? SEV_STYLE.changed

  return (
    <article style={{
      background: '#fff', border: '0.5px solid var(--border-subtle)',
      borderRadius: 'var(--radius-card)', overflow: 'hidden',
      display: 'grid', gridTemplateColumns: '4px 1fr',
    }}>
      <div style={{ background: sev.edge }} />
      <div style={{ padding: '14px 17px', minWidth: 0 }}>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 14px', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div style={{ minWidth: 0 }}>
            <button
              onClick={onToggle}
              style={{
                ...display, fontWeight: 500, fontSize: 15, letterSpacing: '-0.01em',
                background: 'none', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left',
                color: 'var(--color-text-primary)',
              }}
            >
              {item.title}
            </button>
            <div style={{ color: 'var(--color-text-secondary)', fontSize: 12.5 }}>{item.funder}</div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            {item.isActive && <Pill bg="var(--coral-pale)" ink="var(--coral-deep)">Live to users</Pill>}
            {!item.isActive && <Pill bg="var(--bg-pill-neutral)" ink="var(--color-text-secondary)">Held</Pill>}
            <Pill bg="var(--cream-1)" ink="var(--color-text-secondary)" mono>{item.pipelineState}</Pill>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 11 }}>
          {item.reasons.map(r => {
            const s = SEV_STYLE[r.severity] ?? SEV_STYLE.changed
            return (
              <span key={r.code} style={{
                fontSize: 12, borderRadius: 'var(--radius-badge, 8px)', padding: '4px 9px',
                background: s.bg, color: s.ink, display: 'inline-flex', gap: 6, alignItems: 'baseline',
              }}>
                <b style={{ ...display, fontWeight: 700, fontSize: 11 }}>{r.label}</b>
                <span style={{ opacity: 0.9 }}>{r.detail}</span>
              </span>
            )
          })}
        </div>

        {open && (
          <div style={{
            marginTop: 14, borderTop: '0.5px solid var(--border-light)', paddingTop: 14,
            display: 'grid', gap: 14,
          }}>
            {item.diffs.length > 0 && (
              <div>
                <SectionLabel>What the re-read changed</SectionLabel>
                <div style={{ border: '0.5px solid var(--border-subtle)', borderRadius: 'var(--radius-input)', overflow: 'hidden' }}>
                  {item.diffs.map((d, i) => (
                    <div key={d.field} style={{
                      display: 'grid', gridTemplateColumns: '160px 1fr auto', gap: 12, alignItems: 'center',
                      padding: '9px 12px', background: '#fff',
                      borderTop: i === 0 ? undefined : '0.5px solid var(--border-light)',
                    }}>
                      <code style={{ fontSize: 11.5, color: 'var(--color-text-secondary)' }}>{d.field}</code>
                      <div style={{ fontSize: 12.5, display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                        {d.removed.length > 0 && (
                          <span style={{ color: 'var(--coral-deep)', fontWeight: 600 }}>
                            removed: {d.removed.join(', ')}
                          </span>
                        )}
                        {d.added.length > 0 && (
                          <span style={{ color: 'var(--blue-deep)', fontWeight: 500 }}>
                            added: {d.added.join(', ')}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => onRevert(d)}
                        disabled={busy}
                        style={miniBtn}
                      >
                        Revert
                      </button>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)', margin: '7px 0 0' }}>
                  Publishing accepts these as they stand and writes nothing, so they can still be
                  improved automatically. Reverting is recorded as your decision and will not be
                  overwritten.
                </p>
              </div>
            )}

            {item.brief && (
              <div>
                <SectionLabel>Evidence</SectionLabel>
                {item.brief.source === 'knowledge_fallback' && (
                  <p style={{
                    fontSize: 12.5, background: 'var(--coral-pale)', color: 'var(--coral-deep)',
                    borderRadius: 'var(--radius-input)', padding: '9px 12px', margin: '0 0 9px',
                  }}>
                    The funder&rsquo;s page could not be read, so this was written from memory.
                    Amounts and dates were deliberately dropped.
                  </p>
                )}
                {(['who_can_apply', 'typical_award', 'eligible_structures'] as const).map(k => {
                  const c = item.brief?.citations[k]
                  if (!c) return null
                  return (
                    <div key={k} style={{
                      background: 'var(--cream-1)', borderRadius: 'var(--radius-input)',
                      padding: '11px 13px', fontSize: 12.5, lineHeight: 1.55, marginBottom: 7,
                    }}>
                      <div style={{ ...display, fontSize: 10.5, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', marginBottom: 5 }}>
                        {k.replace(/_/g, ' ')}
                      </div>
                      <q>{c.snippet}</q>
                      <div style={{ marginTop: 7, fontSize: 11 }}>
                        <span style={{
                          ...display, fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
                          textTransform: 'uppercase', borderRadius: 999, padding: '2px 8px',
                          background: c.confidence === 'high' ? 'var(--green-pale-1)' : c.confidence === 'low' ? 'var(--coral-pale)' : 'var(--amber-pale)',
                          color: c.confidence === 'high' ? 'var(--green-text-deep)' : c.confidence === 'low' ? 'var(--coral-deep)' : 'var(--amber-deep)',
                        }}>{c.confidence} confidence</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div>
              <SectionLabel>Current values</SectionLabel>
              <div style={{ fontSize: 12.5, display: 'grid', gap: 4 }}>
                <Val k="amount">{gbp(item.values.amountMin)} – {gbp(item.values.amountMax)}</Val>
                <Val k="deadline">{item.values.deadline ?? (item.values.isRolling ? 'Rolling' : '— none —')}</Val>
                <Val k="eligibility">{item.values.structures.join(', ') || '— none —'}</Val>
                <Val k="sectors">{item.values.sectors.join(', ') || '— none —'}</Val>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              {/* Repair first. For a row that cannot be judged yet, publishing is
                  the wrong move and should not be the most prominent button. */}
              <button onClick={onReRead} disabled={busy} style={item.readiness >= 2 ? primaryBtn : secondaryBtn}>
                {busy && busyLabel ? `${busyLabel}…` : 'Re-read page'}
              </button>
              <button onClick={onFixLink} disabled={busy} style={secondaryBtn}>Fix link</button>
              <button onClick={onReClassify} disabled={busy} style={secondaryBtn}>Re-tag</button>
              {item.applyUrl && (
                <a href={item.applyUrl} target="_blank" rel="noopener noreferrer" style={secondaryBtn}>
                  Open funder page
                </a>
              )}
              <span style={{ flex: '1 1 auto' }} />
              <button onClick={onPublish} disabled={busy} style={item.readiness >= 2 ? secondaryBtn : primaryBtn}>
                {item.isActive ? 'Confirm & keep live' : 'Publish'}
              </button>
              <button onClick={onReject} disabled={busy} style={dangerBtn}>
                Reject
              </button>
            </div>
            {item.readiness >= 3 && (
              <p style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)', margin: '-6px 0 0' }}>
                Nothing on this row can be trusted until the page is read, so publishing it would
                ship values written from memory. Try re-reading, or fix the link first.
              </p>
            )}
          </div>
        )}
      </div>
    </article>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      ...display, fontSize: 10.5, fontWeight: 500, letterSpacing: '0.08em',
      textTransform: 'uppercase', color: 'var(--color-text-tertiary)', margin: '0 0 8px',
    }}>{children}</div>
  )
}

function Val({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <code style={{ fontSize: 11, color: 'var(--color-text-tertiary)', minWidth: 96 }}>{k}</code>
      <span>{children}</span>
    </div>
  )
}

function Pill({ children, bg, ink, mono }: { children: React.ReactNode; bg: string; ink: string; mono?: boolean }) {
  return (
    <span style={{
      ...(mono ? {} : display), fontSize: mono ? 10.5 : 11, fontWeight: 500,
      borderRadius: 8, padding: '3px 8px', whiteSpace: 'nowrap', background: bg, color: ink,
    }}>{children}</span>
  )
}

const miniBtn: React.CSSProperties = {
  fontFamily: 'var(--font-space-grotesk)', fontSize: 11.5, fontWeight: 500,
  borderRadius: 8, border: '0.5px solid var(--border-subtle)', background: '#fff',
  color: 'var(--color-text-secondary)', padding: '4px 10px', cursor: 'pointer', whiteSpace: 'nowrap',
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
