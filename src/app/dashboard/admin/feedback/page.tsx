'use client'

import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

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

interface DayStat {
  date: string
  up: number
  down: number
}

interface ChipStat {
  reason: string
  up: number
  down: number
}

interface HotGrant {
  grant_id: string
  title: string
  up: number
  down: number
  total: number
  pctNeg: number
}

const CHIP_LABELS: Record<string, string> = {
  right_size: 'Right size',
  right_sector: 'Right sector',
  right_timing: 'Right timing',
  good_eligibility: 'Good eligibility',
  matches_style: 'Matches style',
  wrong_size: 'Wrong size',
  wrong_sector: 'Wrong sector',
  wrong_timing: 'Wrong timing',
  eligibility_issue: 'Eligibility issue',
  wrong_style: 'Wrong style',
  something_else: 'Something else',
}

function fmt(date: string) {
  return new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function AdminFeedbackPage() {
  const supabase = createClientComponentClient()
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [rows, setRows] = useState<FeedbackRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || user.email !== ADMIN_EMAIL) {
        setAllowed(false)
        setLoading(false)
        return
      }
      setAllowed(true)

      const { data: feedback } = await supabase
        .from('match_feedback')
        .select('*')
        .order('created_at', { ascending: false })

      if (!feedback) { setLoading(false); return }

      // fetch grant titles
      const grantIds = Array.from(new Set(feedback.map(f => f.grant_id)))
      const { data: grants } = await supabase
        .from('scraped_grants')
        .select('id, title')
        .in('id', grantIds)

      const titleMap = new Map((grants || []).map(g => [g.id, g.title]))

      setRows(feedback.map(f => ({ ...f, grant_title: titleMap.get(f.grant_id) ?? f.grant_id })))
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div style={{ padding: 48, fontFamily: 'DM Sans, sans-serif', color: '#666' }}>Loading…</div>
  if (allowed === false) return <div style={{ padding: 48, fontFamily: 'DM Sans, sans-serif', color: '#c00' }}>Access denied.</div>

  // ── stats ────────────────────────────────────────────────────────────────
  const total = rows.length
  const upCount = rows.filter(r => r.direction === 'up').length
  const downCount = rows.filter(r => r.direction === 'down').length
  const freeTextCount = rows.filter(r => r.free_text && r.free_text.trim().length > 0).length

  // ── last 30 days bar chart data ──────────────────────────────────────────
  const dayMap = new Map<string, { up: number; down: number }>()
  const now = new Date()
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    dayMap.set(key, { up: 0, down: 0 })
  }
  rows.forEach(r => {
    const key = r.created_at.slice(0, 10)
    if (dayMap.has(key)) {
      const slot = dayMap.get(key)!
      if (r.direction === 'up') slot.up++
      else slot.down++
    }
  })
  const days: DayStat[] = Array.from(dayMap.entries()).map(([date, v]) => ({ date, ...v }))
  const maxDay = Math.max(1, ...days.map(d => d.up + d.down))

  // ── chip breakdown ───────────────────────────────────────────────────────
  const chipMap = new Map<string, { up: number; down: number }>()
  rows.forEach(r => {
    (r.reasons || []).forEach(reason => {
      if (!chipMap.has(reason)) chipMap.set(reason, { up: 0, down: 0 })
      const slot = chipMap.get(reason)!
      if (r.direction === 'up') slot.up++
      else slot.down++
    })
  })
  const chipStats: ChipStat[] = Array.from(chipMap.entries())
    .map(([reason, v]) => ({ reason, ...v }))
    .sort((a, b) => (b.up + b.down) - (a.up + a.down))
  const maxChip = Math.max(1, ...chipStats.map(c => c.up + c.down))

  // ── hot grants ───────────────────────────────────────────────────────────
  const grantMap = new Map<string, { title: string; up: number; down: number }>()
  rows.forEach(r => {
    if (!grantMap.has(r.grant_id)) grantMap.set(r.grant_id, { title: r.grant_title || r.grant_id, up: 0, down: 0 })
    const slot = grantMap.get(r.grant_id)!
    if (r.direction === 'up') slot.up++
    else slot.down++
  })
  const hotGrants: HotGrant[] = Array.from(grantMap.entries())
    .map(([grant_id, v]) => ({
      grant_id,
      title: v.title,
      up: v.up,
      down: v.down,
      total: v.up + v.down,
      pctNeg: v.up + v.down > 0 ? Math.round((v.down / (v.up + v.down)) * 100) : 0,
    }))
    .filter(g => g.total >= 2)
    .sort((a, b) => b.total - a.total)
    .slice(0, 20)

  // ── free text ────────────────────────────────────────────────────────────
  const freeTexts = rows.filter(r => r.free_text && r.free_text.trim().length > 0)

  const s: Record<string, React.CSSProperties> = {
    page: { padding: '40px 48px', fontFamily: 'DM Sans, sans-serif', maxWidth: 1100, margin: '0 auto' },
    h1: { fontSize: 26, fontWeight: 700, color: '#1f5c52', marginBottom: 8 },
    sub: { fontSize: 14, color: '#666', marginBottom: 36 },
    statGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 40 },
    statCard: { background: '#faf7f2', border: '1px solid #e8ddd0', borderRadius: 0, padding: '20px 24px' },
    statNum: { fontSize: 34, fontWeight: 700, color: '#1f5c52', lineHeight: 1 },
    statLabel: { fontSize: 13, color: '#666', marginTop: 6 },
    section: { marginBottom: 44 },
    sectionTitle: { fontSize: 15, fontWeight: 600, color: '#2c2c2a', marginBottom: 16 },
    card: { background: '#fff', border: '1px solid #e8ddd0', borderRadius: 0, padding: '24px 28px' },
    barTrack: { height: 28, background: '#f0ece6', borderRadius: 0, overflow: 'hidden', display: 'flex', marginBottom: 6 },
    table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 },
    th: { textAlign: 'left' as const, padding: '8px 12px', borderBottom: '1px solid #e8ddd0', color: '#666', fontWeight: 500 },
    td: { padding: '10px 12px', borderBottom: '1px solid #f3efea', verticalAlign: 'top' as const },
    pill: (dir: 'up' | 'down') => ({
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 0,
      fontSize: 11,
      fontWeight: 600,
      background: dir === 'up' ? '#e6f4e6' : '#fce8e8',
      color: dir === 'up' ? '#2a7a2a' : '#c00',
    }),
    warn: { color: '#c96a00', fontWeight: 600 },
  }

  return (
    <div style={s.page}>
      <div style={s.h1}>Match Feedback</div>
      <div style={s.sub}>All signals from thumbs up / down interactions. Updates in real time.</div>

      {/* stat cards */}
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

      {/* activity chart */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Activity — last 30 days</div>
        <div style={s.card}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 80 }}>
            {days.map(d => {
              const h = Math.round(((d.up + d.down) / maxDay) * 72)
              const upH = d.up + d.down > 0 ? Math.round((d.up / (d.up + d.down)) * h) : 0
              const downH = h - upH
              return (
                <div key={d.date} title={`${d.date}: ${d.up}↑ ${d.down}↓`} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                  {downH > 0 && <div style={{ height: downH, background: '#f4a0a0', borderRadius: 0 }} />}
                  {upH > 0 && <div style={{ height: upH, background: '#6dbf6d', borderRadius: 0 }} />}
                  {h === 0 && <div style={{ height: 2, background: '#e8e0d8' }} />}
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 11, color: '#888' }}>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#6dbf6d', marginRight: 4 }} />Good match</span>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#f4a0a0', marginRight: 4 }} />Not for us</span>
          </div>
        </div>
      </div>

      {/* chip breakdown */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Reason chips</div>
        <div style={s.card}>
          {chipStats.length === 0 && <div style={{ color: '#999', fontSize: 13 }}>No chips recorded yet.</div>}
          {chipStats.map(c => {
            const total = c.up + c.down
            const upPct = Math.round((c.up / total) * 100)
            const downPct = 100 - upPct
            return (
              <div key={c.reason} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                  <span style={{ fontWeight: 500 }}>{CHIP_LABELS[c.reason] ?? c.reason}</span>
                  <span style={{ color: '#888' }}>{c.up}↑ {c.down}↓</span>
                </div>
                <div style={{ ...s.barTrack, height: 12 }}>
                  <div style={{ width: `${(total / maxChip) * 100}%`, display: 'flex', height: '100%' }}>
                    <div style={{ width: `${upPct}%`, background: '#6dbf6d' }} />
                    <div style={{ width: `${downPct}%`, background: '#f4a0a0' }} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* hot grants */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Grants with most signals</div>
        <div style={s.card}>
          {hotGrants.length === 0 && <div style={{ color: '#999', fontSize: 13 }}>No grants with 2+ events yet.</div>}
          {hotGrants.length > 0 && (
            <table style={s.table}>
              <thead>
                <tr>
                  {['Grant', '👍', '👎', 'Total', '% Neg', ''].map(h => (
                    <th key={h} style={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hotGrants.map(g => (
                  <tr key={g.grant_id}>
                    <td style={s.td}>{g.title}</td>
                    <td style={{ ...s.td, color: '#2a7a2a', fontWeight: 600 }}>{g.up}</td>
                    <td style={{ ...s.td, color: '#c00', fontWeight: 600 }}>{g.down}</td>
                    <td style={s.td}>{g.total}</td>
                    <td style={s.td}>{g.pctNeg}%</td>
                    <td style={s.td}>
                      {g.total >= 3 && g.pctNeg >= 70 && <span style={s.warn}>⚠ Review</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* free text */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Free text ({freeTextCount})</div>
        <div style={s.card}>
          {freeTexts.length === 0 && <div style={{ color: '#999', fontSize: 13 }}>No free text entries yet.</div>}
          {freeTexts.map(r => (
            <div key={r.id} style={{ paddingBottom: 16, marginBottom: 16, borderBottom: '1px solid #f0ece6' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6 }}>
                <span style={s.pill(r.direction)}>{r.direction === 'up' ? 'Good match' : 'Not for us'}</span>
                <span style={{ fontSize: 12, color: '#888' }}>{r.grant_title}</span>
                <span style={{ fontSize: 12, color: '#aaa', marginLeft: 'auto' }}>{fmt(r.created_at)}</span>
              </div>
              <div style={{ fontSize: 14, color: '#3a3a3a', lineHeight: 1.5 }}>{r.free_text}</div>
              {r.reasons && r.reasons.length > 0 && (
                <div style={{ marginTop: 6, fontSize: 12, color: '#888' }}>
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
