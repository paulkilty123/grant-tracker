// Cohort Match Audit — per-org review of what the matcher actually surfaces.
//
// Server component: imports computeMatchScore directly (same code path the
// search page uses client-side) and runs it for every onboarded organisation
// against the live published catalogue. Renders top 10 matches per org with
// score breakdown, plus profile-completeness flags so quality issues can be
// distinguished from genuine catalogue gaps.
//
// This is an audit/review tool, not a user-facing surface — intended for
// pre-launch cohort sweep and ongoing match-quality checks.

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AlertTriangle, CheckCircle } from 'lucide-react'
import { computeMatchScore } from '@/lib/matching'
import { normaliseScrapedGrant } from '@/lib/grants-normalise'
import type { Organisation } from '@/types'

export const maxDuration = 60  // 16 orgs × ~600 grants × matcher per pair

const SCORE_BAND = (score: number) => {
  if (score >= 80) return { label: 'Good',    bg: '#F1F7E4', text: '#3B6D11', border: '#8ECB3C' }
  if (score >= 65) return { label: 'Moderate', bg: '#FAEEDA', text: '#854F0B', border: '#EF9F27' }
  if (score >= 45) return { label: 'Weak',    bg: '#F5F1E8', text: '#5F5E5A', border: '#E8E0D1' }
  return                    { label: 'Poor',    bg: '#FAECE7', text: '#993C1D', border: '#D85A30' }
}

type OrgRow = Record<string, unknown>

// Build profile-completeness flags for an org. Flagged issues are the most
// common reasons matches go sideways — surface them per-org so the audit
// distinguishes "catalogue thin" from "profile thin".
function profileFlags(org: OrgRow): string[] {
  const flags: string[] = []
  if (!org.legal_structure)                                                     flags.push('No legal_structure — eligibility hard-gate disabled')
  if (!Array.isArray(org.impact_sectors)        || org.impact_sectors.length === 0)        flags.push('No impact_sectors — free-text fallback used (lower precision)')
  if (!Array.isArray(org.beneficiary_groups)    || org.beneficiary_groups.length === 0)    flags.push('No beneficiary_groups — beneficiary dimension defaults to neutral 5/20')
  if (!org.primary_location)                                                    flags.push('No primary_location — location dimension defaults to neutral 12/15')
  if (org.min_grant_target == null && org.max_grant_target == null)             flags.push('No grant size targets — grant_size dimension always neutral')
  if (!Array.isArray(org.funding_type_preferences) || (org.funding_type_preferences as unknown[]).length === 0) flags.push('No funding_type_preferences — funder_type dimension uses stage proxy')
  return flags
}

function arr(v: unknown): string[] {
  return Array.isArray(v) ? (v as string[]) : []
}

