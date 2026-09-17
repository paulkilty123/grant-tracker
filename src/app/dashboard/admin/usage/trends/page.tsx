// Trends: the usage numbers over time, as charts. One measure per chart, so
// nothing shares an axis. Daily series for the window, weekly ratios beneath.
//
// Server component; requireAdmin() repeated as defence-in-depth because the
// service-role client bypasses RLS. Data from src/lib/admin/usage-history.ts.
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/require-admin'
import { getAdminDb } from '@/lib/admin/admin-db'
import { computeUsageHistory, type UsageHistory } from '@/lib/admin/usage-history'
import LineChart from './LineChart'

export const dynamic = 'force-dynamic'

const GROTESK = 'var(--font-space-grotesk)'
const WINDOWS = [30, 90, 180]
const h2: React.CSSProperties = { fontFamily: GROTESK, fontSize: 17, fontWeight: 700, color: '#2C2C2A', margin: '28px 0 10px' }
const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }
const th: React.CSSProperties = { textAlign: 'right', padding: '8px 12px', fontFamily: GROTESK, fontSize: 12, color: '#5F5E5A', fontWeight: 600, whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '8px 12px', color: '#2C2C2A', fontSize: 13, textAlign: 'right', fontFamily: GROTESK, fontVariantNumeric: 'tabular-nums' }

export default async function UsageTrendsPage({ searchParams }: { searchParams?: { days?: string } }) {
  const auth = await requireAdmin()
  if (!auth.ok) redirect('/auth/login')
  const requested = Number(searchParams?.days)
  const days = WINDOWS.includes(requested) ? requested : 90

  let history: UsageHistory | null = null
  let error: string | null = null
  try {
    history = await computeUsageHistory(getAdminDb(), days)
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }

  const daily = history?.daily ?? []
  const weekly = history?.weekly ?? []

  return (
    <div style={{ padding: '32px 28px', maxWidth: 1040 }}>
      <h1 style={{ fontFamily: GROTESK, fontSize: 26, fontWeight: 700, color: '#2C2C2A', margin: '0 0 6px' }}>Usage over time</h1>
      <p style={{ color: '#5F5E5A', margin: '0 0 18px', fontSize: 14, maxWidth: 720 }}>
        The same numbers as the <a href="/dashboard/admin/usage" style={{ color: '#3B6D11', textDecoration: 'underline' }}>usage page</a> and
        the Monday report, day by day and week by week. Visitors are from Umami with admin sessions removed. Hover a chart for the value on a day.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {WINDOWS.map(w => (
          <a key={w} href={`/dashboard/admin/usage/trends?days=${w}`} style={{
            fontFamily: GROTESK, fontSize: 13, fontWeight: 600, textDecoration: 'none', padding: '6px 12px', borderRadius: 999,
            background: w === days ? '#173404' : '#fff', color: w === days ? '#F1F7E4' : '#2C2C2A',
            border: `1px solid ${w === days ? '#173404' : '#E8E0D1'}`,
          }}>{w} days</a>
        ))}
      </div>

      {error && (
        <div style={{ background: '#FAECE7', color: '#993C1D', border: '1px solid #D85A30', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 14 }}>
          Could not load: {error}
        </div>
      )}
      {history?.siteReason && (
        <div style={{ background: '#FAEEDA', color: '#854F0B', border: '1px solid #EF9F27', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 14 }}>
          Visitor numbers not read: {history.siteReason}. Those charts show zero.
        </div>
      )}
      {history && history.eventsRead === 0 && (
        <div style={{ background: '#FAECE7', color: '#993C1D', border: '1px solid #D85A30', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 14 }}>
          No events in the window. On a live site that means the event writer is broken, not that nobody came.
        </div>
      )}

      {history && (
        <>
          <h2 style={h2}>Each day</h2>
          <div style={grid}>
            <LineChart title="Visitors" points={daily.map(d => ({ x: d.day, y: d.visitors }))} />
            <LineChart title="Page views" points={daily.map(d => ({ x: d.day, y: d.pageviews }))} colour="#639922" />
            <LineChart title="Signed up" points={daily.map(d => ({ x: d.day, y: d.signups }))} colour="#173404" />
            <LineChart title="Organisations active" points={daily.map(d => ({ x: d.day, y: d.activeOrgs }))} colour="#173404" />
            <LineChart title="Searches people started" points={daily.map(d => ({ x: d.day, y: d.searches }))} colour="#639922" />
            <LineChart title="Reached the signup page" points={daily.map(d => ({ x: d.day, y: d.signupVisitors }))} />
          </div>

          <h2 style={h2}>Each week</h2>
          <p style={{ color: '#5F5E5A', margin: '0 0 10px', fontSize: 13 }}>
            Seven-day blocks ending today, so the last point is the same week the Monday report describes. A ratio that moves is the thing to look at.
          </p>
          <div style={grid}>
            <LineChart title="Searchers who added to pipeline" unit="%" yMax={100} points={weekly.map(w => ({ x: w.weekEnding, y: w.searchersAddedPct }))} />
            <LineChart title="Visitors who reached signup" unit="%" yMax={100} points={weekly.map(w => ({ x: w.weekEnding, y: w.reachedSignupPct }))} />
            <LineChart title="Signed up" points={weekly.map(w => ({ x: w.weekEnding, y: w.signups }))} colour="#173404" />
            <LineChart title="Organisations that saw results" points={weekly.map(w => ({ x: w.weekEnding, y: w.searchers }))} colour="#173404" />
          </div>

          <h2 style={h2}>The weekly numbers</h2>
          <div style={{ border: '1px solid #E8E0D1', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F5F1E8' }}>
                    <th style={{ ...th, textAlign: 'left' }}>Week ending</th>
                    <th style={th}>Visitors</th>
                    <th style={th}>Reached signup</th>
                    <th style={th}>Signed up</th>
                    <th style={th}>Saw results</th>
                    <th style={th}>Added to pipeline</th>
                    <th style={th}>Reached signup %</th>
                    <th style={th}>Added to pipeline %</th>
                  </tr>
                </thead>
                <tbody>
                  {[...weekly].reverse().map((w, i) => (
                    <tr key={w.weekEnding} style={{ borderTop: i === 0 ? 'none' : '1px solid #F0EBE0' }}>
                      <td style={{ ...td, textAlign: 'left', fontFamily: 'inherit' }}>{w.weekEnding}</td>
                      <td style={td}>{w.visitors}</td>
                      <td style={td}>{w.signupVisitors}</td>
                      <td style={td}>{w.signups}</td>
                      <td style={td}>{w.searchers}</td>
                      <td style={td}>{w.addedToPipeline}</td>
                      <td style={td}>{w.reachedSignupPct === null ? 'n/a' : `${w.reachedSignupPct}%`}</td>
                      <td style={td}>{w.searchersAddedPct === null ? 'n/a' : `${w.searchersAddedPct}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
