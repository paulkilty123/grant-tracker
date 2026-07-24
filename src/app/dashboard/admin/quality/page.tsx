// Tagging Quality dashboard — strategic admin view over the catalogue's
// data layer (provenance + pipeline_state + completeness signals).
//
// Server component: all aggregation happens at request time via parallel
// Supabase queries. Catalogue is small (~600 published rows) so in-process
// aggregation is fine; if it grows past ~5k rows, push the unnest queries
// down into Postgres views.
//
// Sections:
//   1. KPI strip — totals + pipeline_state breakdown
//   2. Field coverage — which canonical fields are missing across the catalogue
//   3. Sector + beneficiary distribution — where the catalogue is dense/sparse
//   4. Provenance breakdown — what's tagging the catalogue (scraper / AI / admin)
//   5. Quick link to Tag Audit for tactical worklist

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Database, CheckCircle, AlertTriangle, Sparkles, Brain, ClipboardList } from 'lucide-react'
import {
  IMPACT_SECTOR_OPTIONS,
  BENEFICIARY_OPTIONS,
} from '@/lib/tag-suggestions'

// ── Core fields surfaced in coverage section ─────────────────────────────────
const CORE_FIELDS: { field: string; label: string; isArray?: boolean; isObject?: boolean }[] = [
  { field: 'title',                label: 'Title' },
  { field: 'funder',               label: 'Funder' },
  { field: 'funder_type',          label: 'Funder type' },
  { field: 'funding_type',         label: 'Funding type' },
  { field: 'apply_url',            label: 'Apply URL' },
  { field: 'description',          label: 'Description' },
  { field: 'amount_max',           label: 'Amount max' },
  { field: 'deadline_or_rolling',  label: 'Deadline or rolling' },
  { field: 'location_tag',         label: 'Location tag' },
  { field: 'eligible_structures',  label: 'Eligible structures', isArray:  true },
  { field: 'impact_sectors',       label: 'Impact sectors',      isArray:  true },
  { field: 'target_beneficiaries', label: 'Target beneficiaries', isArray: true },
  { field: 'funder_brief',         label: 'Funder brief',         isObject: true },
]

function classify(source: string): string {
  if (source.startsWith('admin:'))         return source === 'admin:legacy' ? 'admin (legacy backfill)' : 'admin'
  if (source.startsWith('ai_classifier:')) return source
  if (source.startsWith('ai_enrich:'))     return source
  if (source.startsWith('ai_detect:'))     return source
  if (source.startsWith('ai_audit:'))      return source
  if (source.startsWith('360giving:'))     return '360giving'
  if (source.startsWith('scraper:'))       return 'scraper'
  if (source.startsWith('discovery:'))     return 'discovery'
  if (source.startsWith('seed:'))          return 'seed'
  if (source.startsWith('system:'))        return source
  return source
}

type Row = Record<string, unknown>