export default async function CohortMatchAuditPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // ── Load cohort orgs (everything with a non-null name) ─────────────────────
  const { data: orgs } = await supabase
    .from('organisations')
    .select('*')
    .order('created_at', { ascending: false })

  // ── Load published catalogue once, normalise once ──────────────────────────
  const { data: grantRows } = await supabase
    .from('scraped_grants')
    .select('*')
    .eq('pipeline_state', 'published')
    .limit(5000)

  const grants = (grantRows ?? []).map(r => normaliseScrapedGrant(r as Record<string, unknown>))

  // ── For each org: compute matches, sort, take top 10 ───────────────────────
  const perOrg = (orgs ?? []).map(orgRow => {
    const org = orgRow as unknown as Organisation
    const matches = grants
      .map(g => ({ grant: g, result: computeMatchScore(g, org) }))
      .sort((a, b) => b.result.score - a.result.score)

    const top10 = matches.slice(0, 10)
    const all   = matches.map(m => m.result.score)
    const stats = {
      total:       all.length,
      median:      all.length > 0 ? all.sort((a, b) => a - b)[Math.floor(all.length / 2)] : 0,
      avg:         all.length > 0 ? Math.round(all.reduce((s, v) => s + v, 0) / all.length) : 0,
      good:        all.filter(s => s >= 80).length,
      moderate:    all.filter(s => s >= 65 && s < 80).length,
      weak:        all.filter(s => s >= 45 && s < 65).length,
      poor:        all.filter(s => s < 45).length,
      capped45:    all.filter(s => s >= 40 && s <= 45).length,  // structure / location / primary-domain caps cluster here
    }

    return {
      org:    orgRow as OrgRow,
      flags:  profileFlags(orgRow as OrgRow),
      top10,
      stats,
    }
  })

  // Cohort-wide rollup
  const cohortRollup = {
    org_count:        perOrg.length,
    orgs_with_flags:  perOrg.filter(o => o.flags.length > 0).length,
    avg_top1_score:   perOrg.length > 0 ? Math.round(perOrg.reduce((s, o) => s + (o.top10[0]?.result.score ?? 0), 0) / perOrg.length) : 0,
    orgs_with_poor_best: perOrg.filter(o => (o.top10[0]?.result.score ?? 0) < 65).length,
  }

  return (
    <div>
      <div className="mb-7">
        <h2 className="font-display text-2xl font-bold text-forest">Cohort Match Audit</h2>
        <p className="text-mid text-sm mt-1">
          Top 10 matches per cohort organisation, computed live against the published catalogue using the same matcher the search page uses.
          Reveals where match quality is gated by org profile gaps vs. catalogue gaps.
        </p>
      </div>

      {/* Rollup */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-7">
        {[
          { label: 'Orgs reviewed',     value: cohortRollup.org_count,           colour: 'text-forest' },
          { label: 'With profile gaps', value: cohortRollup.orgs_with_flags,     colour: cohortRollup.orgs_with_flags > 0 ? 'text-coral-saturated' : 'text-sage' },
          { label: 'Avg top-1 score',   value: cohortRollup.avg_top1_score,      colour: cohortRollup.avg_top1_score >= 70 ? 'text-sage' : 'text-amber-700' },
          { label: 'Orgs with weak best', value: cohortRollup.orgs_with_poor_best, colour: cohortRollup.orgs_with_poor_best > 0 ? 'text-coral-saturated' : 'text-sage' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl p-5 shadow-card text-center">
            <p className={`font-display text-3xl font-bold ${k.colour}`}>{k.value}</p>
            <p className="text-xs text-mid mt-1">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Per-org sections */}
      <div className="space-y-7">
        {perOrg.map(({ org, flags, top10, stats }) => {
          const name = String(org.name ?? '(unnamed)')
          return (
            <div key={String(org.id)} className="bg-white rounded-xl shadow-card overflow-hidden">
              {/* Org header */}
              <div className="border-b border-warm bg-warm/30 px-5 py-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <p className="font-display text-lg font-bold text-charcoal">{name}</p>
                    <p className="text-xs text-mid mt-0.5">
                      {[
                        org.legal_structure,
                        org.primary_location,
                        org.annual_income_band,
                        Array.isArray(org.impact_sectors) && (org.impact_sectors as string[]).length > 0
                          ? `sectors: ${(org.impact_sectors as string[]).join(', ')}`
                          : null,
                      ].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span title="Median match score across the whole catalogue">
                      <span className="text-mid">median</span> <span className="font-semibold text-charcoal">{stats.median}</span>
                    </span>
                    <span title="Average match score across the whole catalogue">
                      <span className="text-mid">avg</span> <span className="font-semibold text-charcoal">{stats.avg}</span>
                    </span>
                    <span title="Matches scoring ≥80 in band 'Good'">
                      <span className="text-sage font-semibold">{stats.good}</span> <span className="text-mid">good</span>
                    </span>
                    <span title="Score 65-79: moderate">
                      <span className="text-amber-700 font-semibold">{stats.moderate}</span> <span className="text-mid">mod</span>
                    </span>
                    <span title="Score 40-45 cluster — likely caught by structure / location / primary-domain caps">
                      <span className="text-coral-deep font-semibold">{stats.capped45}</span> <span className="text-mid">capped</span>
                    </span>
                  </div>
                </div>
                {flags.length > 0 && (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                    <p className="text-[11px] font-semibold text-amber-800 mb-1 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Profile gaps that may distort matches
                    </p>
                    <ul className="space-y-0.5">
                      {flags.map((f, i) => (
                        <li key={i} className="text-[11px] text-amber-700">· {f}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Top 10 matches table */}
              {top10.length === 0 ? (
                <div className="py-12 text-center text-sm text-mid">No grants in catalogue.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-warm bg-warm/10 text-left text-xs font-semibold text-mid uppercase tracking-wider">
                        <th className="px-5 py-3 w-16 text-center">Score</th>
                        <th className="px-5 py-3">Grant</th>
                        <th className="px-5 py-3">Breakdown</th>
                        <th className="px-5 py-3">Sectors</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-warm/60">
                      {top10.map(({ grant, result }) => {
                        const band = SCORE_BAND(result.score)
                        const bd = result.breakdown
                        return (
                          <tr key={String(grant.id)} className="hover:bg-cream/30 transition-colors">
                            <td className="px-5 py-3 text-center">
                              <span
                                className="inline-flex items-center justify-center min-w-[36px] h-7 rounded-full text-xs font-bold"
                                style={{ background: band.bg, color: band.text, border: `1px solid ${band.border}` }}
                              >
                                {result.score}
                              </span>
                              <p className="text-[10px] text-mid mt-1">{band.label}</p>
                            </td>
                            <td className="px-5 py-3 max-w-[280px]">
                              <p className="font-medium text-charcoal leading-snug line-clamp-2">{grant.title}</p>
                              <p className="text-xs text-mid mt-0.5">{grant.funder}</p>
                              <p className="text-[10px] text-light mt-0.5">
                                {[grant.fundingType, grant.locationTag ?? 'no location_tag', grant.amountMax ? `£${grant.amountMax}` : null].filter(Boolean).join(' · ')}
                              </p>
                            </td>
                            <td className="px-5 py-3 text-[11px] text-mid font-mono">
                              <div>L {bd.location.score}/{bd.location.max}</div>
                              <div>T {bd.themes.score}/{bd.themes.max}</div>
                              {bd.beneficiaries && <div>B {bd.beneficiaries.score}/{bd.beneficiaries.max}</div>}
                              <div>S {bd.grantSize.score}/{bd.grantSize.max} · F {bd.funderType.score}/{bd.funderType.max} · E {bd.eligibility.score}/{bd.eligibility.max}</div>
                            </td>
                            <td className="px-5 py-3 text-[11px] text-mid max-w-[200px]">
                              <p>
                                <span className="font-semibold text-charcoal">Grant:</span>{' '}
                                {arr(grant.impactSectors).join(', ') || <span className="italic text-light">none</span>}
                              </p>
                              <p className="mt-1">
                                <span className="font-semibold text-charcoal">Org:</span>{' '}
                                {arr(org.impact_sectors).join(', ') || <span className="italic text-light">none</span>}
                              </p>
                              {arr(grant.impactSectors).filter(s => arr(org.impact_sectors).includes(s)).length > 0 && (
                                <p className="mt-1 text-sage">
                                  ∩ {arr(grant.impactSectors).filter(s => arr(org.impact_sectors).includes(s)).join(', ')}
                                </p>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Empty-state footer */}
      {perOrg.length === 0 && (
        <div className="rounded-xl border border-warm bg-white px-6 py-12 text-center">
          <CheckCircle className="mx-auto mb-3 h-8 w-8 text-sage" />
          <p className="text-mid text-sm">No cohort organisations to review yet.</p>
        </div>
      )}
    </div>
  )
}
