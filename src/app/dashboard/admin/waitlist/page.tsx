// Waitlist signups — who has joined from the landing page.
//
// Server component. The admin/layout.tsx gate runs before this renders, and
// requireAdmin() is repeated here as defence-in-depth because the service-role
// client below bypasses RLS (same posture as cohort-match-audit).
//
// waitlist_signups.created_at is the consent record: the privacy policy's basis
// for emailing these addresses is being able to show when someone submitted the
// form, and a repeat submission deliberately keeps the ORIGINAL timestamp. That
// is why the date column is not decoration here — do not sort it away or
// overwrite it. See src/app/api/waitlist/route.ts.
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/require-admin'
import { getAdminDb } from '@/lib/admin/admin-db'
import CopyEmailsButton from './CopyEmailsButton'

export const dynamic = 'force-dynamic'

interface SignupRow {
  id: string
  email: string
  source: string
  created_at: string
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  return (
    d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ', ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  )
}

export default async function AdminWaitlistPage() {
  const auth = await requireAdmin()
  if (!auth.ok) redirect('/auth/login')

  const { data, error } = await getAdminDb()
    .from('waitlist_signups')
    .select('id, email, source, created_at')
    .order('created_at', { ascending: false })

  const rows = (data ?? []) as SignupRow[]

  // Last 7 days, computed against the same clock the rows are stamped with.
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const lastWeek = rows.filter(r => new Date(r.created_at).getTime() >= weekAgo).length

  return (
    <div style={{ padding: '32px 28px', maxWidth: 900 }}>
      <h1
        style={{
          fontFamily: 'var(--font-space-grotesk)',
          fontSize: 26,
          fontWeight: 700,
          color: '#2C2C2A',
          margin: '0 0 6px',
        }}
      >
        Waitlist
      </h1>
      <p style={{ color: '#5F5E5A', margin: '0 0 24px', fontSize: 14 }}>
        Everyone who has submitted the join form on the landing page. The date is the consent
        record for emailing them.
      </p>

      {error && (
        <div
          style={{
            background: '#FAECE7',
            color: '#993C1D',
            border: '1px solid #D85A30',
            borderRadius: 10,
            padding: '12px 16px',
            marginBottom: 20,
            fontSize: 14,
          }}
        >
          Could not load signups: {error.message}
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        <div
          style={{
            background: '#F1F7E4',
            border: '1px solid #C0DD97',
            borderRadius: 12,
            padding: '14px 18px',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-space-grotesk)',
              fontSize: 28,
              fontWeight: 700,
              color: '#173404',
              lineHeight: 1,
            }}
          >
            {rows.length}
          </div>
          <div style={{ fontSize: 12, color: '#3B6D11', marginTop: 4 }}>total signups</div>
        </div>
        <div
          style={{
            background: '#F5F1E8',
            border: '1px solid #E8E0D1',
            borderRadius: 12,
            padding: '14px 18px',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-space-grotesk)',
              fontSize: 28,
              fontWeight: 700,
              color: '#2C2C2A',
              lineHeight: 1,
            }}
          >
            {lastWeek}
          </div>
          <div style={{ fontSize: 12, color: '#5F5E5A', marginTop: 4 }}>in the last 7 days</div>
        </div>
        <CopyEmailsButton emails={rows.map(r => r.email)} />
      </div>

      {rows.length === 0 && !error ? (
        <div
          style={{
            background: '#F5F1E8',
            border: '1px solid #E8E0D1',
            borderRadius: 12,
            padding: '28px 22px',
            color: '#5F5E5A',
            fontSize: 14,
          }}
        >
          No signups yet. The form is live and writing correctly, so this will fill in as people
          join.
        </div>
      ) : (
        <div
          style={{
            border: '1px solid #E8E0D1',
            borderRadius: 12,
            overflow: 'hidden',
            background: '#fff',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#F5F1E8' }}>
                <th
                  style={{
                    textAlign: 'left',
                    padding: '10px 16px',
                    fontFamily: 'var(--font-space-grotesk)',
                    fontSize: 12,
                    color: '#5F5E5A',
                    fontWeight: 600,
                  }}
                >
                  Email
                </th>
                <th
                  style={{
                    textAlign: 'left',
                    padding: '10px 16px',
                    fontFamily: 'var(--font-space-grotesk)',
                    fontSize: 12,
                    color: '#5F5E5A',
                    fontWeight: 600,
                    width: 200,
                  }}
                >
                  Joined
                </th>
                <th
                  style={{
                    textAlign: 'left',
                    padding: '10px 16px',
                    fontFamily: 'var(--font-space-grotesk)',
                    fontSize: 12,
                    color: '#5F5E5A',
                    fontWeight: 600,
                    width: 110,
                  }}
                >
                  Source
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} style={{ borderTop: i === 0 ? 'none' : '1px solid #F0EBE0' }}>
                  <td style={{ padding: '11px 16px', color: '#2C2C2A' }}>
                    <a href={`mailto:${r.email}`} style={{ color: '#3B6D11', textDecoration: 'none' }}>
                      {r.email}
                    </a>
                  </td>
                  <td style={{ padding: '11px 16px', color: '#5F5E5A' }}>{fmtDateTime(r.created_at)}</td>
                  <td style={{ padding: '11px 16px' }}>
                    <span
                      style={{
                        background: r.source === 'landing' ? '#F1F7E4' : '#F5F1E8',
                        color: r.source === 'landing' ? '#3B6D11' : '#5F5E5A',
                        borderRadius: 999,
                        padding: '3px 10px',
                        fontSize: 12,
                      }}
                    >
                      {r.source}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
