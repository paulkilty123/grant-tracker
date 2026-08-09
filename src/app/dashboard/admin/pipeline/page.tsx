// Pipeline — every scheduled job, ordered by next due, red when overdue.
//
// Exists because "did the auto-publish gate fire?" took four SQL queries, a
// Vercel API call, a log check and one wrong answer on 2 August. It is the
// question asked every morning.

import { getAdminDb } from '@/lib/admin/admin-db'
import { jobSchedules, nextDueForJob, overdueAfter, runCostGBP, type UsageEntry } from '@/lib/admin/cron-schedule'

export const dynamic = 'force-dynamic'

type RunRow = {
  job: string; started_at: string; finished_at: string | null
  ok: boolean | null; summary: Record<string, unknown> | null; error: string | null
}

const display = { fontFamily: 'var(--font-space-grotesk)' } as const

/** Pull the two or three numbers a human actually scans for out of a job's own
 *  response body. Deliberately generic: each job returns a different shape, and
 *  hard-coding per-job field maps would rot the moment a handler changed. */
function rowsInOut(summary: Record<string, unknown> | null): string {
  if (!summary) return '—'
  const keys = ['fetched','upserted','written','processed','published','checked','flagged','queueSize','deferredByCap','updated','skipped']
  const parts = keys
    .filter(k => typeof summary[k] === 'number')
    .map(k => `${k} ${summary[k]}`)
  return parts.length ? parts.slice(0, 3).join(' · ') : '—'
}

