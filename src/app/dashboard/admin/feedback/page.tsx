'use client'

import { useEffect, useState } from 'react'

const ADMIN_EMAIL = 'paulkilty1@gmail.com'

interface FeedbackRow {
  id: string
  user_id: string
  grant_id: string
  direction: 'up' | 'down'
  reasons: string[] | null
  free_text: string | null
  match_score_at_time: number | null
  created_at: string
  updated_at: string
  grant_title?: string
}

interface DayStat { date: string; up: number; down: number }
interface ChipStat { reason: string; up: number; down: number }
interface HotGrant { grant_id: string; title: string; up: number; down: number; total: number; pctNeg: number }

const CHIP_LABELS: Record<string, string> = {
  right_size: 'Right size', right_sector: 'Right sector', right_timing: 'Right timing',
  good_eligibility: 'Good eligibility', matches_style: 'Matches style',
  wrong_size: 'Wrong size', wrong_sector: 'Wrong sector', wrong_timing: 'Wrong timing',
  eligibility_issue: 'Eligibility issue', wrong_style: 'Wrong style', something_else: 'Something else',
}

// Pastel positive/negative pair for this page's feedback-sentiment charts only.
// Deliberately not a design token: paired, self-contained, admin-only — see
// hex-token-map.ts's ONE_OFFS entry for why these two stay local rather than
// being swept onto state-success/state-error (both much darker/more saturated;
// mapping only one half would leave the chart mismatched).
const FEEDBACK_CHART = {
  positive: '#6dbf6d' /* eslint-disable-line no-restricted-syntax -- FEEDBACK_CHART's own definition — deliberately local, not a token, see hex-token-map.ts ONE_OFFS */, // "Good match" / up-votes
  negative: '#f4a0a0' /* eslint-disable-line no-restricted-syntax -- FEEDBACK_CHART's own definition — deliberately local, not a token, see hex-token-map.ts ONE_OFFS */, // "Not for us" / down-votes
} as const

