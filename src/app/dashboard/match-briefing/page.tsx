'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getPipelineItems } from '@/lib/pipeline'
import { getOrganisationByOwner } from '@/lib/organisations'
import { formatRange, formatDeadline, cn } from '@/lib/utils'
import type { PipelineItem, Organisation, FunderType } from '@/types'
import { brand } from '@/config/brand'

// ── Briefing data types ──────────────────────────────────────────────────────

type MatchLevel = 'strong' | 'partial' | 'gap'

interface Criterion {
  criterion: string
  match: MatchLevel
  profileEvidence: string
  suggestion: string
}

interface LangItem {
  phrase: string
  frequency: string
  note: string
}

interface WatchOut {
  type: string
  text: string
}

// ── Generate criteria from org profile ──────────────────────────────────────

function generateCriteria(item: PipelineItem, org: Organisation | null): Criterion[] {
  const hasMission      = !!org?.mission
  const hasBenefic      = (org?.beneficiaries?.length ?? 0) > 0
  const hasLocation     = !!org?.primary_location
  const hasSectors      = (org?.themes?.length ?? 0) > 0
  const hasIncome       = !!org?.annual_income_band
  const hasPeople       = (org?.people_per_year ?? 0) > 0

  return [
    {
      criterion: 'Clear mission and social purpose',
      match: hasMission ? 'strong' : 'partial',
      profileEvidence: hasMission
        ? `"${org!.mission!.slice(0, 120)}${org!.mission!.length > 120 ? '…' : ''}"`
        : 'No mission statement on your profile yet.',
      suggestion: hasMission
        ? 'Open your application with your mission in one clear sentence. Be specific about who you serve and how — avoid broad phrases like "supporting communities".'
        : 'Add a mission statement to your profile. It\'s the first thing funders read and shapes every other answer you give.',
    },
    {
      criterion: 'Evidence of need and community impact',
      match: hasBenefic ? (hasPeople ? 'strong' : 'partial') : 'partial',
      profileEvidence: hasBenefic
        ? `You work with: ${org!.beneficiaries!.join(', ')}.${hasPeople ? ` Roughly ${org!.people_per_year!.toLocaleString()} people per year.` : ''}`
        : 'Your profile doesn\'t specify beneficiary groups yet.',
      suggestion: hasPeople
        ? 'Lead with your headline number — people served, % improvement, or a concrete outcome. Add a brief case study to bring numbers to life.'
        : 'Update your profile with the number of people you serve. Specificity wins grants — funders need evidence of scale and impact.',
    },
    {
      criterion: 'Geographic focus and local relevance',
      match: hasLocation ? 'strong' : 'partial',
      profileEvidence: hasLocation
        ? `Primary location: ${org!.primary_location}.`
        : 'No location set in your profile.',
      suggestion: hasLocation
        ? `Reference ${org!.primary_location} explicitly — local and regional funders want to see your connection to place. Include area deprivation data if relevant.`
        : 'Add your location to your profile. Many funders prioritise specific geographies and your application will be stronger for it.',
    },
    {
      criterion: 'Financial health and realistic budget',
      match: hasIncome ? 'partial' : 'gap',
      profileEvidence: hasIncome
        ? `Annual income band: ${org!.annual_income_band}.${item.amount_max ? ` Requesting: ${formatRange(item.amount_min, item.amount_max)}.` : ''}`
        : 'Income information not on your profile.',
      suggestion: hasIncome
        ? 'Be transparent about your financial position. Show how this grant fits alongside other income — funders want to fund projects, not plug deficits. Include a realistic breakdown of how funds will be spent.'
        : 'Add your income band to your profile. Funders assess financial sustainability carefully — a mismatch between your size and the grant amount raises questions.',
    },
    {
      criterion: 'Sector expertise and track record',
      match: hasSectors ? 'strong' : 'partial',
      profileEvidence: hasSectors
        ? `Your sectors: ${org!.themes!.join(', ')}.`
        : 'No impact sectors listed in your profile.',
      suggestion: hasSectors
        ? 'Highlight specific achievements — not just activities, but outcomes. What changed because of your work? Use measurable results where possible, and name any partnerships or endorsements.'
        : 'Add your impact sectors to your profile. Funders assess track record carefully — make it easy for them to see your depth of experience.',
    },
  ]
}

// ── Funder language by type ──────────────────────────────────────────────────

