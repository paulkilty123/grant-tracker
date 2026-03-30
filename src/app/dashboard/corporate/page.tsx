'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  Search, Building2, ExternalLink, MapPin, Handshake,
  SlidersHorizontal, User, CheckCircle2, ChevronDown, ChevronUp,
  Users, Globe, Phone, Calendar, Tag,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getOrganisationByOwner } from '@/lib/organisations'
import {
  computeCorporateMatches,
  SUPPORT_TYPE_LABELS,
  APPLICATION_ROUTE_LABELS,
  type CorporatePartner,
  type CorporateMatchResult,
} from '@/lib/corporate-matching'
import type { Organisation } from '@/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function matchBand(score: number): { label: string; fg: string; bg: string; border: string } {
  if (score >= 70) return { label: 'Strong match',   fg: '#1f5c52', bg: 'rgba(31,92,82,0.10)',    border: 'rgba(31,92,82,0.30)'    }
  if (score >= 50) return { label: 'Good match',     fg: '#2d8a7a', bg: 'rgba(45,138,122,0.10)',  border: 'rgba(45,138,122,0.30)'  }
  if (score >= 35) return { label: 'Possible match', fg: '#b07a10', bg: 'rgba(232,160,48,0.12)',  border: 'rgba(232,160,48,0.35)'  }
  return             { label: 'Broad match',         fg: '#6b7280', bg: 'rgba(107,114,128,0.08)', border: 'rgba(107,114,128,0.25)' }
}

function formatAmount(min: number | null, max: number | null): string | null {
  if (!min && !max) return null
  if (max && max >= 1_000_000) return `Up to £${(max / 1_000_000).toFixed(1)}m`
  if (min && max && min !== max) return `£${(min / 1000).toFixed(0)}k–£${(max / 1000).toFixed(0)}k`
  if (max) return `Up to £${(max / 1000).toFixed(0)}k`
  if (min) return `From £${(min / 1000).toFixed(0)}k`
  return null
}