function fmt(date: string) {
  return new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function AdminFeedbackPage() {
  const [rows, setRows] = useState<FeedbackRow[]>([])
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    fetch('/api/admin/feedback')
      .then(r => {
        if (r.status === 403) { setDenied(true); setLoading(false); return null }
        return r.json()
      })
      .then(data => {
        if (!data) return
        setRows(data.rows || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ padding: 48, fontFamily: 'DM Sans, sans-serif', color: 'var(--text-muted)' }}>Loading...</div>
  if (denied) return <div style={{ padding: 48, fontFamily: 'DM Sans, sans-serif', color: 'var(--state-error)' }}>Access denied.</div>

  const total = rows.length
  const upCount = rows.filter(r => r.direction === 'up').length
  const downCount = rows.filter(r => r.direction === 'down').length
  const freeTextCount = rows.filter(r => r.free_text && r.free_text.trim().length > 0).length

  const dayMap = new Map<string, { up: number; down: number }>()
  const now = new Date()
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i)
    dayMap.set(d.toISOString().slice(0, 10), { up: 0, down: 0 })
  }
  rows.forEach(r => {
    const key = r.created_at.slice(0, 10)
    if (dayMap.has(key)) {
      const slot = dayMap.get(key)!
      if (r.direction === 'up') slot.up++; else slot.down++
    }
  })
  const days: DayStat[] = Array.from(dayMap.entries()).map(([date, v]) => ({ date, ...v }))
  const maxDay = Math.max(1, ...days.map(d => d.up + d.down))

  const chipMap = new Map<string, { up: number; down: number }>()
  rows.forEach(r => {
    (r.reasons || []).forEach(reason => {
      if (!chipMap.has(reason)) chipMap.set(reason, { up: 0, down: 0 })
      const slot = chipMap.get(reason)!
      if (r.direction === 'up') slot.up++; else slot.down++
    })
  })
  const chipStats: ChipStat[] = Array.from(chipMap.entries())
    .map(([reason, v]) => ({ reason, ...v }))
    .sort((a, b) => (b.up + b.down) - (a.up + a.down))
  const maxChip = Math.max(1, ...chipStats.map(c => c.up + c.down))

  const grantMap = new Map<string, { title: string; up: number; down: number }>()
  rows.forEach(r => {
    if (!grantMap.has(r.grant_id)) grantMap.set(r.grant_id, { title: r.grant_title || r.grant_id, up: 0, down: 0 })
    const slot = grantMap.get(r.grant_id)!
    if (r.direction === 'up') slot.up++; else slot.down++
  })
  const hotGrants: HotGrant[] = Array.from(grantMap.entries())
    .map(([grant_id, v]) => ({ grant_id, title: v.title, up: v.up, down: v.down, total: v.up + v.down, pctNeg: v.up + v.down > 0 ? Math.round((v.down / (v.up + v.down)) * 100) : 0 }))
    .filter(g => g.total >= 2).sort((a, b) => b.total - a.total).slice(0, 20)

  const freeTexts = rows.filter(r => r.free_text && r.free_text.trim().length > 0)

  const s: Record<string, React.CSSProperties> = {
    page: { padding: '40px 48px', fontFamily: 'DM Sans, sans-serif', maxWidth: 1100, margin: '0 auto' },
    h1: { fontSize: 26, fontWeight: 700, color: 'var(--surface-inverse)', marginBottom: 8 },
    sub: { fontSize: 14, color: 'var(--text-muted)', marginBottom: 36 },
    statGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 40 },
    statCard: { background: 'var(--surface-page)', border: '1px solid var(--border-warm)', padding: '20px 24px' },
    statNum: { fontSize: 34, fontWeight: 700, color: 'var(--surface-inverse)', lineHeight: 1 },
    statLabel: { fontSize: 13, color: 'var(--text-muted)', marginTop: 6 },
    section: { marginBottom: 44 },
    sectionTitle: { fontSize: 15, fontWeight: 600, color: 'var(--text-body)', marginBottom: 16 },
    card: { background: 'var(--surface-card)', border: '1px solid var(--border-warm)', padding: '24px 28px' },
    table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 },
    th: { textAlign: 'left' as const, padding: '8px 12px', borderBottom: '1px solid var(--border-warm)', color: 'var(--text-muted)', fontWeight: 500 },
    td: { padding: '10px 12px', borderBottom: '1px solid var(--surface-pill)', verticalAlign: 'top' as const },
    warn: { color: 'var(--state-warning)', fontWeight: 600 },
  }

  const pillStyle = (dir: 'up' | 'down'): React.CSSProperties => ({
    display: 'inline-block', padding: '2px 8px', fontSize: 11, fontWeight: 600,
    background: dir === 'up' ? 'var(--type-inkind-pale)' : 'var(--type-investment-pale)',
    color: dir === 'up' ? 'var(--state-success)' : 'var(--state-error)',
  })

  return (
    <div style={s.page}>
      <div style={s.h1}>Match Feedback</div>
      <div style={s.sub}>All signals from thumbs up / down interactions.</div>

      <div style={s.statGrid}>
        {[
          { num: total, label: 'Total events' },
          { num: upCount, label: '👍 Good match' },
          { num: downCount, label: '👎 Not for us' },
          { num: freeTextCount, label: 'Free text entries' },
        ].map(({ num, label }) => (
          <div key={label} style={s.statCard}>
            <div style={s.statNum}>{num}</div>
            <div style={s.statLabel}>{label}</div>
          </div>
        ))}
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>Activity — last 30 days</div>
        <div style={s.card}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 80 }}>
            {days.map(d => {
              const h = Math.round(((d.up + d.down) / maxDay) * 72)
              const upH = d.up + d.down > 0 ? Math.round((d.up / (d.up + d.down)) * h) : 0
              const downH = h - upH
              return (
                <div key={d.date} title={`${d.date}: ${d.up} up ${d.down} down`} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                  {downH > 0 && <div style={{ height: downH, background: FEEDBACK_CHART.negative }} />}
                  {upH > 0 && <div style={{ height: upH, background: FEEDBACK_CHART.positive }} />}
                  {h === 0 && <div style={{ height: 2, background: 'var(--border-warm)' }} />}
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 11, color: 'var(--text-subtle)' }}>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, background: FEEDBACK_CHART.positive, marginRight: 4 }} />Good match</span>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, background: FEEDBACK_CHART.negative, marginRight: 4 }} />Not for us</span>
          </div>
        </div>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>Reason chips</div>
        <div style={s.card}>
          {chipStats.length === 0 && <div style={{ color: 'var(--text-subtle)', fontSize: 13 }}>No chips recorded yet.</div>}
          {chipStats.map(c => {
            const t = c.up + c.down
            const upPct = Math.round((c.up / t) * 100)
            return (
              <div key={c.reason} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                  <span style={{ fontWeight: 500 }}>{CHIP_LABELS[c.reason] ?? c.reason}</span>
                  <span style={{ color: 'var(--text-subtle)' }}>{c.up} up {c.down} down</span>
                </div>
                <div style={{ height: 12, background: 'var(--surface-pill)', overflow: 'hidden' }}>
                  <div style={{ width: `${(t / maxChip) * 100}%`, display: 'flex', height: '100%' }}>
                    <div style={{ width: `${upPct}%`, background: FEEDBACK_CHART.positive }} />
                    <div style={{ width: `${100 - upPct}%`, background: FEEDBACK_CHART.negative }} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>Grants with most signals</div>
        <div style={s.card}>
          {hotGrants.length === 0 && <div style={{ color: 'var(--text-subtle)', fontSize: 13 }}>No grants with 2+ events yet.</div>}
          {hotGrants.length > 0 && (
            <table style={s.table}>
              <thead>
                <tr>{['Grant', 'Up', 'Down', 'Total', '% Neg', ''].map(h => <th key={h} style={s.th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {hotGrants.map(g => (
                  <tr key={g.grant_id}>
                    <td style={s.td}>{g.title}</td>
                    <td style={{ ...s.td, color: 'var(--state-success)', fontWeight: 600 }}>{g.up}</td>
                    <td style={{ ...s.td, color: 'var(--state-error)', fontWeight: 600 }}>{g.down}</td>
                    <td style={s.td}>{g.total}</td>
                    <td style={s.td}>{g.pctNeg}%</td>
                    <td style={s.td}>{g.total >= 3 && g.pctNeg >= 70 && <span style={s.warn}>Review</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>Free text ({freeTextCount})</div>
        <div style={s.card}>
          {freeTexts.length === 0 && <div style={{ color: 'var(--text-subtle)', fontSize: 13 }}>No free text entries yet.</div>}
          {freeTexts.map(r => (
            <div key={r.id} style={{ paddingBottom: 16, marginBottom: 16, borderBottom: '1px solid var(--surface-pill)' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6 }}>
                <span style={pillStyle(r.direction)}>{r.direction === 'up' ? 'Good match' : 'Not for us'}</span>
                <span style={{ fontSize: 12, color: 'var(--text-subtle)' }}>{r.grant_title}</span>
                <span style={{ fontSize: 12, color: 'var(--text-subtle)', marginLeft: 'auto' }}>{fmt(r.created_at)}</span>
              </div>
              <div style={{ fontSize: 14, color: 'var(--text-body)', lineHeight: 1.5 }}>{r.free_text}</div>
              {r.reasons && r.reasons.length > 0 && (
                <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-subtle)' }}>
                  Chips: {r.reasons.map(rc => CHIP_LABELS[rc] ?? rc).join(', ')}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
