import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// Human-readable labels for each source key
const SOURCE_LABELS: Record<string, string> = {
  gov_uk:                   'GOV.UK Find a Grant',
  tnlcf:                    'National Lottery Community Fund',
  ukri:                     'UKRI',
  gla:                      'Greater London Authority',
  arts_council:             'Arts Council England',
  sport_england:            'Sport England',
  heritage_fund:            'National Lottery Heritage Fund',
  forever_manchester:       'Forever Manchester',
  two_ridings_cf:           'Two Ridings CF',
  cf_wales:                 'Community Foundation Wales',
  quartet_cf:               'Quartet CF (Bristol)',
  cf_ni:                    'Community Foundation NI',
  heart_of_england_cf:      'Heart of England CF',
  foundation_scotland:      'Foundation Scotland',
  london_cf:                'London Community Foundation',
  sussex_cf:                'Sussex Community Foundation',
  surrey_cf:                'Surrey Community Foundation',
  hiwcf:                    'Hants & IoW CF',
  oxfordshire_cf:           'Oxfordshire CF',
  asda_foundation:          'Asda Foundation',
  aviva_foundation:         'Aviva Foundation',
  nationwide_foundation:    'Nationwide Foundation',
  tyne_wear_cf:             'Tyne & Wear CF',
  norfolk_cf:               'Norfolk CF',
  suffolk_cf:               'Suffolk CF',
  merseyside_cf:            'Merseyside CF',
  bbc_cin:                  'BBC Children in Need',
  gloucestershire_cf:       'Gloucestershire CF',
  heart_of_bucks_cf:        'Heart of Bucks CF',
  llr_cf:                   'LLR CF (Leicester)',
  mk_cf:                    'MK Community Foundation',
  lancs_cf:                 'Lancashire CF',
  cambs_cf:                 'Cambridgeshire CF',
  herts_cf:                 'Hertfordshire CF',
  wiltshire_cf:             'Wiltshire CF',
  calderdale_cf:            'Calderdale CF',
  somerset_cf:              'Somerset CF',
  forever_notts:            'Forever Nottinghamshire',
  cheshire_cf:              'Cheshire CF',
  shropshire_cf:            'Shropshire CF',
  kent_cf:                  'Kent CF',
  lincolnshire_cf:          'Lincolnshire CF',
  paul_hamlyn_foundation:   'Paul Hamlyn Foundation',
  esmee_fairbairn:          'Esmée Fairbairn Foundation',
  henry_smith:              'Henry Smith Foundation',
  garfield_weston:          'Garfield Weston Foundation',
  clothworkers_foundation:  'Clothworkers Foundation',
  jrct:                     'Joseph Rowntree CT',
  power_to_change:          'Power to Change',
  peoples_health_trust:     "People's Health Trust",
  national_churches_trust:  'National Churches Trust',
  tudor_trust:              'Tudor Trust',
  ufi_voctech:              'Ufi VocTech Trust',
}

const BATCH_MAP: Record<string, number> = {
  gov_uk: 1, tnlcf: 1, ukri: 1, gla: 1, arts_council: 1,
  sport_england: 1, heritage_fund: 1, forever_manchester: 1, two_ridings_cf: 1, cf_wales: 1,
  quartet_cf: 1, cf_ni: 1, heart_of_england_cf: 1, foundation_scotland: 1, london_cf: 1,
  sussex_cf: 2, surrey_cf: 2, hiwcf: 2, oxfordshire_cf: 2,
  asda_foundation: 2, aviva_foundation: 2, nationwide_foundation: 2,
  tyne_wear_cf: 2, norfolk_cf: 2, suffolk_cf: 2,
  merseyside_cf: 2, bbc_cin: 2, gloucestershire_cf: 2,
  heart_of_bucks_cf: 2, llr_cf: 2,
  mk_cf: 3, lancs_cf: 3, cambs_cf: 3, herts_cf: 3,
  wiltshire_cf: 3, calderdale_cf: 3,
  somerset_cf: 3, forever_notts: 3, cheshire_cf: 3,
  shropshire_cf: 3, kent_cf: 3, lincolnshire_cf: 3,
  paul_hamlyn_foundation: 3, esmee_fairbairn: 3, henry_smith: 3,
  garfield_weston: 3, clothworkers_foundation: 3,
  jrct: 3, power_to_change: 3, peoples_health_trust: 3,
  national_churches_trust: 3, tudor_trust: 3, ufi_voctech: 3,
}