const FUNDER_LANGUAGE: Partial<Record<FunderType, LangItem[]>> & { default: LangItem[] } = {
  trust_foundation: [
    { phrase: 'theory of change',    frequency: 'Very common', note: 'Map the chain from activities to outcomes. Keep it simple — funders want logic, not jargon. Diagram or prose both work.' },
    { phrase: 'co-production',       frequency: 'Common',      note: 'If the people you serve help shape your work, say so explicitly. This is increasingly valued across the sector.' },
    { phrase: 'learning and adaptation', frequency: 'Common',  note: 'Show you reflect and improve. Mention one thing you\'ve changed based on participant or community feedback.' },
    { phrase: 'lived experience',    frequency: 'Frequent',    note: 'If team members, trustees, or facilitators have personal experience of the issues you address, include this.' },
  ],
  government: [
    { phrase: 'value for money',     frequency: 'Very common', note: 'Show cost per beneficiary or outcome. Government funders need to justify every pound to their own auditors.' },
    { phrase: 'measurable outcomes', frequency: 'Very common', note: 'Use SMART targets. Vague outcomes like "improved wellbeing" need specific measures attached.' },
    { phrase: 'partnership working', frequency: 'Frequent',    note: 'Name any statutory partners, referrers, or collaborators. Government funders value joined-up delivery.' },
    { phrase: 'evidence base',       frequency: 'Common',      note: 'Reference research or data that shows the need exists and your approach is grounded in what works.' },
  ],
  lottery: [
    { phrase: 'people and communities', frequency: 'Very common', note: 'Keep language accessible and community-focused. Avoid sector jargon — write as you\'d speak to a neighbour.' },
    { phrase: 'inclusion and diversity', frequency: 'Frequent', note: 'Show who benefits and how you\'re actively reaching underrepresented or excluded groups.' },
    { phrase: 'community involvement',  frequency: 'Common',   note: 'Demonstrate how local people have been involved in shaping the project, not just receiving it.' },
    { phrase: 'reaching more people',   frequency: 'Common',   note: 'Show growth — more beneficiaries, new areas, or deeper impact with existing participants.' },
  ],
  corporate: [
    { phrase: 'shared values',       frequency: 'Common',      note: 'Research the company\'s CSR priorities. Mirror their language without being sycophantic.' },
    { phrase: 'employee engagement', frequency: 'Common',      note: 'Offer opportunities for staff volunteering or involvement where you can.' },
    { phrase: 'social return',       frequency: 'Frequent',    note: 'Quantify your impact in clear, business-friendly terms. Use ratios where possible (e.g. £3 social value per £1 invested).' },
    { phrase: 'reputational benefit', frequency: 'Occasional', note: 'Frame the partnership as mutually beneficial — but keep the focus on your mission, not their brand.' },
  ],
  default: [
    { phrase: 'theory of change',    frequency: 'Common',      note: 'Map activities → outputs → outcomes → impact. Funders want to see you\'ve thought through the logic.' },
    { phrase: 'evidence of need',    frequency: 'Common',      note: 'Back up your problem statement with data or lived experience. Don\'t assume the reader shares your context.' },
    { phrase: 'sustainability',      frequency: 'Frequent',    note: 'Show what happens after the grant ends. Funders increasingly want to fund work that continues.' },
    { phrase: 'community benefit',   frequency: 'Common',      note: 'Be specific about who benefits and how. Avoid broad language — the more specific, the more credible.' },
  ],
}

function getFunderLanguage(funderType: FunderType): LangItem[] {
  return FUNDER_LANGUAGE[funderType] ?? FUNDER_LANGUAGE.default
}

// ── Watch-outs by type ───────────────────────────────────────────────────────

