import React from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatRange } from '@/lib/utils'
import { notFound } from 'next/navigation'
import LogoMark from '@/components/icons/LogoMark'
import { brand } from '@/config/brand'
import {
  MapPin, Bell, RefreshCw, Calendar, AlertTriangle, CheckCircle, ShieldAlert,
  ExternalLink,
} from 'lucide-react'

// ── Public bridge page ───────────────────────────────────────────────────────
// Read-only view rendering the audit-grade fields on a public route. Linked
// from MCP tool responses (grant_tracker_url) so a Connectors-Directory user
// or reviewer who clicks through doesn't hit an auth wall.
//
// Field set: Q1-confirmed superset (title, funder, type labels, amounts,
// deadline, description, eligibility_criteria, eligible_structures,
// impact_sectors, apply_url, last-verified footer). Explicitly excludes
// funder_brief (account-holder value), field_provenance, source slug
// (internal operational metadata — leaks "catalogue-seed", "manual_ingest_*"
// etc.), and any other admin/operational fields.
// ─────────────────────────────────────────────────────────────────────────────

const FUNDER_LABELS: Record<string, string> = {
  trust_foundation:    'Trust & Foundation',
  community_foundation:'Community Foundation',
  corporate_foundation:'Corporate Foundation',
  capacity_builder:    'Capacity Builder',
  local_authority:     'Local Authority',
  housing_association: 'Housing Association',
  corporate:           'Corporate',
  lottery:             'Lottery',
  government:          'Government',
  foundation:          'Foundation',
  other:               'Other',
}

// Funding-type chip — brand palette per CLAUDE.md spec table.
// Out-of-spec values (accelerator, diversity_fund, etc.) collapse to 'Other'.
const FT_BRAND: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  grant:             { bg: 'var(--state-success-pale)', text: 'var(--state-success)', dot: 'var(--sage)', label: 'Grant' },
  programme:         { bg: 'var(--state-error-pale)', text: 'var(--state-error)', dot: 'var(--type-programme)', label: 'Programme' },
  support_programme: { bg: 'var(--state-error-pale)', text: 'var(--state-error)', dot: 'var(--type-programme)', label: 'Programme' },
  accelerator:       { bg: 'var(--state-error-pale)', text: 'var(--state-error)', dot: 'var(--type-programme)', label: 'Programme' },
  social_investment: { bg: 'var(--state-info-pale)', text: 'var(--state-info)', dot: 'var(--type-investment)', label: 'Investment' },
  loan:              { bg: 'var(--state-info-pale)', text: 'var(--state-info)', dot: 'var(--type-investment)', label: 'Investment' },
  equity:            { bg: 'var(--state-info-pale)', text: 'var(--state-info)', dot: 'var(--type-investment)', label: 'Investment' },
  blended_finance:   { bg: 'var(--state-info-pale)', text: 'var(--state-info)', dot: 'var(--type-investment)', label: 'Investment' },
  in_kind:           { bg: 'var(--state-warning-pale)', text: 'var(--state-warning)', dot: 'var(--type-inkind)', label: 'In-Kind' },
  'in-kind':         { bg: 'var(--state-warning-pale)', text: 'var(--state-warning)', dot: 'var(--type-inkind)', label: 'In-Kind' },
}
const FT_OTHER = { bg: 'var(--surface-sunken)', text: 'var(--text-muted)', dot: 'var(--text-subtle)', label: 'Other' }

// ── Helpers ──────────────────────────────────────────────────────────────────
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// Humanise an ISO date or timestamp → "21 Aug 2026". Free-text values that
// don't match an ISO prefix (e.g. "Summer 2026", "24 June 2026") pass through
// unchanged — next_open_date in particular is often free-form.
function humaniseDate(input: string | null | undefined): string | null {
  if (!input) return null
  const s = String(input).trim()
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return s
  const day = parseInt(m[3], 10)
  const month = MONTHS_SHORT[parseInt(m[2], 10) - 1]
  return `${day} ${month} ${m[1]}`
}

