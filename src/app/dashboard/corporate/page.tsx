'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  Search, Building2, ExternalLink, MapPin, Activity,
  ChevronDown, ChevronUp,
  Users, Globe, Phone, Calendar, Tag, Bookmark,
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

const SUPPORT_TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  cash_grant:     { bg: 'rgba(232,160,48,0.12)',   text: '#92650a', border: 'rgba(232,160,48,0.35)'   },
  in_kind:        { bg: 'rgba(220,80,60,0.10)',    text: '#b94030', border: 'rgba(220,80,60,0.30)'    },
  volunteering:   { bg: 'rgba(59,130,246,0.10)',   text: '#1d4ed8', border: 'rgba(59,130,246,0.25)'   },
  pro_bono:       { bg: 'rgba(107,114,128,0.10)',  text: '#374151', border: 'rgba(107,114,128,0.25)'  },
  tech_product:   { bg: 'rgba(139,92,246,0.10)',   text: '#5b21b6', border: 'rgba(139,92,246,0.25)'   },
  matched_giving: { bg: 'rgba(31,92,82,0.10)',     text: '#1f5c52', border: 'rgba(31,92,82,0.25)'     },
  sponsorship:    { bg: 'rgba(232,160,48,0.10)',   text: '#92650a', border: 'rgba(232,160,48,0.25)'   },
  accelerator:    { bg: 'rgba(45,138,122,0.10)',   text: '#2d8a7a', border: 'rgba(45,138,122,0.25)'   },
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
  result, showScore, expanded, onToggle, isSaved, onSave, onUnsave,
}: {
  result: CorporateMatchResult
  showScore: boolean
  expanded: boolean
  onToggle: () => void
  isSaved: boolean
  onSave: () => void
  onUnsave: () => void
}) {
  const { partner, score, reason } = result
  const band = matchBand(score)
  const amountStr = formatAmount(partner.amount_min, partner.amount_max)
  const budgetStr = formatBudget(partner.annual_investment_estimate)

  return (
    <div className={`bg-white border transition-all rounded-xl overflow-hidden ${
      expanded ? 'border-forest/50 shadow-md' : 'border-[#E8E8EC] hover:border-[#c8d5c2] hover:shadow-sm'
    }`}>

      {/* ── Main body: logo / content / actions ── */}
      <div className="flex">

        {/* Logo — left column */}
        <div className="p-5 pr-0 flex-shrink-0">
          <div className="w-14 h-14 bg-forest flex items-center justify-center text-white font-bold text-xl select-none rounded-xl">
            {partner.company_name[0]?.toUpperCase() ?? '?'}
          </div>
        </div>

        {/* Centre: tags, title, description, stats */}
        <div className="flex-1 min-w-0 p-5">

          {/* CSR theme tags */}
          {partner.csr_themes.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {(expanded ? partner.csr_themes : partner.csr_themes.slice(0, 5)).map(t => (
                <span key={t} className="text-[10px] font-semibold px-2.5 py-0.5 uppercase tracking-wide rounded-full"
                  style={{ background: 'rgba(45,138,122,0.13)', color: '#1a5c50', border: '1px solid rgba(45,138,122,0.35)' }}>
                  {t}
                </span>
              ))}
              {!expanded && partner.csr_themes.length > 5 && (
                <span className="text-[10px] text-mid self-center">+{partner.csr_themes.length - 5}</span>
              )}
            </div>
          )}

          {/* Title — serif bold, matching grant card */}
          <h3 className="font-serif text-xl font-bold text-charcoal leading-snug mb-0.5">
            {partner.company_name}{partner.programme_name ? ` — ${partner.programme_name}` : ''}
          </h3>

          {/* Description */}
          {partner.description && (
            <p className={`text-sm text-mid leading-relaxed mt-1.5 mb-3 ${expanded ? '' : 'line-clamp-2'}`}>
              {partner.description}
            </p>
          )}

          {/* Stats row — uppercase labels + values, matching grant card */}
          <div className="flex flex-wrap gap-x-6 gap-y-2 items-end">
            {amountStr && (
              <div>
                <p className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider mb-0.5">Amount</p>
                <p className="text-sm font-bold" style={{ color: '#008080' }}>{amountStr}</p>
              </div>
            )}
            {partner.application_route && (
              <div>
                <p className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider mb-0.5">Applications</p>
                <p className="text-sm font-semibold text-charcoal">{APPLICATION_ROUTE_LABELS[partner.application_route] ?? partner.application_route}</p>
              </div>
            )}
            {partner.geographic_focus.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider mb-0.5">Location</p>
                <p className="text-sm font-semibold text-charcoal">
                  {partner.geographic_focus.slice(0, 2).join(', ')}
                  {partner.geographic_focus.length > 2 && ` +${partner.geographic_focus.length - 2}`}
                </p>
              </div>
            )}
            {budgetStr && (
              <div>
                <p className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider mb-0.5">Annual budget</p>
                <p className="text-sm font-semibold text-charcoal">{budgetStr}</p>
              </div>
            )}
            {/* Support type pills inline with stats */}
            {partner.support_types.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider mb-0.5">Type</p>
                <div className="flex flex-wrap gap-1">
                  {partner.support_types.map(t => {
                    const c = SUPPORT_TYPE_COLORS[t] ?? { bg: 'rgba(107,114,128,0.08)', text: '#374151', border: 'rgba(107,114,128,0.20)' }
                    return (
                      <span key={t} className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                        style={{ backgroundColor: c.bg, color: c.text, borderColor: c.border }}>
                        {SUPPORT_TYPE_LABELS[t] ?? t}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex flex-col p-5 pl-3 flex-shrink-0 w-[130px] items-end gap-3">
          {(partner.programme_url || partner.website || partner.contact_url) && (
            <a
              href={partner.programme_url ?? partner.contact_url ?? partner.website ?? '#'}
              target="_blank" rel="noopener noreferrer"
              className="text-[11px] font-bold uppercase tracking-widest transition-colors hover:opacity-70"
              style={{ color: '#FF7043' }}
            >
              Visit website →
            </a>
          )}
          <button
            onClick={() => isSaved ? onUnsave() : onSave()}
            className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold border transition-colors ${
              isSaved
                ? 'bg-[#FF7043]/10 text-[#FF7043] border-[#FF7043]/30'
                : 'border-[#E8E8EC] text-gray-500 hover:border-[#FF7043] hover:text-[#FF7043]'
            }`}
            style={{ borderRadius: 9999 }}
          >
            <Bookmark className="w-3.5 h-3.5" fill={isSaved ? 'currentColor' : 'none'} />
            {isSaved ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>

      {/* ── Match Insight — full width, teal left border, exact grant card style ── */}
      {showScore && score > 0 && (
        <div className="flex items-center gap-4 px-6 py-4 border-t border-[#E8E8EC]"
          style={{ borderLeft: '3px solid #008080' }}>
          <Activity className="w-4 h-4 flex-shrink-0" style={{ color: '#26A69A' }} />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: '#26A69A' }}>Match Insight</p>
            <p className="text-sm leading-relaxed text-charcoal">{reason}</p>
          </div>
          {/* Circular score — exact grant card SVG */}
          <div className="flex-shrink-0 flex flex-col items-center gap-0.5 ml-2">
            <svg width="68" height="68" viewBox="0 0 68 68">
              <circle cx="34" cy="34" r="27" fill="none" stroke="#E8E8EC" strokeWidth="5" />
              <circle cx="34" cy="34" r="27" fill="none" stroke="#008080" strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={`${(score / 100) * 169.6} 169.6`}
                transform="rotate(-90 34 34)" />
              <text x="34" y="31" textAnchor="middle" dominantBaseline="middle"
                style={{ fontSize: '13px', fontWeight: '700', fill: '#008080', fontFamily: 'inherit' }}>
                {score}%
              </text>
              <text x="34" y="46" textAnchor="middle"
                style={{ fontSize: '8px', fill: '#26A69A', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: '600' }}>
                MATCH
              </text>
            </svg>
          </div>
        </div>
      )}

      {/* ── Partner Details toggle — exact grant card Funder Intelligence style ── */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-center gap-1.5 py-2.5 border-t border-[#E8E8EC] text-[11px] font-bold uppercase tracking-widest transition-colors hover:bg-[#F5F5F5]"
        style={{ color: '#6E6E80' }}
      >
        <ChevronDown className="w-3.5 h-3.5 transition-transform" style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }} />
        {expanded ? 'Show less' : 'Partner Details'}
      </button>

      {/* ── Expanded panel ── */}
      {expanded && (
        <div className="px-6 pt-4 pb-5 border-t border-[#E8E8EC]" style={{ background: '#f7faf8' }}>
          <div className="grid grid-cols-3 gap-x-6 gap-y-4 mb-4">

            {partner.example_recipients && partner.example_recipients.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Users className="h-3.5 w-3.5 text-sage" />
                  <p className="text-[9px] font-bold uppercase tracking-widest text-mid">Previous recipients</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {partner.example_recipients.map((r: string) => (
                    <span key={r} className="text-xs px-2.5 py-1 bg-white text-charcoal border border-[#dde8e5] rounded-lg">{r}</span>
                  ))}
                </div>
              </div>
            )}

            {partner.impact_sectors && partner.impact_sectors.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Tag className="h-3.5 w-3.5 text-sage" />
                  <p className="text-[9px] font-bold uppercase tracking-widest text-mid">Focus areas</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {partner.impact_sectors.map((s: string) => (
                    <span key={s} className="text-xs px-2.5 py-1 bg-white text-charcoal border border-[#dde8e5] rounded-lg capitalize">{s}</span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-3">
              {(partner.contact_role || partner.contact_url || partner.website) && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Phone className="h-3.5 w-3.5 text-sage" />
                    <p className="text-[9px] font-bold uppercase tracking-widest text-mid">Contact</p>
                  </div>
                  {partner.contact_role && <p className="text-xs font-semibold text-charcoal mb-1">{partner.contact_role}</p>}
                  {(partner.contact_url || partner.website) && (
                    <a href={partner.contact_url ?? partner.website ?? '#'} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-forest hover:text-sage flex items-center gap-1 font-medium">
                      <ExternalLink className="h-3 w-3" />{partner.contact_url ? 'Contact page' : 'Website'}
                    </a>
                  )}
                </div>
              )}
              {partner.geographic_focus.length > 2 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <Globe className="h-3.5 w-3.5 text-sage" />
                    <p className="text-[9px] font-bold uppercase tracking-widest text-mid">All locations</p>
                  </div>
                  <p className="text-xs text-charcoal">{partner.geographic_focus.join(', ')}</p>
                </div>
              )}
            </div>
          </div>

          {/* How to approach */}
          <div className="border-l-4 border-forest bg-forest/[0.06] rounded-r-lg px-4 py-3 flex items-start gap-2">
            <Calendar className="h-3.5 w-3.5 text-forest flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-forest/70 mb-1">How to approach</p>
              <p className="text-xs text-forest/80 leading-relaxed">
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
        </div>
      )}

    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────


export default function CorporatePartnersPage() {
  const [org, setOrg]               = useState<Organisation | null>(null)
  const [partners, setPartners]     = useState<CorporatePartner[]>([])
  const [allResults, setAllResults] = useState<CorporateMatchResult[]>([])
  const [loading, setLoading]       = useState(true)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const [searchQuery, setSearchQuery] = useState('')
  const [profileMode, setProfileMode] = useState(true)
  const [activeView, setActiveView] = useState<'matches' | 'saved'>('matches')
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())

  // Load saved partners from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('savedCorporatePartners')
      if (stored) setSavedIds(new Set(JSON.parse(stored) as string[]))
    } catch { /* ignore */ }
  }, [])

  // Persist saved partners to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('savedCorporatePartners', JSON.stringify(Array.from(savedIds)))
    } catch { /* ignore */ }
  }, [savedIds])

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

    if (profileMode && org) {
      results.sort((a, b) => b.score - a.score)
    } else {
      results.sort((a, b) => a.partner.company_name.localeCompare(b.partner.company_name))
    }

    return results
  }, [allResults, searchQuery, profileMode, org])

  const showScore = profileMode && !!org

  function toggleExpanded(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function handleSave(id: string) {
    setSavedIds(prev => { const next = new Set(prev); next.add(id); return next })
  }

  function handleUnsave(id: string) {
    setSavedIds(prev => { const next = new Set(prev); next.delete(id); return next })
  }

  return (
    <div>
      <div className="mb-3">
        <h2 className="font-serif text-5xl font-bold text-charcoal leading-tight">Corporate Partners</h2>
      </div>

      {/* ── Subtitle row: text left, tabs right (matching Find Funding) ── */}
      <div className="flex items-center justify-between mb-3">
        {/* Left: matched-for subtitle */}
        <div className="flex items-center gap-2 text-sm text-mid">
          {activeView === 'matches' && org && (
            <>
              <span className="w-2 h-2 flex-shrink-0 rounded-full" style={{ backgroundColor: '#008080' }} />
              Matched for <strong className="text-charcoal ml-1">{org.name}</strong>
              {org.primary_location && <span className="text-mid ml-1">· {org.primary_location}</span>}
            </>
          )}
        </div>
        {/* Right: My Matches / Saved pill tabs */}
        <div className="flex items-center bg-white border border-warm/60 shadow-sm overflow-hidden flex-shrink-0" style={{ borderRadius: 9999 }}>
          {(['matches', 'saved'] as const).map((v, i) => (
            <div key={v} className="flex items-center">
              {i > 0 && <div className="w-px h-5 bg-warm/80" />}
              <button
                onClick={() => setActiveView(v)}
                className={`px-5 py-2 text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  activeView === v
                    ? 'text-[#FF7043] border-b-2 border-[#FF7043]'
                    : 'border-b-2 border-transparent text-gray-500 hover:text-charcoal'
                }`}
              >
                {v === 'matches' ? 'My Matches' : 'Saved'}
                {v === 'saved' && savedIds.size > 0 && (
                  <span className="text-xs bg-[#FF7043] text-white px-1.5 py-0.5 ml-1" style={{ borderRadius: 9999 }}>
                    {savedIds.size}
                  </span>
                )}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ── Search bar — only in My Matches view ── */}
      {activeView === 'matches' && (
        <div className="flex gap-3 items-center mb-4">
          <div
            className="flex-1 flex items-center bg-white border border-gray-200 rounded-full h-12 overflow-hidden"
            style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
          >
            <div className="flex items-center flex-1 min-w-0 px-4">
              <Search className="h-4 w-4 text-gray-400 flex-shrink-0 mr-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent outline-none text-sm text-charcoal placeholder-gray-400 min-w-0"
                placeholder="Search companies, programmes, CSR themes…"
              />
            </div>
            <div className="w-px h-6 bg-gray-200 flex-shrink-0" />
            <button
              onClick={() => setProfileMode(v => !v)}
              disabled={!org}
              className="flex items-center gap-2 px-4 h-full flex-shrink-0 whitespace-nowrap"
              title={org ? (profileMode ? 'Turn off profile matching' : 'Match to your profile') : 'Complete your profile to enable'}
            >
              <span
                className="relative flex-shrink-0"
                style={{
                  width: 40, height: 22,
                  backgroundColor: profileMode && org ? '#26A69A' : '#d1d5db',
                  borderRadius: 9999, display: 'inline-flex', alignItems: 'center',
                  transition: 'background-color 0.2s',
                }}
              >
                <span
                  className="absolute bg-white transition-transform duration-200"
                  style={{ width: 16, height: 16, borderRadius: 9999, top: 3, left: 3,
                    transform: profileMode && org ? 'translateX(18px)' : 'translateX(0)' }}
                />
              </span>
              <span className={`text-[11px] font-semibold uppercase tracking-wider ${profileMode && org ? 'text-gray-600' : 'text-gray-400'}`}>
                Profile
              </span>
            </button>
          </div>
          <button
            className="h-12 px-6 text-white text-sm font-semibold flex-shrink-0 flex items-center gap-2 rounded-full"
            style={{ backgroundColor: '#008080' }}
          >
            <Search size={14} strokeWidth={2} /> Search
          </button>
        </div>
      )}

      {/* How to approach corporate partners */}
      <div className="bg-white border border-[#E8E8EC] rounded-xl mb-5 flex overflow-hidden">
        <div className="w-1 flex-shrink-0 bg-forest" />
        <div className="px-5 py-4">
          <p className="text-xs font-bold uppercase tracking-widest text-forest mb-2">Corporate Partners — how this differs from Find Funding</p>
          <p className="text-sm text-mid leading-relaxed mb-2">
            <strong className="text-charcoal">Find Funding</strong> lists grants and programmes from trusts, foundations, and public bodies — organisations that exist to fund good causes. <strong className="text-charcoal">Corporate Partners</strong> is different: these are companies with CSR budgets, employee giving programmes, or community funds. The relationship is more like a partnership than a grant application.
          </p>
          <p className="text-sm text-mid leading-relaxed">
            Lead with shared values, not a funding ask. Research their CSR priorities thoroughly and look for genuine alignment with your mission. A warm introduction via LinkedIn or mutual contacts is far more effective than a cold approach. Think about what you can offer them — impact stories, employee volunteering opportunities, co-branding — not just what you need from them. Build the relationship before the pitch.
          </p>
        </div>
      </div>

      {/* ── Results ── */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="h-8 w-8 animate-spin border-2 border-forest border-t-transparent rounded-full" />
        </div>
      ) : activeView === 'saved' ? (
        (() => {
          const savedResults = allResults.filter(r => savedIds.has(r.partner.id))
          return savedResults.length === 0 ? (
            <div className="text-center py-20 text-mid bg-white border border-[#E8E8EC] rounded-xl">
              <Bookmark className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p className="text-sm font-semibold text-charcoal mb-1">No saved partners yet</p>
              <p className="text-xs text-mid">Click Save on any partner card to add it here.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {savedResults.map(r => (
                <PartnerCard
                  key={r.partner.id}
                  result={r}
                  showScore={showScore}
                  expanded={expandedIds.has(r.partner.id)}
                  onToggle={() => toggleExpanded(r.partner.id)}
                  isSaved={true}
                  onSave={() => handleSave(r.partner.id)}
                  onUnsave={() => handleUnsave(r.partner.id)}
                />
              ))}
            </div>
          )
        })()
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
                onClick={() => setSearchQuery('')}
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
                  isSaved={savedIds.has(r.partner.id)}
                  onSave={() => handleSave(r.partner.id)}
                  onUnsave={() => handleUnsave(r.partner.id)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
