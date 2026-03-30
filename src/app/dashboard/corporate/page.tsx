'use client'

import { useState, useEffect } from 'react'
import { Building2, ExternalLink, MapPin, Handshake, ChevronRight } from 'lucide-react'
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

function matchBand(score: number): { label: string; colour: string } {
  if (score >= 70) return { label: 'Strong match',    colour: '#008080' }
  if (score >= 50) return { label: 'Good match',      colour: '#2d8a7a' }
  if (score >= 35) return { label: 'Possible match',  colour: '#e8a030' }
  return             { label: 'Broad match',          colour: '#9ca3af' }
}

function formatAmount(min: number | null, max: number | null): string | null {
  if (!min && !max) return null
  if (min && max && min !== max) return `£${(min / 1000).toFixed(0)}k–£${(max / 1000).toFixed(0)}k`
  if (max) return `Up to £${(max / 1000).toFixed(0)}k`
  if (min) return `From £${(min / 1000).toFixed(0)}k`
  return null
}

// ── Partner card ──────────────────────────────────────────────────────────────

function PartnerCard({ result }: { result: CorporateMatchResult }) {
  const { partner, score, reason } = result
  const band = matchBand(score)
  const amountStr = formatAmount(partner.amount_min, partner.amount_max)

  return (
    <div className="bg-white border border-[#E8E8EC] shadow-sm hover:shadow-md transition-shadow p-5">
      {/* Header row */}
      <div className="flex items-start gap-4 mb-4">
        <div
          className="flex-shrink-0 w-11 h-11 flex items-center justify-center bg-[#f5f2ed] border border-[#E8E8EC] text-charcoal font-bold text-base"
          aria-hidden
        >
          {partner.company_name[0]?.toUpperCase() ?? '?'}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <h3 className="font-semibold text-charcoal text-base leading-snug">
              {partner.company_name}
            </h3>
            {/* Match badge */}
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 uppercase tracking-wide border whitespace-nowrap"
              style={{ color: band.colour, borderColor: band.colour + '40', backgroundColor: band.colour + '12' }}
            >
              {band.label}
            </span>
          </div>
          {partner.industry_sector && (
            <p className="text-[11px] text-mid">{partner.industry_sector}</p>
          )}
        </div>

        {/* Match score circle */}
        <div className="flex-shrink-0 text-right">
          <span className="text-2xl font-bold" style={{ color: band.colour }}>{score}</span>
          <span className="text-xs text-mid ml-0.5">/ 100</span>
        </div>
      </div>

      {/* Programme name */}
      {partner.programme_name && (
        <p className="text-sm font-medium text-charcoal mb-1">{partner.programme_name}</p>
      )}

      {/* Description */}
      {partner.description && (
        <p className="text-sm text-mid leading-relaxed mb-3">
          {partner.description.length > 220
            ? `${partner.description.slice(0, 220).trimEnd()}…`
            : partner.description}
        </p>
      )}

      {/* Match reason */}
      <div className="flex items-start gap-2 mb-3 px-3 py-2.5 bg-[#f9f7f4] border-l-2 border-[#c8d5c2]">
        <Handshake className="h-3.5 w-3.5 text-forest flex-shrink-0 mt-0.5" />
        <p className="text-xs text-mid leading-relaxed">{reason}</p>
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap gap-3 text-xs text-mid mb-4">
        {amountStr && (
          <span className="flex items-center gap-1">
            <span className="font-semibold text-charcoal">{amountStr}</span>
          </span>
        )}
        {partner.geographic_focus.length > 0 && (
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {partner.geographic_focus.slice(0, 2).join(', ')}
            {partner.geographic_focus.length > 2 && ' +more'}
          </span>
        )}
        {partner.application_route && (
          <span className="flex items-center gap-1">
            {APPLICATION_ROUTE_LABELS[partner.application_route] ?? partner.application_route}
          </span>
        )}
      </div>

      {/* Support type pills */}
      {partner.support_types.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {partner.support_types.map(t => (
            <span
              key={t}
              className="text-[10px] font-semibold px-2 py-0.5 bg-[#f0ede8] text-charcoal border border-[#e8e3dd]"
            >
              {SUPPORT_TYPE_LABELS[t] ?? t}
            </span>
          ))}
        </div>
      )}

      {/* CTA */}
      {(partner.programme_url || partner.website || partner.contact_url) && (
        <a
          href={partner.programme_url ?? partner.contact_url ?? partner.website ?? '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-forest hover:text-sage transition-colors"
        >
          Learn more
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CorporatePartnersPage() {
  const [org, setOrg]                 = useState<Organisation | null>(null)
  const [partners, setPartners]       = useState<CorporatePartner[]>([])
  const [results, setResults]         = useState<CorporateMatchResult[]>([])
  const [loading, setLoading]         = useState(true)
  const [supportFilter, setSupportFilter] = useState<string>('all')

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
        setResults(computeCorporateMatches(fetchedPartners, fetchedOrg))
      } else {
        // No org profile — show all partners unranked
        setResults(fetchedPartners.map(p => ({ partner: p, score: 0, reason: 'Complete your profile for a personalised match score.', matchedSectors: [] })))
      }

      setLoading(false)
    }
    load()
  }, [])

  // Collect all support types for filter pills
  const allSupportTypes = Array.from(
    new Set(partners.flatMap(p => p.support_types))
  ).sort()

  const filteredResults = supportFilter === 'all'
    ? results
    : results.filter(r => r.partner.support_types.includes(supportFilter))

  return (
    <div>
      {/* Heading */}
      <div className="mb-6">
        <h2 className="font-serif text-5xl font-bold text-charcoal leading-tight">Corporate Partners</h2>
        <p className="mt-2 text-sm text-mid max-w-2xl">
          Companies offering grants, in-kind support and partnership opportunities for charities and social enterprises.
          These aren&apos;t grant applications — they&apos;re relationship-first partnerships. Approach them commercially.
        </p>
      </div>

      {/* Guidance banner */}
      <div className="mb-6 border border-[#e8ddd0] bg-[#faf7f2] px-4 py-3 flex items-start gap-3">
        <Building2 className="h-4 w-4 text-[#e8a030] flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-charcoal">How to approach corporate partnerships</p>
          <p className="text-xs text-mid mt-0.5">
            Lead with shared values, not a funding ask. Research their CSR priorities, connect on LinkedIn, and build a relationship before pitching. The best corporate partnerships are win-win — think about what you can offer them too.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin border-2 border-forest border-t-transparent" />
        </div>
      ) : (
        <>
          {/* Support type filter */}
          {allSupportTypes.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-5">
              {['all', ...allSupportTypes].map(type => (
                <button
                  key={type}
                  onClick={() => setSupportFilter(type)}
                  className={`text-xs font-semibold px-3 py-1.5 border transition-colors ${
                    supportFilter === type
                      ? 'bg-forest text-white border-forest'
                      : 'bg-white text-mid border-[#E8E8EC] hover:border-forest hover:text-forest'
                  }`}
                >
                  {type === 'all' ? 'All types' : (SUPPORT_TYPE_LABELS[type] ?? type)}
                </button>
              ))}
            </div>
          )}

          {/* Results count */}
          <p className="text-sm text-mid mb-4">
            <span className="font-serif text-3xl font-bold text-charcoal">{filteredResults.length}</span>
            <span className="text-base ml-2">
              {org ? 'partners ranked for your mission' : 'corporate partners'}
            </span>
          </p>

          {filteredResults.length === 0 ? (
            <div className="text-center py-16 text-mid">
              <Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No partners match this filter.</p>
              <button
                onClick={() => setSupportFilter('all')}
                className="mt-2 text-xs text-forest underline"
              >
                Show all
              </button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {filteredResults.map(r => (
                <PartnerCard key={r.partner.id} result={r} />
              ))}
            </div>
          )}

          {!org && (
            <div className="mt-6 border border-dashed border-[#c8d5c2] px-4 py-4 text-center">
              <p className="text-sm text-mid">
                <a href="/dashboard/profile" className="text-forest font-semibold hover:underline">
                  Complete your profile <ChevronRight className="inline h-3 w-3" />
                </a>
                {' '}to get a personalised match score for each partner.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