const WATCH_OUTS: Partial<Record<FunderType, WatchOut[]>> & { default: WatchOut[] } = {
  trust_foundation: [
    { type: 'common_rejection', text: 'Many trust funders reject applications that lack a clear theory of change. Map your activities to outcomes before you write a single word.' },
    { type: 'format_note',      text: 'Most application forms have strict word limits. Draft your answers first, then cut to fit. Every sentence should carry evidence or insight.' },
    { type: 'community_tip',    text: 'Funders value honesty about challenges over polished narratives. If something didn\'t work, say so and explain what you learned from it.' },
    { type: 'budget_tip',       text: 'Include realistic overheads. Many trusts will fund core costs and don\'t expect 100% of the budget to go on direct delivery.' },
  ],
  government: [
    { type: 'common_rejection', text: 'Government funders reject applications that don\'t exactly meet eligibility criteria. Read the guidance twice, then check again before you start writing.' },
    { type: 'format_note',      text: 'Government forms often require specific attachments — accounts, policies, safeguarding certificates. Gather these before you begin your application.' },
    { type: 'community_tip',    text: 'Keep language simple and avoid sector jargon. Government assessors read hundreds of applications and value clarity over sophistication.' },
    { type: 'budget_tip',       text: 'Budget headings must match the funder\'s categories exactly. Don\'t lump costs together — break them out clearly and label every line.' },
  ],
  lottery: [
    { type: 'common_rejection', text: 'The National Lottery Community Fund rejects applications that don\'t demonstrate genuine community involvement in the project design, not just delivery.' },
    { type: 'format_note',      text: 'Their online forms auto-save but can time out. Write answers in a document first, then paste in.' },
    { type: 'community_tip',    text: 'Use plain English. The fund is explicitly for communities — match that accessible tone throughout.' },
    { type: 'budget_tip',       text: 'Equipment and capital costs often have separate guidance. Check whether your items are eligible under the specific fund you\'re applying to.' },
  ],
  default: [
    { type: 'common_rejection', text: 'Always re-read the funder\'s criteria against your application before you submit. Misalignment — even small — is the most common reason for rejection.' },
    { type: 'format_note',      text: 'Write your answers in a document before pasting into the online form. Word limits are strict and online forms can time out or lose progress.' },
    { type: 'community_tip',    text: 'Show — don\'t tell. Every claim you make should be supported by evidence, a number, or a concrete example from your work.' },
    { type: 'budget_tip',       text: 'Include a narrative budget — not just figures. Briefly explain each major cost line so assessors understand what they\'re funding.' },
  ],
}

function getWatchOuts(funderType: FunderType): WatchOut[] {
  return WATCH_OUTS[funderType] ?? WATCH_OUTS.default
}

const WATCH_OUT_ICONS: Record<string, string>  = { common_rejection: '⚠️', format_note: '📝', community_tip: '💬', budget_tip: '💷' }
const WATCH_OUT_LABELS: Record<string, string> = { common_rejection: 'Common pitfall', format_note: 'Format note', community_tip: 'Community tip', budget_tip: 'Budget advice' }

// ── Page component ───────────────────────────────────────────────────────────

type Tab = 'criteria' | 'language' | 'watchouts'

