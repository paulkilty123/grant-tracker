// Usage: how people are using the site, day by day, since launch.
//
// Server component. The admin/layout.tsx gate runs before this renders, and
// requireAdmin() is repeated here as defence-in-depth because the service-role
// client bypasses RLS (same posture as waitlist and cohort-match-audit).
//
// The numbers come from src/lib/admin/usage-digest.ts, shared with
// scripts/usage-digest.ts so the terminal and the page cannot disagree.
// Actions only: nothing records page views or time on site, and the page
// says so rather than leaving a gap.
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/require-admin'
import { getAdminDb } from '@/lib/admin/admin-db'
import { computeUsageDigest, type UsageDigest } from '@/lib/admin/usage-digest'

export const dynamic = 'force-dynamic'

const GROTESK = 'var(--font-space-grotesk)'
const WINDOWS = [3, 7, 14, 30]

function fmtDay(iso: string | null, opts: { time?: boolean } = {}): string {
  if (!iso) return ''
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  if (!opts.time) return date
  return date + ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function daysAgo(iso: string | null): string {
  if (!iso) return 'never'
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000)
  if (diff <= 0) return 'today'
  if (diff === 1) return 'yesterday'
  return `${diff} days ago`
}

const th: React.CSSProperties = {
  textAlign: 'left', padding: '10px 14px', fontFamily: GROTESK,
  fontSize: 12, color: '#5F5E5A', fontWeight: 600, whiteSpace: 'nowrap',
}
const thNum: React.CSSProperties = { ...th, textAlign: 'right' }
const td: React.CSSProperties = { padding: '10px 14px', color: '#2C2C2A', fontSize: 14 }
const tdNum: React.CSSProperties = { ...td, textAlign: 'right', fontFamily: GROTESK, fontVariantNumeric: 'tabular-nums' }
const card: React.CSSProperties = { border: '1px solid #E8E0D1', borderRadius: 12, overflow: 'hidden', background: '#fff' }
const h2: React.CSSProperties = { fontFamily: GROTESK, fontSize: 17, fontWeight: 700, color: '#2C2C2A', margin: '28px 0 10px' }

function Stat({ value, label, tint }: { value: number | string; label: string; tint?: boolean }) {
  return (
    <div style={{
      background: tint ? '#F1F7E4' : '#F5F1E8',
      border: `1px solid ${tint ? '#C0DD97' : '#E8E0D1'}`,
      borderRadius: 12, padding: '14px 18px', minWidth: 120,
    }}>
      <div style={{ fontFamily: GROTESK, fontSize: 28, fontWeight: 700, color: tint ? '#173404' : '#2C2C2A', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, color: tint ? '#3B6D11' : '#5F5E5A', marginTop: 4 }}>{label}</div>
    </div>
  )
}

function Zero({ n }: { n: number }) {
  return <span style={{ color: n === 0 ? '#C4C2BD' : '#2C2C2A' }}>{n}</span>
}