export default async function QualityPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // Pull everything in two queries — pipeline-state counts + the full published
  // rowset for in-process aggregation.
  const [pipelineRes, publishedRes] = await Promise.all([
    supabase.from('scraped_grants').select('pipeline_state', { count: 'exact' }),
    supabase
      .from('scraped_grants')
      .select('id, title, funder, funder_type, funding_type, apply_url, description, amount_min, amount_max, deadline, is_rolling, location_tag, eligible_structures, impact_sectors, target_beneficiaries, funder_brief, field_provenance')
      .eq('pipeline_state', 'published')
      .limit(5000),
  ])

  // Pipeline state breakdown
  const pipelineRows = (pipelineRes.data ?? []) as Row[]
  const pipelineCounts: Record<string, number> = { captured: 0, tagged: 0, published: 0, archived: 0 }
  for (const r of pipelineRows) {
    const s = r.pipeline_state as string
    if (s) pipelineCounts[s] = (pipelineCounts[s] ?? 0) + 1
  }

  const published = (publishedRes.data ?? []) as Row[]
  const total = published.length

  // Field coverage
  const coverage = CORE_FIELDS.map(f => {
    let populated = 0
    for (const row of published) {
      if (f.field === 'deadline_or_rolling') {
        if (row.deadline != null || row.is_rolling === true) populated++
      } else {
        const v = row[f.field]
        if (v === null || v === undefined) continue
        if (f.isArray && Array.isArray(v)) {
          if (v.length > 0) populated++
        } else if (f.isObject && typeof v === 'object') {
          if (Object.keys(v as Record<string, unknown>).length > 0) populated++
        } else if (typeof v === 'string') {
          if (v.trim().length > 0) populated++
        } else {
          populated++
        }
      }
    }
    const missing = total - populated
    const pct     = total > 0 ? Math.round((populated / total) * 100) : 0
    return { field: f.field, label: f.label, populated, missing, pct }
  }).sort((a, b) => a.pct - b.pct)  // worst coverage first

  // Sector + beneficiary distribution
  const sectorCounts:      Record<string, number> = {}
  const beneficiaryCounts: Record<string, number> = {}
  for (const row of published) {
    for (const s of (row.impact_sectors as string[] ?? [])) sectorCounts[s] = (sectorCounts[s] ?? 0) + 1
    for (const b of (row.target_beneficiaries as string[] ?? [])) beneficiaryCounts[b] = (beneficiaryCounts[b] ?? 0) + 1
  }
  const sectorDist = IMPACT_SECTOR_OPTIONS.map(opt => ({
    value: opt.value,
    label: opt.label,
    count: sectorCounts[opt.value] ?? 0,
  })).sort((a, b) => b.count - a.count)
  const beneficiaryDist = BENEFICIARY_OPTIONS.map(opt => ({
    value: opt.value,
    label: opt.label,
    count: beneficiaryCounts[opt.value] ?? 0,
  })).sort((a, b) => b.count - a.count)

  // Provenance breakdown — per-source counts for impact_sectors, target_beneficiaries,
  // eligible_structures, funder_brief. These four are the most-debated fields.
  const provenanceFields = ['impact_sectors', 'target_beneficiaries', 'eligible_structures', 'funder_brief']
  const provenanceData = provenanceFields.map(field => {
    const sourceCounts: Record<string, number> = {}
    for (const row of published) {
      const prov = row.field_provenance as Record<string, { source: string }> | null
      const src = prov?.[field]?.source
      if (src) sourceCounts[classify(src)] = (sourceCounts[classify(src)] ?? 0) + 1
    }
    const total = Object.values(sourceCounts).reduce((a, b) => a + b, 0)
    return {
      field,
      total,
      sources: Object.entries(sourceCounts)
        .map(([source, count]) => ({ source, count, pct: total > 0 ? Math.round((count / total) * 100) : 0 }))
        .sort((a, b) => b.count - a.count),
    }
  })

  // Sparse signals — sectors with <10 grants or beneficiaries with <10 grants
  // are coverage gaps worth knowing about
  const sparseSectors      = sectorDist.filter(s => s.count < 10)
  const sparseBeneficiaries = beneficiaryDist.filter(b => b.count < 10)

  return (
    <div>
      {/* Header */}
      <div className="mb-7">
        <h2 className="font-display text-2xl font-bold text-forest">Tagging Quality</h2>
        <p className="text-mid text-sm mt-1">
          Catalogue-wide view of field coverage, tag distribution, and provenance. Pair with{' '}
          <Link href="/dashboard/admin/urls?tab=tag_audit" className="text-forest underline">Tag Audit</Link>
          {' '}for the per-grant worklist.
        </p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-7">
        {[
          { label: 'Published',  value: pipelineCounts.published, Icon: CheckCircle,   colour: 'text-forest' },
          { label: 'Tagged',     value: pipelineCounts.tagged,    Icon: Brain,         colour: 'text-sage-deep' },
          { label: 'Captured',   value: pipelineCounts.captured,  Icon: Sparkles,      colour: 'text-amber-700' },
          { label: 'Archived',   value: pipelineCounts.archived,  Icon: Database,      colour: 'text-mid' },
        ].map(kpi => (
          <div key={kpi.label} className="bg-white rounded-xl p-5 shadow-card text-center">
            <kpi.Icon className={`mx-auto mb-2 h-5 w-5 ${kpi.colour}`} />
            <p className={`font-display text-3xl font-bold ${kpi.colour}`}>{kpi.value}</p>
            <p className="text-xs text-mid mt-1">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Section 1: Field coverage */}
      <div className="bg-white rounded-xl shadow-card overflow-hidden mb-7">
        <div className="px-5 py-3 border-b border-warm bg-warm/30 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-charcoal">Field coverage</p>
            <p className="text-xs text-mid mt-0.5">Across {total} published grants. Worst coverage first — these are the gaps users notice.</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-warm bg-warm/10 text-left text-xs font-semibold text-mid uppercase tracking-wider">
                <th className="px-5 py-3">Field</th>
                <th className="px-5 py-3 text-right">Populated</th>
                <th className="px-5 py-3 text-right">Missing</th>
                <th className="px-5 py-3 text-right w-32">Coverage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-warm/60">
              {coverage.map(f => (
                <tr key={f.field} className="hover:bg-surface-page/50 transition-colors">
                  <td className="px-5 py-3 font-medium text-charcoal">{f.label}</td>
                  <td className="px-5 py-3 text-right text-sm font-semibold" style={{ color: 'var(--state-success)' }}>{f.populated}</td>
                  <td className="px-5 py-3 text-right text-sm font-semibold" style={{ color: f.missing > 0 ? 'var(--state-error)' : 'var(--text-muted)' }}>{f.missing}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <div className="h-1.5 w-20 rounded-full bg-warm overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${f.pct}%`,
                            background: f.pct >= 90 ? '#8ECB3C' : f.pct >= 70 ? 'var(--ordinal-3-good)' : 'var(--terra)',
                          }}
                        />
                      </div>
                      <span className="text-xs font-semibold text-mid w-10 text-right">{f.pct}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 2: Distribution (sector + beneficiary side-by-side) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-7">
        <DistTable
          title="Impact sectors"
          subtitle="Coverage across the published catalogue. Sparse sectors = catalogue gaps."
          rows={sectorDist}
          sparseFlag={sparseSectors.length}
        />
        <DistTable
          title="Target beneficiaries"
          subtitle="Currently skews toward general_public — see provenance breakdown for why."
          rows={beneficiaryDist}
          sparseFlag={sparseBeneficiaries.length}
        />
      </div>

      {/* Section 3: Provenance */}
      <div className="bg-white rounded-xl shadow-card overflow-hidden mb-7">
        <div className="px-5 py-3 border-b border-warm bg-warm/30">
          <p className="text-sm font-semibold text-charcoal">Provenance breakdown</p>
          <p className="text-xs text-mid mt-0.5">
            What&apos;s tagging the catalogue right now. High admin or 360giving share = curated; high scraper share = thinly-classified.
            <span className="ml-1 italic">admin (legacy backfill)</span> means the Phase A backfill heuristic — neither real admin nor real AI, will get overwritten by future classifier runs.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 px-5 py-4">
          {provenanceData.map(p => (
            <div key={p.field}>
              <p className="text-xs font-semibold text-charcoal uppercase tracking-wide mb-2">{p.field.replace(/_/g, ' ')}</p>
              {p.sources.length === 0 ? (
                <p className="text-xs text-light italic">No provenance — field unused on published grants.</p>
              ) : (
                <div className="space-y-1.5">
                  {p.sources.map(s => (
                    <div key={s.source} className="flex items-center gap-2 text-xs">
                      <span
                        className="text-mid flex-shrink-0 truncate max-w-[180px]"
                        title={s.source}
                      >
                        {s.source}
                      </span>
                      <div className="flex-1 h-1 rounded-full bg-warm overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${s.pct}%`,
                            background:
                              s.source.startsWith('admin')        ? 'var(--state-success)' :
                              s.source.startsWith('ai_classifier') ? 'var(--ordinal-2-fair)' :
                              s.source.startsWith('ai_enrich')    ? 'var(--teal)' :
                              s.source.startsWith('360giving')    ? 'var(--ordinal-3-good)' :
                              s.source === 'scraper'              ? 'var(--text-muted)' :
                                                                    'var(--text-subtle)',
                          }}
                        />
                      </div>
                      <span className="text-mid font-semibold w-12 text-right">{s.count}</span>
                      <span className="text-light w-10 text-right">{s.pct}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Section 4: Audit shortcut */}
      <div className="rounded-xl border border-coral-mid bg-coral-pale px-5 py-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-coral-deep flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4" /> Tactical worklist
          </p>
          <p className="text-xs text-coral-saturated mt-0.5">
            Grant-level disagreement signal between current tags and brief text. Click through to review per-grant.
          </p>
        </div>
        <Link
          href="/dashboard/admin/urls?tab=tag_audit"
          className="flex items-center gap-1.5 rounded-full bg-coral-saturated px-4 py-2 text-xs font-semibold text-white hover:bg-coral-deep transition-colors whitespace-nowrap"
        >
          <ClipboardList className="h-3.5 w-3.5" /> Open Tag Audit
        </Link>
      </div>
    </div>
  )
}

// ── Distribution table component ─────────────────────────────────────────────

function DistTable({
  title,
  subtitle,
  rows,
  sparseFlag,
}: {
  title:      string
  subtitle:   string
  rows:       { value: string; label: string; count: number }[]
  sparseFlag: number
}) {
  const max = Math.max(1, ...rows.map(r => r.count))
  return (
    <div className="bg-white rounded-xl shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b border-warm bg-warm/30">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-charcoal">{title}</p>
          {sparseFlag > 0 && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-coral-pale text-coral-deep">
              {sparseFlag} sparse
            </span>
          )}
        </div>
        <p className="text-xs text-mid mt-0.5">{subtitle}</p>
      </div>
      <div className="px-5 py-3 space-y-1.5 max-h-[480px] overflow-y-auto">
        {rows.map(r => (
          <div key={r.value} className="flex items-center gap-3 text-xs">
            <span className="text-charcoal flex-shrink-0 w-36 truncate">{r.label}</span>
            <div className="flex-1 h-1.5 rounded-full bg-warm overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(r.count / max) * 100}%`,
                  background: r.count >= 10 ? '#8ECB3C' : r.count >= 3 ? 'var(--ordinal-3-good)' : 'var(--terra)',
                }}
              />
            </div>
            <span className="font-semibold text-mid w-10 text-right">{r.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