interface SourceStat {
  source:        string
  label:         string
  batch:         number
  activeGrants:  number
  lastSeen:      string | null
  firstSeen:     string | null
  lastError:     string | null
  lastRanAt:     string | null
  lastFetched:   number | null
  lastUpserted:  number | null
}

function statusBadge(stat: SourceStat) {
  if (stat.activeGrants === 0) {
    return { dot: 'bg-red-500', text: 'text-red-700', label: 'No grants' }
  }
  if (!stat.lastSeen) {
    return { dot: 'bg-gray-400', text: 'text-gray-600', label: 'Unknown' }
  }
  const hoursAgo = (Date.now() - new Date(stat.lastSeen).getTime()) / 3_600_000
  if (hoursAgo < 30) return { dot: 'bg-green-500', text: 'text-green-700', label: 'Healthy' }
  if (hoursAgo < 72) return { dot: 'bg-amber-500', text: 'text-amber-700', label: 'Stale' }
  return { dot: 'bg-red-500', text: 'text-red-700', label: 'Outdated' }
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default async function AdminPage() {
  const supabase = await createClient()

  // Auth check
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // ── Query 1: per-source active grant counts and freshness ─────────────────
  const { data: grantRows } = await supabase
    .from('scraped_grants')
    .select('source, last_seen_at, first_seen_at')
    .eq('is_active', true)

  // Group by source in JS
  const sourceMap = new Map<string, { count: number; lastSeen: string | null; firstSeen: string | null }>()

  for (const row of (grantRows ?? [])) {
    const s = row.source as string
    const existing = sourceMap.get(s)
    const lastSeen = row.last_seen_at as string | null
    const firstSeen = row.first_seen_at as string | null
    if (!existing) {
      sourceMap.set(s, { count: 1, lastSeen, firstSeen })
    } else {
      existing.count++
      if (lastSeen && (!existing.lastSeen || lastSeen > existing.lastSeen)) {
        existing.lastSeen = lastSeen
      }
      if (firstSeen && (!existing.firstSeen || firstSeen < existing.firstSeen)) {
        existing.firstSeen = firstSeen
      }
    }
  }

  // ── Query 2: latest crawl log per source (best-effort, table may not exist) ─
  const crawlLogMap = new Map<string, { ranAt: string; fetched: number; upserted: number; error: string | null }>()
  try {
    const { data: logs } = await supabase
      .from('crawl_logs')
      .select('source, ran_at, fetched, upserted, error')
      .order('ran_at', { ascending: false })
      .limit(500)

    for (const log of (logs ?? [])) {
      const src = log.source as string
      if (!crawlLogMap.has(src)) {
        crawlLogMap.set(src, {
          ranAt:    log.ran_at as string,
          fetched:  log.fetched as number,
          upserted: log.upserted as number,
          error:    log.error as string | null,
        })
      }
    }
  } catch { /* crawl_logs table not yet created — ignore */ }

  // ── Build per-source stats ─────────────────────────────────────────────────
  const allSourceKeys = Object.keys(SOURCE_LABELS)
  const stats: SourceStat[] = allSourceKeys.map(source => {
    const sg = sourceMap.get(source)
    const cl = crawlLogMap.get(source)
    return {
      source,
      label:        SOURCE_LABELS[source] ?? source,
      batch:        BATCH_MAP[source] ?? 0,
      activeGrants: sg?.count ?? 0,
      lastSeen:     sg?.lastSeen ?? null,
      firstSeen:    sg?.firstSeen ?? null,
      lastError:    cl?.error ?? null,
      lastRanAt:    cl?.ranAt ?? null,
      lastFetched:  cl?.fetched ?? null,
      lastUpserted: cl?.upserted ?? null,
    }
  })

  // Sort: errors first, then by batch, then name
  stats.sort((a, b) => {
    const aErr = a.activeGrants === 0 ? 0 : 1
    const bErr = b.activeGrants === 0 ? 0 : 1
    if (aErr !== bErr) return aErr - bErr
    if (a.batch !== b.batch) return a.batch - b.batch
    return a.label.localeCompare(b.label)
  })

  const totalActive   = stats.reduce((n, s) => n + s.activeGrants, 0)
  const healthyCount  = stats.filter(s => s.activeGrants > 0 && s.lastSeen && (Date.now() - new Date(s.lastSeen).getTime()) < 30 * 3_600_000).length
  const staleCount    = stats.filter(s => s.activeGrants > 0 && s.lastSeen && (Date.now() - new Date(s.lastSeen).getTime()) >= 30 * 3_600_000).length
  const errorCount    = stats.filter(s => s.activeGrants === 0).length
  const hasCrawlLogs  = crawlLogMap.size > 0

  return (
    <div>
      {/* Header */}
      <div className="mb-7">
        <h2 className="font-display text-2xl font-bold text-forest">Source Health Dashboard</h2>
        <p className="text-mid text-sm mt-1">
          {stats.length} sources · {totalActive.toLocaleString()} active grants
        </p>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-7">
        {[
          { label: 'Total sources',   value: stats.length,                      colour: 'text-forest' },
          { label: 'Active grants',   value: totalActive.toLocaleString(),       colour: 'text-gold'   },
          { label: '🟢 Healthy',      value: healthyCount,                       colour: 'text-green-700' },
          { label: '🔴 Issues',       value: errorCount + staleCount,            colour: errorCount + staleCount > 0 ? 'text-red-700' : 'text-forest' },
        ].map(kpi => (
          <div key={kpi.label} className="bg-white rounded-xl p-5 shadow-card text-center">
            <p className={`font-display text-3xl font-bold ${kpi.colour}`}>{kpi.value}</p>
            <p className="text-xs text-mid mt-1">{kpi.label}</p>
          </div>
        ))}
      </div>

      {!hasCrawlLogs && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3.5 mb-5 text-sm text-amber-800">
          <strong>Note:</strong> Run history columns will populate after you apply migration{' '}
          <code className="bg-amber-100 px-1.5 py-0.5 rounded text-xs">004_crawl_logs.sql</code>{' '}
          and the next cron run completes.
        </div>
      )}

      {/* Source table */}
      <div className="bg-white rounded-xl shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-warm bg-warm/30">
                <th className="text-left px-4 py-3 text-xs font-semibold text-mid uppercase tracking-wider">Source</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-mid uppercase tracking-wider">Batch</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-mid uppercase tracking-wider">Status</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-mid uppercase tracking-wider">Grants</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-mid uppercase tracking-wider">Last seen</th>
                {hasCrawlLogs && <>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-mid uppercase tracking-wider">Last run</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-mid uppercase tracking-wider">Fetched</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-mid uppercase tracking-wider">Upserted</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-mid uppercase tracking-wider">Error</th>
                </>}
              </tr>
            </thead>
            <tbody className="divide-y divide-warm/50">
              {stats.map(stat => {
                const badge = statusBadge(stat)
                return (
                  <tr key={stat.source} className="hover:bg-warm/20 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-charcoal">{stat.label}</p>
                      <p className="text-[11px] text-light font-mono">{stat.source}</p>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="text-xs bg-forest/10 text-forest rounded-full px-2 py-0.5 font-medium">
                        {stat.batch > 0 ? `B${stat.batch}` : '—'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${badge.dot}`} />
                        <span className={`text-xs font-medium ${badge.text}`}>{badge.label}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className={`font-bold ${stat.activeGrants > 0 ? 'text-charcoal' : 'text-red-500'}`}>
                        {stat.activeGrants}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-mid whitespace-nowrap">
                      {fmtDate(stat.lastSeen)}
                    </td>
                    {hasCrawlLogs && <>
                      <td className="px-4 py-3 text-xs text-mid whitespace-nowrap">
                        {fmtDate(stat.lastRanAt)}
                      </td>
                      <td className="px-3 py-3 text-right text-xs text-mid">
                        {stat.lastFetched ?? '—'}
                      </td>
                      <td className="px-3 py-3 text-right text-xs text-mid">
                        {stat.lastUpserted ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-xs max-w-xs">
                        {stat.lastError
                          ? <span className="text-red-600 font-medium truncate block" title={stat.lastError}>⚠ {stat.lastError}</span>
                          : <span className="text-green-600">✓ OK</span>
                        }
                      </td>
                    </>}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual trigger hint */}
      <div className="mt-5 bg-forest/5 border border-forest/20 rounded-xl px-5 py-4">
        <p className="text-sm font-medium text-forest mb-1">Manual crawl trigger</p>
        <p className="text-xs text-mid mb-3">
          Crons run daily at 06:00, 06:05, 06:10 UTC. To trigger manually (requires CRON_SECRET in header):
        </p>
        <div className="flex flex-col gap-1.5">
          {[1, 2, 3].map(b => (
            <code key={b} className="text-xs bg-white border border-warm rounded-lg px-3 py-1.5 text-charcoal font-mono block">
              {`GET /api/cron/crawl-grants?batch=${b}  — Authorization: Bearer $CRON_SECRET`}
            </code>
          ))}
        </div>
      </div>
    </div>
  )
}