async function loadGrant(rawId: string) {
  const id = decodeURIComponent(rawId)
  const supabase = await createClient()

  const { data: byExternal } = await supabase
    .from('scraped_grants')
    .select('*')
    .eq('external_id', id)
    .maybeSingle()
  if (byExternal) return { row: byExternal, externalId: id }

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (UUID_RE.test(id)) {
    const { data: byUuid } = await supabase
      .from('scraped_grants')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (byUuid) return { row: byUuid, externalId: id }
  }
  return null
}

// ── Metadata ─────────────────────────────────────────────────────────────────
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await loadGrant(id)
  if (!result) {
    return { title: `Opportunity not found — ${brand.name}` }
  }
  const { row } = result
  const title = `${row.title} — ${row.funder} · ${brand.name}`
  const description = typeof row.description === 'string'
    ? row.description.slice(0, 160).trim()
    : `A UK funding opportunity, verified by ${brand.name}.`
  return {
    title,
    description,
    openGraph: { title, description },
    twitter:   { title, description, card: 'summary_large_image' },
  }
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default async function PublicGrantPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const result = await loadGrant(id)
  if (!result) notFound()
  const { row: grant, externalId } = result

  const sectors: string[]     = Array.isArray(grant.sectors)              ? grant.sectors              : []
  const eligibility: string[] = Array.isArray(grant.eligibility_criteria) ? grant.eligibility_criteria : []
  const funderType            = String(grant.funder_type ?? 'other')
  const typeLabel             = FUNDER_LABELS[funderType] ?? funderType.replace(/_/g, ' ')
  const lastSeenISO           = grant.last_seen_at ? String(grant.last_seen_at).split('T')[0] : null
  const lastSeenHuman         = humaniseDate(lastSeenISO) ?? 'recently'

  const rawFundingType = grant.funding_type ? String(grant.funding_type) : 'grant'
  const ft             = FT_BRAND[rawFundingType] ?? FT_OTHER

  const impactSectors: string[]      = Array.isArray(grant.impact_sectors)     ? grant.impact_sectors     : []
  const eligibleStructures: string[] = Array.isArray(grant.eligible_structures) ? grant.eligible_structures : []

  const STRUCTURE_LABELS: Record<string, string> = {
    cic_guarantee:         'CIC (Ltd by Guarantee)',
    cic_shares:            'CIC (Ltd by Shares)',
    cio:                   'CIO',
    registered_charity:    'Registered Charity',
    ltd_guarantee:         'Ltd by Guarantee',
    company_ltd_guarantee: 'Company Ltd by Guarantee',
    ltd_shares:            'Ltd by Shares',
    llp:                   'LLP',
    cooperative:           'Co-operative / CBS',
    unincorporated:        'Unincorporated Association',
    sole_trader:           'Sole Trader / Individual',
    not_registered:        'Pre-registration',
  }

  const IMPACT_SECTOR_LABELS: Record<string, string> = {
    creative: 'Arts & Culture', environment: 'Environment', health: 'Health',
    education: 'Education', tech: 'Technology', housing: 'Housing',
    food: 'Food', employment: 'Employment', community: 'Community',
    justice: 'Justice & Equality', financial: 'Financial Inclusion', international: 'International',
  }

  const deadlineISO     = grant.deadline ? String(grant.deadline) : null
  const deadlineHuman   = humaniseDate(deadlineISO)
  const deadlinePassed  = !grant.is_rolling && deadlineISO && new Date(deadlineISO) < new Date()
  const nextOpenHuman   = humaniseDate(grant.next_open_date ? String(grant.next_open_date) : null)

  const signupReturn = `/auth/signup?return=${encodeURIComponent(`/grants/${externalId}`)}`

  return (
    <div className="min-h-screen bg-surface-page flex flex-col">

      {/* Top bar — wordmark sizing + container matched to LandingPage nav */}
      <header className="border-b border-warm bg-white">
        <div className="flex items-center justify-between px-6 md:px-8 py-5 max-w-7xl mx-auto">
          <Link href="/" className="flex items-center gap-1.5 text-2xl font-bold text-text-body tracking-tight no-underline" style={{ fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif' }}>
            <LogoMark size={30} />
            {brand.name}
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/auth/login" className="text-mid hover:text-charcoal no-underline">Sign in</Link>
            <Link
              href="/auth/signup"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg no-underline hover:opacity-90"
              style={{
                background: 'var(--deep)',
                color: 'var(--state-success-pale)',
                fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif',
                fontWeight: 600,
              }}
            >
              Find funding for your org →
            </Link>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-2xl w-full mx-auto px-6 py-8">

        {/* Card */}
        <div className="bg-white rounded-xl border border-warm p-6 mb-4">

          {/* Header */}
          <div className="flex items-start gap-4 mb-5">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-xl flex-shrink-0"
              style={{ background: 'var(--state-success-pale)', color: 'var(--state-success)', fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif' }}
            >
              {String(grant.funder ?? '?')[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                {/* Funder-type — neutral chip */}
                <span
                  className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full"
                  style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)', fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif' }}
                >
                  {typeLabel}
                </span>
                {grant.is_local && (
                  <span
                    className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full"
                    style={{ background: 'var(--state-success-pale)', color: 'var(--state-success)', fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif' }}
                  >
                    <MapPin className="w-3 h-3" />Local
                  </span>
                )}
                {/* Funding-type — brand-palette chip with dot indicator */}
                <span
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full"
                  style={{ background: ft.bg, color: ft.text, fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif' }}
                >
                  <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: ft.dot }} />
                  {ft.label}
                </span>
              </div>
              <h1
                className="text-2xl font-bold leading-tight"
                style={{ color: 'var(--deep)', fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif' }}
              >
                {grant.title}
              </h1>
              <p className="text-mid text-base mt-1">{grant.funder}</p>
            </div>
          </div>

          {/* Key metrics */}
          <div className="grid grid-cols-2 gap-4 p-4 rounded-xl mb-5" style={{ background: 'var(--surface-sunken)' }}>
            <div>
              <p className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text-subtle)' }}>Amount</p>
              <p
                className="text-2xl font-bold"
                style={{ color: 'var(--deep)', fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif' }}
              >
                {formatRange(grant.amount_min as number | null, grant.amount_max as number | null, Boolean(grant.amount_undisclosed))}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text-subtle)' }}>Deadline</p>
              <p
                className="text-sm font-semibold mt-1 inline-flex items-center gap-1.5"
                style={{
                  color: grant.is_rolling ? 'var(--state-success)' : deadlinePassed ? 'var(--terra)' : 'var(--text-body)',
                  fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif',
                }}
              >
                {grant.is_rolling
                  ? <><RefreshCw className="w-3.5 h-3.5" />Rolling — apply any time</>
                  : deadlineHuman
                    ? deadlinePassed
                      ? <><AlertTriangle className="w-3.5 h-3.5" />Deadline passed ({deadlineHuman})</>
                      : <><Calendar className="w-3.5 h-3.5" />{deadlineHuman}</>
                    : 'Check funder site for deadline'
                }
              </p>
            </div>
          </div>

          {/* Next Open Date */}
          {nextOpenHuman && (
            <div className="mb-4">
              <span
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg"
                style={{ background: 'var(--state-info-pale)', color: 'var(--state-info)', fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif' }}
              >
                <Bell className="w-3.5 h-3.5" />Opens {nextOpenHuman}
              </span>
            </div>
          )}

          {/* Description */}
          <div className="mb-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider mb-2.5" style={{ color: 'var(--text-subtle)', fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif' }}>
              About this opportunity
            </h2>
            <p className="text-mid leading-relaxed whitespace-pre-line">{grant.description}</p>
          </div>

          {/* Eligibility criteria */}
          {eligibility.length > 0 && (
            <div className="mb-5 pt-4 border-t border-warm">
              <h2 className="text-xs font-semibold uppercase tracking-wider mb-2.5" style={{ color: 'var(--text-subtle)', fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif' }}>
                Eligibility criteria
              </h2>
              <ul className="space-y-2">
                {eligibility.map((c, i) => (
                  <li key={i} className="flex gap-2.5 text-sm text-mid">
                    <span className="flex-shrink-0 mt-0.5 font-bold" style={{ color: 'var(--state-success)' }}>✓</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Impact sectors */}
          {impactSectors.length > 0 && (
            <div className="mb-5 pt-4 border-t border-warm">
              <h2 className="text-xs font-semibold uppercase tracking-wider mb-2.5" style={{ color: 'var(--text-subtle)', fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif' }}>
                Impact sectors
              </h2>
              <div className="flex flex-wrap gap-2">
                {impactSectors.map(s => (
                  <span
                    key={s}
                    className="inline-block text-xs font-semibold px-2.5 py-1 rounded-md capitalize"
                    style={{ background: 'var(--state-success-pale)', color: 'var(--state-success)', fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif' }}
                  >
                    {IMPACT_SECTOR_LABELS[s] ?? s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Eligible structures */}
          {eligibleStructures.length > 0 && (
            <div className="mb-5 pt-4 border-t border-warm">
              <h2
                className="text-xs font-semibold uppercase tracking-wider mb-2.5 inline-flex items-center gap-1.5"
                style={{ color: 'var(--text-subtle)', fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif' }}
              >
                <CheckCircle className="w-3.5 h-3.5" style={{ color: 'var(--state-success)' }} />
                Eligible organisation types
              </h2>
              <div className="flex flex-wrap gap-2">
                {eligibleStructures.map(s => (
                  <span
                    key={s}
                    className="inline-block text-xs font-semibold px-2.5 py-1 rounded-md border"
                    style={{ background: 'var(--state-success-pale)', color: 'var(--state-success)', borderColor: 'var(--sage)', fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif' }}
                  >
                    {STRUCTURE_LABELS[s] ?? s}
                  </span>
                ))}
              </div>
              <p className="text-xs mt-2 inline-flex items-center gap-1" style={{ color: 'var(--text-subtle)' }}>
                <ShieldAlert className="w-3 h-3" />
                Only the organisation types listed above are eligible to apply.
              </p>
            </div>
          )}

          {/* Legacy free-text sectors fallback */}
          {impactSectors.length === 0 && sectors.length > 0 && (
            <div className="mb-5 pt-4 border-t border-warm">
              <h2 className="text-xs font-semibold uppercase tracking-wider mb-2.5" style={{ color: 'var(--text-subtle)', fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif' }}>
                Sectors
              </h2>
              <div className="flex flex-wrap gap-2">
                {sectors.map(s => (
                  <span
                    key={s}
                    className="inline-block text-xs font-semibold px-2.5 py-1 rounded-md capitalize"
                    style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)', fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif' }}
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* CTAs — flipped per Paul 2026-06-04. Save is primary lime (this page
              is the app's funnel surface; Save is the conversion); Apply
              is secondary outline (trust signal, still visible). */}
          <div className="pt-4 border-t border-warm flex flex-wrap gap-3 items-center">
            <Link
              href={signupReturn}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg no-underline hover:opacity-90"
              style={{
                background: '#8ECB3C' /* eslint-disable-line no-restricted-syntax -- RETIRED lime (#8ECB3C) — button-hierarchy redesign, not a token rename */,
                color: 'var(--deep)',
                fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif',
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              <CheckCircle className="w-3.5 h-3.5" />
              Check your eligibility — free
            </Link>
            {grant.apply_url && (
              <a
                href={String(grant.apply_url)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg no-underline transition-colors"
                style={{
                  background: 'var(--surface-card)',
                  color: 'var(--text-body)',
                  border: '1px solid var(--text-body)',
                  fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif',
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                Apply on funder site
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>

        {/* Footer — trust line, no internal source slug */}
        <p className="text-xs text-center" style={{ color: 'var(--text-subtle)' }}>
          Last verified {lastSeenHuman} · {brand.name} catalogue
        </p>
        <p className="text-xs text-center mt-3" style={{ color: 'var(--text-subtle)' }}>
          {brand.name} maintains a curated, URL-validated UK funding catalogue.{' '}
          <Link href="/" className="no-underline hover:underline" style={{ color: 'var(--state-success)' }}>Learn more</Link>.
        </p>
      </main>
    </div>
  )
}