function formatBudget(n: number | null): string | null {
  if (!n) return null
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(1)}m / year`
  return `£${(n / 1000).toFixed(0)}k / year`
}

// ── Partner card ──────────────────────────────────────────────────────────────

function PartnerCard({
  result, showScore, expanded, onToggle,
}: {
  result: CorporateMatchResult
  showScore: boolean
  expanded: boolean
  onToggle: () => void
}) {
  const { partner, score, reason } = result
  const band = matchBand(score)
  const amountStr = formatAmount(partner.amount_min, partner.amount_max)
  const budgetStr = formatBudget(partner.annual_investment_estimate)

  return (
    <div className={`bg-white border transition-all rounded-xl overflow-hidden ${
      expanded ? 'border-forest/40 shadow-md' : 'border-[#E8E8EC] hover:border-[#c8d5c2] hover:shadow-sm'
    }`}>
      <div className="p-5 flex flex-col gap-3">

        {/* ── Header row: avatar / name + match insight ── */}
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 bg-charcoal flex items-center justify-center text-white font-bold text-base select-none rounded-lg">
            {partner.company_name[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="flex-1 min-w-0 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-semibold text-charcoal text-base leading-snug">{partner.company_name}</h3>
              {partner.programme_name && (
                <p className="text-xs text-mid leading-snug">{partner.programme_name}</p>
              )}
            </div>
            {/* Match insight — sits in the natural white space to the right of the name */}
            {showScore && score > 0 && (
              <div className="flex-shrink-0 w-44 flex items-start gap-1.5 px-2.5 py-1.5 bg-forest/5 border border-forest/20 rounded-lg">
                <Handshake className="h-3 w-3 text-forest flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-forest/80 leading-snug line-clamp-3">{reason}</p>
              </div>
            )}
          </div>
        </div>

        {/* Description */}
        {partner.description && (
          <p className="text-sm text-mid leading-relaxed">
            {expanded
              ? partner.description
              : partner.description.length > 160
                ? `${partner.description.slice(0, 160).trimEnd()}…`
                : partner.description}
          </p>
        )}

        {/* Inline meta strip — only renders items that have data */}
        {(amountStr || partner.application_route || partner.geographic_focus.length > 0) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-mid">
            {amountStr && (
              <span><span className="font-bold text-charcoal">{amountStr}</span></span>
            )}
            {partner.application_route && (
              <span>{APPLICATION_ROUTE_LABELS[partner.application_route] ?? partner.application_route}</span>
            )}
            {partner.geographic_focus.length > 0 && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3 flex-shrink-0" />
                {partner.geographic_focus.slice(0, 2).join(', ')}
                {partner.geographic_focus.length > 2 && ` +${partner.geographic_focus.length - 2}`}
              </span>
            )}
            {budgetStr && <span>{budgetStr}</span>}
          </div>
        )}

        {/* CSR themes */}
        {partner.csr_themes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {(expanded ? partner.csr_themes : partner.csr_themes.slice(0, 5)).map(t => (
              <span key={t} className="text-[10px] px-2 py-0.5 bg-sage/10 text-forest border border-sage/25 rounded-md capitalize">
                {t}
              </span>
            ))}
            {!expanded && partner.csr_themes.length > 5 && (
              <span className="text-[10px] px-2 py-0.5 text-mid">+{partner.csr_themes.length - 5} more</span>
            )}
          </div>
        )}

        {/* ── Expanded detail panel ── */}
        {expanded && (
          <div className="mt-1 pt-4 border-t border-[#F0EDE8]">
            <div className="grid sm:grid-cols-3 gap-x-8 gap-y-4">

              {/* Example recipients */}
              {partner.example_recipients && partner.example_recipients.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Users className="h-3.5 w-3.5 text-mid" />
                    <p className="text-[9px] font-bold uppercase tracking-widest text-mid">Previous recipients</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {partner.example_recipients.map((r: string) => (
                      <span key={r} className="text-[10px] px-2 py-0.5 bg-[#f5f2ed] text-charcoal border border-[#e4dfd8] rounded-md">
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* All impact sectors */}
              {partner.impact_sectors && partner.impact_sectors.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Tag className="h-3.5 w-3.5 text-mid" />
                    <p className="text-[9px] font-bold uppercase tracking-widest text-mid">Focus areas</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {partner.impact_sectors.map((s: string) => (
                      <span key={s} className="text-[10px] px-2 py-0.5 bg-[#f0ede8] text-charcoal border border-[#e4dfd8] rounded-md capitalize">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Contact */}
              {(partner.contact_role || partner.contact_url || partner.website) && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Phone className="h-3.5 w-3.5 text-mid" />
                    <p className="text-[9px] font-bold uppercase tracking-widest text-mid">Contact</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    {partner.contact_role && (
                      <p className="text-sm font-medium text-charcoal">{partner.contact_role}</p>
                    )}
                    {(partner.contact_url || partner.website) && (
                      <a
                        href={partner.contact_url ?? partner.website ?? '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-forest hover:text-sage flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3" />
                        {partner.contact_url ? 'Contact page' : 'Website'}
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* All geographies (only if > 2) */}
              {partner.geographic_focus.length > 2 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Globe className="h-3.5 w-3.5 text-mid" />
                    <p className="text-[9px] font-bold uppercase tracking-widest text-mid">All locations</p>
                  </div>
                  <p className="text-sm text-charcoal">{partner.geographic_focus.join(', ')}</p>
                </div>
              )}
            </div>

            {/* How to approach — full width */}
            <div className="mt-4 px-4 py-3 bg-amber-50/60 border border-amber-200/60 rounded-lg">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Calendar className="h-3.5 w-3.5 text-gold flex-shrink-0" />
                <p className="text-[9px] font-bold uppercase tracking-widest text-mid">How to approach</p>
              </div>
              <p className="text-xs text-mid leading-relaxed">
                {partner.application_route === 'open_application'
                  ? 'Applications are open — apply directly via their website. Read their guidelines carefully and address their stated priorities explicitly in your application.'
                  : partner.application_route === 'invitation_only'
                    ? 'Invitation only. Build a relationship first — connect with their CSR or community team on LinkedIn before making any approach.'
                    : partner.application_route === 'relationship_based'
                      ? 'Relationship-based. Do your research on their CSR goals, find a warm introduction if possible, and lead with shared values rather than a funding ask.'
                      : partner.application_route === 'community_fund'
                        ? 'Community-voted fund. Check their website for when voting opens and mobilise your supporters to vote for your project.'
                        : 'Contact their CSR or community team directly. Lead with how your mission aligns with their stated priorities.'}
              </p>
            </div>
          </div>
        )}

        {/* Score row — above the footer line */}
        {showScore && score > 0 && (
          <div className="flex justify-end items-center gap-1.5">
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 uppercase tracking-widest border whitespace-nowrap rounded-md"
              style={{ color: band.fg, backgroundColor: band.bg, borderColor: band.border }}
            >
              {band.label}
            </span>
            <span className="text-lg font-bold leading-none" style={{ color: band.fg }}>
              {score}<span className="text-[10px] font-normal text-mid">/100</span>
            </span>
          </div>
        )}

        {/* Footer: support tags + actions */}
        <div className="flex items-center justify-between gap-3 pt-1 border-t border-[#F0EDE8]">
          <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
            {partner.support_types.map(t => (
              <span key={t} className="text-[9px] font-bold px-2 py-0.5 uppercase tracking-wider bg-[#f0ede8] text-charcoal border border-[#e4dfd8] rounded-md">
                {SUPPORT_TYPE_LABELS[t] ?? t}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {(partner.programme_url || partner.website || partner.contact_url) && (
              <a
                href={partner.programme_url ?? partner.contact_url ?? partner.website ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-coral hover:text-[#d45a30] transition-colors"
              >
                Learn more <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <button
              onClick={onToggle}
              className="inline-flex items-center gap-1 text-xs font-semibold text-mid hover:text-charcoal transition-colors"
            >
              {expanded ? <><ChevronUp className="h-3.5 w-3.5" />Less</> : <><ChevronDown className="h-3.5 w-3.5" />More</>}
            </button>
          </div>
        </div>

      </div>{/* end p-5 */}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

const SUPPORT_FILTER_OPTIONS = [
  { id: 'all',            label: 'All types'      },
  { id: 'cash_grant',     label: 'Cash grant'     },
  { id: 'accelerator',    label: 'Accelerator'    },
  { id: 'in_kind',        label: 'In-kind'        },
  { id: 'tech_product',   label: 'Free tech'      },
  { id: 'matched_giving', label: 'Matched giving' },
  { id: 'volunteering',   label: 'Volunteering'   },
  { id: 'pro_bono',       label: 'Pro bono'       },
  { id: 'sponsorship',    label: 'Sponsorship'    },
]

export default function CorporatePartnersPage() {
  const [org, setOrg]               = useState<Organisation | null>(null)
  const [partners, setPartners]     = useState<CorporatePartner[]>([])
  const [allResults, setAllResults] = useState<CorporateMatchResult[]>([])
  const [loading, setLoading]       = useState(true)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const [searchQuery, setSearchQuery]     = useState('')
  const [supportFilter, setSupportFilter] = useState('all')
  const [profileMode, setProfileMode]     = useState(true)
  const [filtersOpen, setFiltersOpen]     = useState(false)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [orgData, { data: partnerData }] = await Promise.all([
        getOrganisationByOwner(user.id),
        supabase
          .from('corporate_partners')
          .select('*')
          .eq('is_active', true)
          .order('company_name'),
      ])

      const fetchedOrg = orgData ?? null
      const fetchedPartners = (partnerData ?? []) as CorporatePartner[]

      setOrg(fetchedOrg)
      setPartners(fetchedPartners)

      if (fetchedOrg && fetchedPartners.length) {
        setAllResults(computeCorporateMatches(fetchedPartners, fetchedOrg))
      } else {
        setAllResults(
          fetchedPartners.map(p => ({
            partner: p,
            score: 0,
            reason: 'Complete your profile for a personalised match score.',
            matchedSectors: [],
          }))
        )
      }

      setLoading(false)
    }
    load()
  }, [])

  const displayResults = useMemo(() => {
    let results = [...allResults]

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      results = results.filter(r =>
        r.partner.company_name.toLowerCase().includes(q) ||
        r.partner.programme_name?.toLowerCase().includes(q) ||
        r.partner.description?.toLowerCase().includes(q) ||
        r.partner.csr_themes.some(t => t.toLowerCase().includes(q))
      )
    }

    if (supportFilter !== 'all') {
      results = results.filter(r => r.partner.support_types.includes(supportFilter))
    }

    if (profileMode && org) {
      results.sort((a, b) => b.score - a.score)
    } else {
      results.sort((a, b) => a.partner.company_name.localeCompare(b.partner.company_name))
    }

    return results
  }, [allResults, searchQuery, supportFilter, profileMode, org])

  const showScore = profileMode && !!org

  const activeSupportTypes = useMemo(() => {
    const types = new Set(partners.flatMap(p => p.support_types))
    return SUPPORT_FILTER_OPTIONS.filter(o => o.id === 'all' || types.has(o.id))
  }, [partners])

  function toggleExpanded(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div>
      <div className="mb-2">
        <h2 className="font-serif text-5xl font-bold text-charcoal leading-tight">Corporate Partners</h2>
      </div>

      {/* ── Search + filter card ── */}
      <div className="bg-white border border-[#E8E8EC] shadow-warm mb-5 rounded-xl overflow-hidden">
        <div className="p-5">
          <div className="flex gap-3 mb-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-mid pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search companies, programmes, CSR themes…"
                className="w-full pl-9 pr-4 py-2.5 text-sm border border-[#E8E8EC] focus:border-forest focus:outline-none bg-[#FAFAF9] text-charcoal placeholder:text-[#9ca3af] rounded-lg"
              />
            </div>
            <button
              onClick={() => setFiltersOpen(v => !v)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border transition-colors rounded-lg ${
                filtersOpen
                  ? 'bg-forest text-white border-forest'
                  : 'bg-white text-mid border-[#E8E8EC] hover:border-forest hover:text-forest'
              }`}
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filters
            </button>
          </div>

          {/* Profile toggle */}
          <div className="flex items-center gap-2.5">
            <button
              role="switch"
              aria-checked={profileMode}
              onClick={() => setProfileMode(v => !v)}
              className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center transition-colors rounded-full ${
                profileMode && org ? 'bg-forest' : 'bg-[#D1D5DB]'
              }`}
              disabled={!org}
            >
              <span className={`inline-block h-3.5 w-3.5 bg-white shadow transform transition-transform rounded-full ${
                profileMode && org ? 'translate-x-4' : 'translate-x-1'
              }`} />
            </button>
            <div className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-mid" />
              <span className="text-xs font-semibold text-charcoal">Match to my profile</span>
              {org ? (
                profileMode && (
                  <span className="flex items-center gap-0.5 text-[10px] text-forest font-semibold">
                    <CheckCircle2 className="h-3 w-3" />
                    {org.name}
                  </span>
                )
              ) : (
                <a href="/dashboard/profile" className="text-[10px] text-coral font-semibold hover:underline">
                  Complete your profile to enable
                </a>
              )}
            </div>
          </div>

          {filtersOpen && (
            <div className="mt-4 border-t border-[#F0EDE8] pt-4">
              <div className="flex items-start gap-3 px-4 py-3 bg-[#faf7f2] border border-[#e8ddd0] rounded-xl">
                <Building2 className="h-4 w-4 text-gold flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-charcoal">How to approach corporate partnerships</p>
                  <p className="text-xs text-mid mt-0.5 leading-relaxed">
                    Lead with shared values, not a funding ask. Research their CSR priorities, connect on LinkedIn, and build a relationship before pitching. Think about what you can offer them too.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Support type filter tabs */}
        <div className="border-t border-[#E8E8EC]">
          <div className="flex overflow-x-auto px-5">
            {activeSupportTypes.map(opt => (
              <button
                key={opt.id}
                onClick={() => setSupportFilter(opt.id)}
                className={`flex-shrink-0 px-4 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors ${
                  supportFilter === opt.id
                    ? 'border-coral text-coral'
                    : 'border-transparent text-mid hover:text-charcoal'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Results ── */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="h-8 w-8 animate-spin border-2 border-forest border-t-transparent rounded-full" />
        </div>
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-mid">
              <span className="font-serif text-3xl font-bold text-charcoal">{displayResults.length}</span>
              <span className="text-base ml-2">
                {showScore ? 'partners ranked for your mission' : 'corporate partners'}
              </span>
            </p>
            {expandedIds.size > 0 && (
              <button
                onClick={() => setExpandedIds(new Set())}
                className="text-xs text-mid hover:text-charcoal font-semibold"
              >
                Collapse all
              </button>
            )}
          </div>

          {displayResults.length === 0 ? (
            <div className="text-center py-20 text-mid bg-white border border-[#E8E8EC] rounded-xl">
              <Building2 className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-semibold text-charcoal mb-1">No partners found</p>
              <p className="text-xs text-mid">Try adjusting your search or filters.</p>
              <button
                onClick={() => { setSearchQuery(''); setSupportFilter('all') }}
                className="mt-3 text-xs text-forest font-semibold hover:underline"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {displayResults.map(r => (
                <PartnerCard
                  key={r.partner.id}
                  result={r}
                  showScore={showScore}
                  expanded={expandedIds.has(r.partner.id)}
                  onToggle={() => toggleExpanded(r.partner.id)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
