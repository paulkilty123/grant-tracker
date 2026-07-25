import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ThreeSixtyGivingPanel from './ThreeSixtyGivingPanel'
import FillAmountsPanel from './FillAmountsPanel'
import DiscoveryPanel from './DiscoveryPanel'
import ClearProfileButton from './ClearProfileButton'

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
  cf_ni:                    'Community Foundation NI',
  heart_of_england_cf:      'Heart of England CF',
  foundation_scotland:      'Foundation Scotland',
  london_cf:                'London Community Foundation',
  hiwcf:                    'Hants & IoW CF',
  asda_foundation:          'Asda Foundation',
  aviva_foundation:         'Aviva Foundation',
  tyne_wear_cf:             'Tyne & Wear CF',
  bbc_cin:                  'BBC Children in Need',
  paul_hamlyn_foundation:   'Paul Hamlyn Foundation',
  esmee_fairbairn:          'Esmée Fairbairn Foundation',
  garfield_weston:          'Garfield Weston Foundation',
  clothworkers_foundation:  'Clothworkers Foundation',
  jrct:                     'Joseph Rowntree CT',
  peoples_health_trust:     "People's Health Trust",
  national_churches_trust:  'National Churches Trust',
  tudor_trust:              'Tudor Trust',
  ufi_voctech:              'Ufi VocTech Trust',
  // Curated catalogue seeds & special sources
  '360giving':              '360Giving Open Data',
  seed:                     'Seed (Legacy)',
  'roadmap-seed':           'Roadmap Seed',
  'catalogue-seed':         'Catalogue Seed (Curated)',
  deep_search:              'Deep Search',
  manual:                   'Manual',
  scraped:                  'Scraped (Other)',
  // Additional scraped sources
  woolwich_cf:              'Woolwich CF',
  young_camden_foundation:  'Young Camden Foundation',
  lloyds_bank_foundation:   'Lloyds Bank Foundation',
  barrow_cadbury:           'Barrow Cadbury Trust',
  blagrave_trust:           'Blagrave Trust',
  power_to_change:          'Power to Change',
  wolfson_foundation:       'Wolfson Foundation',
  rank_foundation:          'Rank Foundation',
  foyle_foundation:         'Foyle Foundation',
  pilgrim_trust:            'Pilgrim Trust',
  wellcome_trust:           'Wellcome Trust',
  ernest_cook_trust:        'Ernest Cook Trust',
  architectural_heritage_fund: 'Architectural Heritage Fund',
  rosa_uk:                  'Rosa UK',
  jrf:                      'Joseph Rowntree Foundation',
  comic_relief:             'Comic Relief',
  local_trust:              'Local Trust',
  historic_england:         'Historic England',
  nesta:                    'Nesta',
  innovate_uk:              'Innovate UK',
  sport_scotland:           'Sport Scotland',
  spacehive:                'Spacehive',
  tesco_bags_of_help:       'Tesco Bags of Help',
  cadent_foundation:        'Cadent Foundation',
  creative_scotland:        'Creative Scotland',
}

const BATCH_MAP: Record<string, number> = {
  gov_uk: 1, tnlcf: 1, ukri: 1, gla: 1, arts_council: 1,
  sport_england: 1, heritage_fund: 1, forever_manchester: 1, two_ridings_cf: 1,
  cf_ni: 1, heart_of_england_cf: 1, foundation_scotland: 1, london_cf: 1,
  hiwcf: 2, asda_foundation: 2, aviva_foundation: 2,
  tyne_wear_cf: 2, bbc_cin: 2,
  paul_hamlyn_foundation: 3, esmee_fairbairn: 3,
  garfield_weston: 3, clothworkers_foundation: 3,
  jrct: 3, peoples_health_trust: 3,
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

// Freshness thresholds, derived from the actual crawl cadence.
//
// 2026-07-25: these were 30h (healthy) / 72h (stale), which would be right for a
// daily crawl. crawl-grants runs Monday AND Thursday only (vercel.json), so the
// longest EXPECTED gap between runs is Thu 06:00 -> Mon 06:00 = 96h. With a 30h
// window, every source flipped to "Stale"/"Outdated" from roughly Tuesday
// afternoon onward, which pinned the "🔴 Issues" KPI high for most of the week --
// guaranteed alarm fatigue on the only at-a-glance health number in the product.
//
// Keep these expressed relative to the cadence so they don't drift again if the
// schedule changes. If crawl-grants moves to daily, set CRAWL_GAP_HOURS to 24.
const CRAWL_GAP_HOURS   = 96                        // longest expected gap (Thu -> Mon)
const HEALTHY_MAX_HOURS = CRAWL_GAP_HOURS * 1.25    // 120h — one cycle plus margin
const STALE_MAX_HOURS   = CRAWL_GAP_HOURS * 2.5     // 240h — missed a full cycle

function statusBadge(stat: SourceStat) {
  if (stat.activeGrants === 0) {
    return { dot: 'bg-coral-pale0', text: 'text-coral-deep', label: 'No grants' }
  }
  if (!stat.lastSeen) {
    return { dot: 'bg-gray-400', text: 'text-gray-600', label: 'Unknown' }
  }
  const hoursAgo = (Date.now() - new Date(stat.lastSeen).getTime()) / 3_600_000
  if (hoursAgo < HEALTHY_MAX_HOURS) return { dot: 'bg-green-500', text: 'text-green-700', label: 'Healthy' }
  if (hoursAgo < STALE_MAX_HOURS)   return { dot: 'bg-amber-500', text: 'text-amber-700', label: 'Stale' }
  return { dot: 'bg-coral-pale0', text: 'text-coral-deep', label: 'Outdated' }
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
  // Uses the same cadence-derived threshold as statusBadge above, so the KPI
  // tiles and the per-source badges can never disagree.
  const healthyCount  = stats.filter(s => s.activeGrants > 0 && s.lastSeen && (Date.now() - new Date(s.lastSeen).getTime()) <  HEALTHY_MAX_HOURS * 3_600_000).length
  const staleCount    = stats.filter(s => s.activeGrants > 0 && s.lastSeen && (Date.now() - new Date(s.lastSeen).getTime()) >= HEALTHY_MAX_HOURS * 3_600_000).length
  const errorCount    = stats.filter(s => s.activeGrants === 0).length
  const hasCrawlLogs  = crawlLogMap.size > 0

  return (
    <div>
      {/* Header */}
      <div className="mb-7">
        <h2 className="font-display text-2xl font-bold text-forest">Grant Health</h2>
        <p className="text-mid text-sm mt-1">
          {stats.length} sources · {totalActive.toLocaleString()} active grants
        </p>
      </div>

      <ClearProfileButton />

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-7">
        {[
          { label: 'Total sources',   value: stats.length,                      colour: 'text-forest' },
          { label: 'Active grants',   value: totalActive.toLocaleString(),       colour: 'text-gold'   },
          { label: '🟢 Healthy',      value: healthyCount,                       colour: 'text-green-700' },
          { label: '🔴 Issues',       value: errorCount + staleCount,            colour: errorCount + staleCount > 0 ? 'text-coral-deep' : 'text-forest' },
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
                      <span className={`font-bold ${stat.activeGrants > 0 ? 'text-charcoal' : 'text-coral-saturated'}`}>
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
                          ? <span className="text-coral-saturated font-medium truncate block" title={stat.lastError}>⚠ {stat.lastError}</span>
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

      {/* Automated discovery pipeline */}
      <DiscoveryPanel />

      {/* 360Giving ingest panel */}
      <ThreeSixtyGivingPanel />

      {/* Fill missing amounts */}
      <FillAmountsPanel />

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