function ago(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 48) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default async function PipelinePage() {
  const db = getAdminDb()
  const jobs = jobSchedules()

  // Latest run per job. One read, grouped in JS — 35 jobs is far too few to
  // justify a lateral join, and a per-job query would be 35 round trips.
  const { data, error } = await db
    .from('cron_runs')
    .select('job, started_at, finished_at, ok, summary, error')
    .order('started_at', { ascending: false })
    .limit(2000)

  // A failed read must never render as "no jobs have ever run" — that is
  // indistinguishable from total pipeline failure, and it is the exact mistake
  // the old review queue made when it showed "all clear!" on a broken query.
  if (error) {
    return (
      <main style={{ padding: '30px 24px', maxWidth: 1180, margin: '0 auto' }}>
        <h1 style={{ ...display, fontSize: 25, fontWeight: 500 }}>Pipeline</h1>
        <p style={{ color: 'var(--coral-deep)', background: 'var(--coral-pale)', padding: '13px 16px', borderRadius: 12, marginTop: 16 }}>
          <strong>Could not read the run log.</strong> This is a read failure, not an idle pipeline.
          {' '}{error.message}
        </p>
      </main>
    )
  }

  const latest = new Map<string, RunRow>()
  for (const r of (data ?? []) as RunRow[]) if (!latest.has(r.job)) latest.set(r.job, r)

  const now = new Date()
  const rows = jobs.map(j => {
    const run  = latest.get(j.job) ?? null
    const due  = nextDueForJob(j.schedules, now)
    // Overdue is judged from the LAST RUN, not from the next due time: a job
    // that never ran at all is the case most worth surfacing, and it has no
    // "next due" history to be late against.
    const overdue = run ? now > overdueAfter(j.schedules, new Date(run.started_at)) : true
    return { ...j, run, due, overdue }
  }).sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1          // problems first
    return (a.due?.getTime() ?? Infinity) - (b.due?.getTime() ?? Infinity)
  })

  const overdueCount = rows.filter(r => r.overdue).length
  const failedCount  = rows.filter(r => r.run?.ok === false).length
  const stalledCount = rows.filter(r => r.run && r.run.ok === null).length

  const th: React.CSSProperties = {
    ...display, fontSize: 10.5, fontWeight: 500, letterSpacing: '0.08em',
    textTransform: 'uppercase', color: 'var(--color-text-tertiary)',
    textAlign: 'left', padding: '0 12px 8px 0',
  }
  const td: React.CSSProperties = { padding: '10px 12px 10px 0', fontSize: 13, verticalAlign: 'top' }

  return (
    <main style={{ padding: '30px 24px 80px', maxWidth: 1180, margin: '0 auto' }}>
      <h1 style={{ ...display, fontSize: 25, fontWeight: 500, letterSpacing: '-0.02em', margin: '0 0 5px' }}>
        Pipeline
      </h1>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 13.5, lineHeight: 1.55, margin: '0 0 22px', maxWidth: '70ch' }}>
        Every scheduled job, soonest due first, problems at the top. Schedules are read
        from <code>vercel.json</code>, so what you see here is what Vercel actually runs.
      </p>

      {(overdueCount > 0 || failedCount > 0 || stalledCount > 0) && (
        <div style={{
          background: 'var(--coral-pale)', color: 'var(--coral-deep)',
          borderRadius: 'var(--radius-card)', padding: '13px 16px', marginBottom: 22,
          fontSize: 13, lineHeight: 1.45,
        }}>
          <strong style={{ ...display, fontWeight: 700 }}>
            {[
              overdueCount && `${overdueCount} overdue`,
              failedCount  && `${failedCount} failed`,
              stalledCount && `${stalledCount} started and never reported back`,
            ].filter(Boolean).join(', ')}.
          </strong>{' '}
          A job that started and never finished is a crash or a timeout, which is a
          different problem from one that ran and failed cleanly.
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '0.5px solid var(--border-subtle)' }}>
            <th style={th}>Job</th>
            <th style={th}>Schedule</th>
            <th style={th}>Last run</th>
            <th style={th}>Result</th>
            <th style={th}>Rows</th>
            <th style={th}>Cost</th>
            <th style={th}>Next due</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const usage = (r.run?.summary?.usage ?? null) as UsageEntry[] | null
            const cost  = runCostGBP(usage)
            return (
              <tr key={r.job} style={{
                borderBottom: '0.5px solid var(--border-light)',
                background: r.overdue ? 'var(--coral-pale)' : undefined,
              }}>
                <td style={{ ...td, ...display, fontWeight: 600 }}>{r.job}</td>
                <td style={{ ...td, fontFamily: 'ui-monospace, monospace', fontSize: 11.5, color: 'var(--color-text-secondary)' }}>
                  {r.schedules.length > 1 ? `${r.schedules[0]} +${r.schedules.length - 1}` : r.schedules[0]}
                </td>
                <td style={{ ...td, color: 'var(--color-text-secondary)' }}>
                  {r.run ? ago(r.run.started_at) : <span style={{ color: 'var(--coral-deep)' }}>never</span>}
                </td>
                <td style={td}>
                  {/* A handler that CAUGHT its own failure returns a 500 body and
                      still resolves, so recordRun stores ok=true. Trusting `ok`
                      alone would render those green. If the job's own summary
                      carries an error, say so regardless of the flag. */}
                  {!r.run ? '—'
                    : r.run.ok === true && (r.run.summary?.error || r.run.summary?.success === false)
                      ? <span style={{ color: 'var(--amber-deep)' }} title={String(r.run.summary?.error ?? '')}>reported error</span>
                    : r.run.ok === true  ? <span style={{ color: 'var(--sage, #3B6D11)' }}>ok</span>
                    : r.run.ok === false ? <span style={{ color: 'var(--coral-deep)' }} title={r.run.error ?? ''}>failed</span>
                    : <span style={{ color: 'var(--amber-deep)' }}>no reply</span>}
                </td>
                <td style={{ ...td, color: 'var(--color-text-secondary)', fontSize: 12.5 }}>
                  {rowsInOut(r.run?.summary ?? null)}
                </td>
                <td style={{ ...td, color: 'var(--color-text-secondary)', fontSize: 12.5 }}>
                  {/* No usage means the job calls no model — NOT that it was free. */}
                  {cost === null ? '—' : `£${cost < 0.01 ? cost.toFixed(4) : cost.toFixed(2)}`}
                </td>
                <td style={{ ...td, color: 'var(--color-text-secondary)', fontSize: 12.5 }}>
                  {r.due ? r.due.toISOString().slice(5, 16).replace('T', ' ') : 'unknown'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <p style={{ color: 'var(--color-text-tertiary)', fontSize: 12, marginTop: 18, maxWidth: '80ch', lineHeight: 1.5 }}>
        Times are UTC, which is what Vercel schedules in — 09:00 here is 10:00 or 11:00 in
        British time depending on the season. Cost is derived from recorded tokens at
        today&rsquo;s prices; the tokens are the stored record, the money is not.
        A dash under Cost means the job calls no model, not that it was free.
      </p>
    </main>
  )
}