export default async function AdminUsagePage({ searchParams }: { searchParams?: { days?: string } }) {
  const auth = await requireAdmin()
  if (!auth.ok) redirect('/auth/login')

  const requested = Number(searchParams?.days)
  const days = WINDOWS.includes(requested) ? requested : 7

  let digest: UsageDigest | null = null
  let error: string | null = null
  try {
    digest = await computeUsageDigest(getAdminDb(), days)
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }

  const today = digest?.byDay[digest.byDay.length - 1]
  const newOrgs = digest ? digest.byDay.reduce((s, r) => s + r.orgs, 0) : 0

  return (
    <div style={{ padding: '32px 28px', maxWidth: 1040 }}>
      <h1 style={{ fontFamily: GROTESK, fontSize: 26, fontWeight: 700, color: '#2C2C2A', margin: '0 0 6px' }}>
        Usage
      </h1>
      <p style={{ color: '#5F5E5A', margin: '0 0 18px', fontSize: 14, maxWidth: 720 }}>
        What people are doing on the site, from the actions it records: searches, grants opened,
        saves, pipeline adds. It does not know page views or time on site, because nothing
        records those. The demo org is left out.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {WINDOWS.map(w => (
          <a key={w} href={`/dashboard/admin/usage?days=${w}`} style={{
            fontFamily: GROTESK, fontSize: 13, fontWeight: 600, textDecoration: 'none',
            padding: '6px 12px', borderRadius: 999,
            background: w === days ? '#173404' : '#fff',
            color: w === days ? '#F1F7E4' : '#2C2C2A',
            border: `1px solid ${w === days ? '#173404' : '#E8E0D1'}`,
          }}>
            {w} days
          </a>
        ))}
      </div>

      {error && (
        <div style={{ background: '#FAECE7', color: '#993C1D', border: '1px solid #D85A30', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 14 }}>
          Could not load usage: {error}
        </div>
      )}

      {digest && digest.totalEvents === 0 && (
        <div style={{ background: '#FAECE7', color: '#993C1D', border: '1px solid #D85A30', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 14 }}>
          No events at all in the last {days} days. On a live site that means the event writer is
          broken, not that nobody came. Check before believing it.
        </div>
      )}

      {digest && digest.capped && (
        <div style={{ background: '#FAEEDA', color: '#854F0B', border: '1px solid #EF9F27', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 14 }}>
          The event read hit its row cap, so every count below is a floor.
        </div>
      )}

      {digest && (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Stat value={today?.orgs ?? 0} label="signed up today" tint />
            <Stat value={today?.active ?? 0} label="orgs active today" tint />
            <Stat value={newOrgs} label={`signed up in ${days} days`} />
            <Stat value={digest.activeOrgs} label={`orgs active in ${days} days`} />
            <Stat value={digest.joinedNoAction} label="joined, done nothing yet" />
          </div>

          <h2 style={h2}>By day</h2>
          <div style={card}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F5F1E8' }}>
                    <th style={th}>Day</th>
                    <th style={thNum}>New accounts</th>
                    <th style={thNum}>New orgs</th>
                    <th style={thNum}>Orgs active</th>
                    <th style={thNum}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {digest.byDay.map((r, i) => (
                    <tr key={r.day} style={{ borderTop: i === 0 ? 'none' : '1px solid #F0EBE0' }}>
                      <td style={td}>{fmtDay(r.day)}</td>
                      <td style={tdNum}><Zero n={r.users} /></td>
                      <td style={tdNum}><Zero n={r.orgs} /></td>
                      <td style={tdNum}><Zero n={r.active} /></td>
                      <td style={tdNum}><Zero n={r.actions} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <h2 style={h2}>Funnel</h2>
          <p style={{ color: '#5F5E5A', margin: '0 0 10px', fontSize: 13 }}>
            How many different orgs reached each step in the last {days} days, and how many times in total.
          </p>
          <div style={{ ...card, maxWidth: 560 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#F5F1E8' }}>
                  <th style={th}>Step</th>
                  <th style={thNum}>Orgs</th>
                  <th style={thNum}>Times</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={td}>Any action</td>
                  <td style={tdNum}>{digest.activeOrgs}</td>
                  <td style={tdNum}>{digest.byDay.reduce((s, r) => s + r.actions, 0)}</td>
                </tr>
                {digest.funnel.map(f => (
                  <tr key={f.type} style={{ borderTop: '1px solid #F0EBE0' }}>
                    <td style={td}>{f.label}</td>
                    <td style={tdNum}><Zero n={f.orgs} /></td>
                    <td style={tdNum}><Zero n={f.times} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {digest.otherEvents.length > 0 && (
            <p style={{ color: '#8A8986', margin: '8px 0 0', fontSize: 12 }}>
              Also recorded: {digest.otherEvents.map(o => `${o.type.replace(/_/g, ' ')} ${o.n}`).join(', ')}.
            </p>
          )}

          <h2 style={h2}>Per organisation</h2>
          <p style={{ color: '#5F5E5A', margin: '0 0 10px', fontSize: 13 }}>
            Everyone who joined or did something in the last {days} days, newest first.
          </p>
          <div style={card}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F5F1E8' }}>
                    <th style={th}>Organisation</th>
                    <th style={th}>Joined</th>
                    <th style={th}>Last action</th>
                    <th style={th}>Last login</th>
                    <th style={thNum}>Searches</th>
                    <th style={thNum}>Opened</th>
                    <th style={thNum}>Saved</th>
                    <th style={thNum}>Pipeline</th>
                    <th style={thNum}>Dismissed</th>
                  </tr>
                </thead>
                <tbody>
                  {digest.orgs.map((o, i) => (
                    <tr key={o.id} style={{ borderTop: i === 0 ? 'none' : '1px solid #F0EBE0' }}>
                      <td style={td}>
                        <a href="/dashboard/admin/users" style={{ color: '#3B6D11', textDecoration: 'underline' }}>{o.name}</a>
                      </td>
                      <td style={{ ...td, color: '#5F5E5A', whiteSpace: 'nowrap' }}>{fmtDay(o.joined)}</td>
                      <td style={{ ...td, color: o.lastAction ? '#5F5E5A' : '#D85A30', whiteSpace: 'nowrap' }} title={o.lastAction ? fmtDay(o.lastAction, { time: true }) : undefined}>
                        {daysAgo(o.lastAction)}
                      </td>
                      <td style={{ ...td, color: '#5F5E5A', whiteSpace: 'nowrap' }} title={o.lastLogin ? fmtDay(o.lastLogin, { time: true }) : undefined}>
                        {o.lastLogin ? daysAgo(o.lastLogin) : '?'}
                      </td>
                      <td style={tdNum}><Zero n={o.counts.results_shown ?? 0} /></td>
                      <td style={tdNum}><Zero n={o.counts.opportunity_viewed ?? 0} /></td>
                      <td style={tdNum}><Zero n={o.counts.opportunity_saved ?? 0} /></td>
                      <td style={tdNum}><Zero n={o.counts.pipeline_added ?? 0} /></td>
                      <td style={tdNum}><Zero n={o.counts.opportunity_dismissed ?? 0} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p style={{ color: '#8A8986', margin: '18px 0 0', fontSize: 12 }}>
            MCP traffic is kept out of the tables above: {digest.mcp.requests} requests from{' '}
            {digest.mcp.orgs} attributed org{digest.mcp.orgs === 1 ? '' : 's'} in the window.
          </p>
        </>
      )}
    </div>
  )
}