export default function MatchBriefingPage() {
  const [org, setOrg]         = useState<Organisation | null>(null)
  const [items, setItems]     = useState<PipelineItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<PipelineItem | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('criteria')

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const organisation = await getOrganisationByOwner(user.id)
      setOrg(organisation)

      if (organisation) {
        const all     = await getPipelineItems(organisation.id)
        const applying = all.filter(i => i.stage === 'applying')
        setItems(applying)
        if (applying.length > 0) setSelected(applying[0])
      }
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-mid">Loading briefings…</p>
      </div>
    )
  }

  const criteria     = selected ? generateCriteria(selected, org) : []
  const strongCount  = criteria.filter(c => c.match === 'strong').length
  const partialCount = criteria.filter(c => c.match === 'partial').length
  const language     = selected ? getFunderLanguage(selected.funder_type) : []
  const watchOuts    = selected ? getWatchOuts(selected.funder_type)    : []

  return (
    <div className="flex h-full min-h-0">

      {/* ── Left panel: applying grants ──────────────────────────────── */}
      <div className="w-64 xl:w-72 flex-shrink-0 border-r border-warm bg-surface-page/30 flex flex-col overflow-hidden">
        <div className="px-5 py-5 border-b border-warm flex-shrink-0">
          <h1 className="font-serif text-lg font-bold text-charcoal">Match Briefing</h1>
          <p className="text-xs text-mid mt-0.5">Applications in progress</p>
        </div>

        {items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <span className="text-3xl mb-3">✏️</span>
            <p className="text-sm font-semibold text-charcoal mb-1">No active applications</p>
            <p className="text-xs text-mid leading-relaxed">
              Move a grant into{' '}
              <span className="font-semibold text-orange-500">Applying</span>{' '}
              in your pipeline to generate a match briefing.
            </p>
            <a href="/dashboard/pipeline" className="mt-4 text-xs font-semibold text-forest underline-offset-2 hover:underline">
              Go to pipeline →
            </a>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {items.map(item => (
              <button
                key={item.id}
                onClick={() => { setSelected(item); setActiveTab('criteria') }}
                className={cn(
                  'w-full text-left rounded-xl p-3.5 border transition-all',
                  selected?.id === item.id
                    ? 'border-forest/30 bg-white shadow-sm'
                    : 'border-warm bg-white/60 hover:bg-white hover:border-forest/20'
                )}
              >
                <p className="text-[10px] text-light font-semibold uppercase tracking-wide mb-0.5 truncate">{item.funder_name}</p>
                <p className="text-sm font-semibold text-charcoal leading-snug line-clamp-2">{item.grant_name}</p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {formatRange(item.amount_min, item.amount_max ?? item.amount_requested) && (
                    <span className="text-[11px] font-semibold text-gold-deep">
                      {formatRange(item.amount_min, item.amount_max ?? item.amount_requested)}
                    </span>
                  )}
                  {item.deadline && (
                    <span className={cn('text-[11px]', item.is_urgent ? 'text-coral-saturated font-semibold' : 'text-mid')}>
                      {item.is_urgent && '⚠ '}{formatDeadline(item.deadline)}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Right panel: briefing sheet ──────────────────────────────── */}
      {selected ? (
        <div className="flex-1 overflow-y-auto bg-[#faf9f7]">
          <div className="max-w-2xl mx-auto px-8 py-8">

            {/* Header */}
            <div className="flex items-start justify-between gap-4 pb-5 border-b-2 border-charcoal mb-5">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-forest/50 mb-1 font-sans">Match Briefing</p>
                <h2 className="font-serif text-xl font-bold text-charcoal leading-snug">{selected.funder_name}</h2>
                <p className="font-serif text-base text-charcoal/80 leading-snug">{selected.grant_name}</p>
                <p className="text-xs text-mid mt-1">
                  {formatRange(selected.amount_min, selected.amount_max ?? selected.amount_requested)}
                  {selected.deadline ? ` · Deadline: ${formatDeadline(selected.deadline)}` : ''}
                </p>
              </div>
              <div className="text-center bg-charcoal rounded-xl px-4 py-3 flex-shrink-0">
                <p className="text-[9px] text-white/50 uppercase tracking-wide">Match</p>
                <p className="font-bold text-2xl text-emerald-400 leading-none">{strongCount}/{criteria.length}</p>
                <p className="text-[9px] text-white/50">criteria strong</p>
              </div>
            </div>

            {/* Briefing banner */}
            <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200/60 rounded-xl px-4 py-3 mb-5 leading-relaxed">
              ✦ This is your match briefing, not your application. Use it to prepare and plan — the actual words should always be yours.
            </div>

            {/* Org summary */}
            {org && (
              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="rounded-xl bg-white border border-warm p-4">
                  <p className="text-[9px] font-bold uppercase tracking-wide text-light mb-2">Your organisation</p>
                  <p className="text-sm font-bold text-charcoal">{org.name}</p>
                  <p className="text-xs text-mid mt-0.5">
                    {org.primary_location ?? 'Location not set'}
                    {org.annual_income_band ? ` · ${org.annual_income_band}` : ''}
                  </p>
                </div>
                <div className="rounded-xl bg-white border border-warm p-4">
                  <p className="text-[9px] font-bold uppercase tracking-wide text-light mb-2">Your focus areas</p>
                  {(org.themes?.length ?? 0) > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {org.themes!.slice(0, 4).map(t => (
                        <span key={t} className="text-[10px] bg-forest/10 text-forest px-2 py-0.5 rounded-full font-medium">{t}</span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-light">No sectors added to profile yet</p>
                  )}
                </div>
              </div>
            )}

            {/* Tabs */}
            <div className="flex gap-0 border-b border-warm mb-5">
              {([
                { id: 'criteria',  label: 'Criteria Alignment' },
                { id: 'language',  label: 'Funder Language' },
                { id: 'watchouts', label: 'Tips & Watch-outs' },
              ] as { id: Tab; label: string }[]).map(t => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={cn(
                    'px-4 py-2.5 text-xs font-semibold border-b-2 -mb-px transition-colors whitespace-nowrap',
                    activeTab === t.id
                      ? 'border-charcoal text-charcoal'
                      : 'border-transparent text-mid hover:text-charcoal'
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── Criteria tab ── */}
            {activeTab === 'criteria' && (
              <div className="space-y-4">
                <p className="text-xs text-mid leading-relaxed">
                  {strongCount} strong {strongCount === 1 ? 'match' : 'matches'}, {partialCount} {partialCount === 1 ? 'area' : 'areas'} that need strengthening.
                </p>
                {criteria.map((c, i) => (
                  <div key={i} className="bg-white rounded-xl border border-warm p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <p className="text-sm font-bold text-charcoal leading-snug">{c.criterion}</p>
                      <span className={cn(
                        'text-[10px] font-semibold rounded px-2 py-0.5 flex-shrink-0 border',
                        c.match === 'strong'  ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30' :
                        c.match === 'partial' ? 'bg-amber-500/10  text-amber-700  border-amber-500/30'  :
                                                'bg-coral-pale    text-coral-deep    border-coral-saturated/30'
                      )}>
                        {c.match === 'strong' ? '● Strong' : c.match === 'partial' ? '◐ Partial' : '○ Gap'}
                      </span>
                    </div>
                    <div className="bg-surface-page/60 rounded-lg px-3 py-2.5 mb-2 border-l-2 border-warm">
                      <p className="text-[9px] font-bold uppercase tracking-wide text-light mb-1">From your profile</p>
                      <p className="text-xs text-mid leading-relaxed">{c.profileEvidence}</p>
                    </div>
                    <div className="bg-amber-50/80 rounded-lg px-3 py-2.5 border-l-2 border-gold-deep/60">
                      <p className="text-[9px] font-bold uppercase tracking-wide text-amber-700/70 mb-1">Recommendation</p>
                      <p className="text-xs text-charcoal leading-relaxed">{c.suggestion}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Language tab ── */}
            {activeTab === 'language' && (
              <div className="space-y-3">
                <p className="text-xs text-mid leading-relaxed mb-4">
                  Key phrases this type of funder uses. Not to copy — but to understand what they value and reflect it naturally in your own words.
                </p>
                {language.map((item, i) => (
                  <div key={i} className="bg-white rounded-xl border border-warm p-4">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <p className="text-sm font-bold text-charcoal italic">&ldquo;{item.phrase}&rdquo;</p>
                      <span className="text-[10px] font-semibold bg-forest/10 text-forest px-2 py-0.5 rounded flex-shrink-0">{item.frequency}</span>
                    </div>
                    <p className="text-xs text-mid leading-relaxed">{item.note}</p>
                  </div>
                ))}
              </div>
            )}

            {/* ── Watch-outs tab ── */}
            {activeTab === 'watchouts' && (
              <div className="space-y-3">
                <p className="text-xs text-mid leading-relaxed mb-4">
                  Practical advice before you start writing.
                </p>
                {watchOuts.map((item, i) => (
                  <div key={i} className="bg-white rounded-xl border border-warm p-4 flex gap-3 items-start">
                    <span className="text-xl flex-shrink-0">{WATCH_OUT_ICONS[item.type] ?? '💡'}</span>
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-wide text-light mb-1">{WATCH_OUT_LABELS[item.type] ?? 'Note'}</p>
                      <p className="text-xs text-charcoal leading-relaxed">{item.text}</p>
                    </div>
                  </div>
                ))}
                <div className="rounded-xl border border-dashed border-warm bg-surface-page/40 p-4 mt-4">
                  <p className="text-[9px] font-bold uppercase tracking-wide text-light mb-1">Help improve this briefing</p>
                  <p className="text-xs text-mid leading-relaxed">
                    Applied to {selected.funder_name} before? Share what worked (or didn&apos;t) — your feedback helps everyone write stronger applications.
                  </p>
                  <a href="/dashboard/feedback" className="inline-block mt-2 text-xs font-semibold text-forest underline-offset-2 hover:underline">
                    Share your experience →
                  </a>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between mt-8 pt-5 border-t border-warm">
              <p className="text-[10px] text-light">Generated from your {brand.name} profile</p>
              <div className="flex gap-2">
                <a
                  href="/dashboard/pipeline"
                  className="text-xs font-semibold text-mid border border-warm rounded-lg px-3 py-2 hover:border-forest/30 transition-colors"
                >
                  Back to pipeline
                </a>
                {selected.grant_url && (
                  <a
                    href={selected.grant_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-white bg-forest rounded-lg px-3 py-2 hover:bg-forest/90 transition-colors"
                  >
                    Start writing →
                  </a>
                )}
              </div>
            </div>

          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-[#faf9f7]">
          <div className="text-center">
            <span className="text-4xl mb-4 block">✦</span>
            <p className="text-sm font-semibold text-charcoal">Select a grant to view its briefing</p>
          </div>
        </div>
      )}
    </div>
  )
}
