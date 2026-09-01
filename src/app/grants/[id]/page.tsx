import React from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatRange, locationLabel } from '@/lib/utils'
import { notFound } from 'next/navigation'
import LogoMark from '@/components/icons/LogoMark'
import { eligibilityStated, ELIGIBILITY_NOT_STATED } from '@/lib/eligibility-disclosure'
import { FUNDING_TYPE_COLOUR, TYPE_NEUTRAL, type FundingTypeKey } from '@/lib/funding-type-colours'
import { sectorColour } from '@/lib/sector-colours'
import {
  MapPin, Calendar, CheckCircle, Clock, Info, ExternalLink, ArrowRight,
  Building2, Search, TrendingUp, ShieldCheck,
} from 'lucide-react'
import { MCP_BRAND_NAME, MCP_APP_ORIGIN } from '@/lib/mcp-brand'
import { ctaSupportLine } from '@/lib/trial'

// ── Public bridge page ───────────────────────────────────────────────────────
// Reached from an MCP link inside someone's AI assistant, or from search. So
// the visitor is LOGGED OUT, has probably never seen us, already cares about
// this one opportunity, and arrived with one question: can we apply for this,
// and is it worth it?
//
// That makes this an acquisition page wearing a data page's clothes. The old
// version answered the first half well and the second half not at all: seven
// structure chips and a lime button. Rebuilt to the Band C reference
// (grant-public.html + grant-public-spec.md).
//
// Field set: the Q1-confirmed superset. Still excludes funder_brief (that is
// account-holder value), field_provenance, and the source slug, which leaks
// internal operational names like "catalogue-seed" and "manual_ingest_*".
//
// force-dynamic because the countdown is computed per request. A statically
// rendered "34 days left" is wrong within a day and drifts silently. (Spec §15.)
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'

const T = {
  cream:    '#F6F1E7',
  deep:     '#1D3C3E',
  charcoal: '#2E2E2E',
  inkMuted: '#5F5E5A',
  inkPlace: '#74736E',
  warm:     '#F1EDE3',
  hair:     'rgba(29,60,62,0.10)',
  ghost:    'rgba(29,60,62,0.22)',
  green:    '#1B6B3D',
  greenBg:  '#E4F1EA',
  gold:     '#EBCE78',
  terra:    '#D67558',
  teal:     '#4EAAB4',
  sage:     '#9BCA9D',
}

const UI   = 'var(--font-space-grotesk), Space Grotesk, sans-serif'
const BODY = 'var(--font-plus-jakarta, Plus Jakarta Sans, sans-serif)'

/**
 * No number. The count was "600+" until 2026-08-30, when it came off every
 * public surface: a catalogue that grows is a figure somebody has to maintain
 * in several places, and a stale one on an acquisition page is worse than none.
 * "Live" and "verified" are the claims that actually matter to a reader, and
 * they do not go stale. 603 active at the time it was removed, for the record.
 */

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

/**
 * Raw funding_type → the validated four-hue set.
 *
 * The page used to carry a FIFTH palette of its own (#97C459 / #F0997B /
 * #85B7EB / #EF9F27) for the same four categories the dashboard and Find
 * Funding already agreed on. One source now, so they cannot drift again.
 */
const TYPE_KEY: Record<string, FundingTypeKey> = {
  grant:             'grant',
  programme:         'programme',
  support_programme: 'programme',
  accelerator:       'programme',
  social_investment: 'investment',
  loan:              'investment',
  equity:            'investment',
  blended_finance:   'investment',
  in_kind:           'in_kind',
  'in-kind':         'in_kind',
}

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
  heritage: 'Heritage', sport: 'Sport', social_economy: 'Social Economy',
  mental_health: 'Mental Health',
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG  = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                      'August', 'September', 'October', 'November', 'December']

function humaniseDate(s: string | null): string | null {
  if (!s) return null
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return s
  return `${parseInt(m[3], 10)} ${MONTHS_SHORT[parseInt(m[2], 10) - 1]} ${m[1]}`
}

function humaniseDateLong(s: string | null): string | null {
  if (!s) return null
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return s
  return `${parseInt(m[3], 10)} ${MONTHS_LONG[parseInt(m[2], 10) - 1]} ${m[1]}`
}

/** Whole days between today and an ISO date. Negative once it has passed. */
function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const target = Date.UTC(+m[1], +m[2] - 1, +m[3])
  const now = new Date()
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.round((target - today) / 86_400_000)
}

/** £10,000 — never "GBP 10000". Spec §10 rule 1. */
function money(n: number | null | undefined): string | null {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return null
  return '£' + Number(n).toLocaleString('en-GB')
}

// ── Data ─────────────────────────────────────────────────────────────────────

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

/**
 * The meta description, composed from FIELDS rather than sliced from prose.
 *
 * It used to be `row.description.slice(0, 160)`, which meant the Google snippet
 * was the catalogue description truncated mid-word. On rows whose description
 * restates the fields, the snippet a stranger reads before deciding to click was
 * two-thirds duplicated data, an unformatted currency code, and half a
 * provenance note. Measured 2026-08-28: 50 of 603 active descriptions contain
 * "GBP", "deadline" or "verified at". Those rows want a catalogue pass, but the
 * snippet stops being wrong today, because it no longer comes from that text.
 *
 * Missing fields are OMITTED rather than left as a gap: no stranded "in ." or
 * "from .". Provenance never appears.
 */
function buildMetaDescription(a: {
  typeLabel: string
  amountMin: number | null
  amountMax: number | null
  funder: string | null
  sectors: string[]
  geography: string | null
  isRolling: boolean
  deadlineISO: string | null
  deadlinePassed: boolean
}): string {
  const lo = money(a.amountMin)
  const hi = money(a.amountMax)
  const amount = lo && hi ? `${lo}–${hi}` : lo ? `from ${lo}` : hi ? `up to ${hi}` : null

  let head = `${a.typeLabel}s`
  if (amount) head += ` of ${amount}`
  if (a.funder) head += ` from ${a.funder}`
  const sectors = a.sectors.slice(0, 2).map(s => (IMPACT_SECTOR_LABELS[s] ?? s).toLowerCase())
  if (sectors.length) head += ` for ${sectors.join(' and ')}`
  if (a.geography) head += ` in ${a.geography}`

  const deadlineSentence = a.isRolling
    ? 'Rolling deadline'
    : a.deadlineISO && !a.deadlinePassed
      ? `Apply by ${humaniseDateLong(a.deadlineISO)}`
      : 'Currently between rounds'

  return `${head}. ${deadlineSentence}. Check your organisation's eligibility on ${MCP_BRAND_NAME}.`
}

/** The clean URL. `?src=digest` and every utm_* stay out of it, so a tagged
 *  link never spawns a duplicate-content variant in the index. (Spec §13.) */
function canonicalFor(externalId: string): string {
  return `${MCP_APP_ORIGIN}/grants/${externalId}`
}

// ── Metadata ─────────────────────────────────────────────────────────────────
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await loadGrant(id)
  if (!result) {
    return { title: `Opportunity not found — ${MCP_BRAND_NAME}` }
  }
  const { row, externalId } = result

  const typeKey   = TYPE_KEY[String(row.funding_type ?? 'grant')] ?? 'grant'
  const typeLabel = FUNDING_TYPE_COLOUR[typeKey].label
  const deadlineISO    = row.deadline ? String(row.deadline) : null
  const deadlinePassed = !row.is_rolling && !!deadlineISO && (daysUntil(deadlineISO) ?? 0) < 0

  const description = buildMetaDescription({
    typeLabel,
    amountMin: row.amount_min as number | null,
    amountMax: row.amount_max as number | null,
    funder: row.funder ? String(row.funder) : null,
    sectors: Array.isArray(row.impact_sectors) ? row.impact_sectors : [],
    geography: locationLabel(row.is_local, row.location_tag) || null,
    isRolling: Boolean(row.is_rolling),
    deadlineISO,
    deadlinePassed,
  })

  const amountShort = formatRange(
    row.amount_min as number | null,
    row.amount_max as number | null,
    Boolean(row.amount_undisclosed),
    row.funding_type as string | null,
  )
  const deadlineBit = row.is_rolling
    ? 'rolling deadline'
    : deadlineISO && !deadlinePassed
      ? `deadline ${humaniseDate(deadlineISO)}`
      : 'between rounds'
  const title = `${row.title}${amountShort ? ` — ${amountShort}` : ''}, ${deadlineBit} | ${MCP_BRAND_NAME}`
  const url = canonicalFor(externalId)

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      title,
      description,
      url,
      // The route's own opengraph-image.tsx. Without it twitter.card below
      // promises a large image and supplies none.
      images: [`${url}/opengraph-image`],
    },
    twitter: { card: 'summary_large_image', title, description },
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

  const impactSectors: string[]      = Array.isArray(grant.impact_sectors)      ? grant.impact_sectors      : []
  const eligibleStructures: string[] = Array.isArray(grant.eligible_structures) ? grant.eligible_structures : []
  const structuresStated             = eligibilityStated(eligibleStructures)

  const funderType = String(grant.funder_type ?? 'other')
  const typeLabel  = FUNDER_LABELS[funderType] ?? funderType.replace(/_/g, ' ')
  const geography  = locationLabel(grant.is_local, grant.location_tag)

  const typeKey = TYPE_KEY[String(grant.funding_type ?? 'grant')] ?? null
  const ft      = typeKey ? FUNDING_TYPE_COLOUR[typeKey] : TYPE_NEUTRAL

  const deadlineISO    = grant.deadline ? String(grant.deadline) : null
  const deadlineHuman  = humaniseDate(deadlineISO)
  const days           = deadlineISO ? daysUntil(deadlineISO) : null
  const isRolling      = Boolean(grant.is_rolling)
  const deadlinePassed = !isRolling && days !== null && days < 0
  const urgent         = days !== null && days >= 0 && days <= 7

  const lastSeenISO   = grant.last_seen_at ? String(grant.last_seen_at).split('T')[0] : null
  const lastSeenHuman = humaniseDate(lastSeenISO)
  const lastSeenDays  = lastSeenISO ? -(daysUntil(lastSeenISO) ?? 0) : null
  /** Past 30 days the badge stops claiming freshness. It is the page's best
   *  asset, so it must never testify against itself. (Spec §11.) */
  const verificationAged = lastSeenDays === null || lastSeenDays > 30

  const applyUrl = grant.apply_url ? String(grant.apply_url) : null
  const url      = canonicalFor(externalId)
  const signupHref = `/auth/signup?return=${encodeURIComponent(`/grants/${externalId}`)}`

  // ── JSON-LD ────────────────────────────────────────────────────────────────
  // MonetaryGrant has NO deadline property. Its own are `amount` and `funder`;
  // from Grant it inherits `fundedItem` and `sponsor`; the rest is Thing.
  // `additionalProperty` is not available either, only `additionalType`. So the
  // deadline lives in `description`, which answer engines read as text anyway,
  // and the freshness signal gets a proper home on a WebPage `dateModified`.
  // `areaServed` belongs to Organization, so geography sits on the funder node,
  // where it is both valid and true. Inventing a key would be worse than
  // omitting one: validators drop it, and it reads as sloppiness to exactly the
  // crawlers this markup is courting.
  const amountLo = grant.amount_min as number | null
  const amountHi = grant.amount_max as number | null
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'MonetaryGrant',
        '@id': `${url}#grant`,
        name: String(grant.title ?? ''),
        description: buildMetaDescription({
          typeLabel: ft.label,
          amountMin: amountLo,
          amountMax: amountHi,
          funder: grant.funder ? String(grant.funder) : null,
          sectors: impactSectors,
          geography: geography || null,
          isRolling,
          deadlineISO,
          deadlinePassed,
        }),
        url,
        ...(amountLo !== null || amountHi !== null
          ? {
              amount: {
                '@type': 'MonetaryAmount',
                currency: 'GBP',
                ...(amountLo !== null ? { minValue: amountLo } : {}),
                ...(amountHi !== null ? { maxValue: amountHi } : {}),
              },
            }
          : {}),
        ...(grant.funder
          ? {
              funder: {
                '@type': 'Organization',
                name: String(grant.funder),
                ...(applyUrl ? { url: applyUrl } : {}),
                ...(geography ? { areaServed: geography } : {}),
              },
            }
          : {}),
      },
      {
        '@type': 'WebPage',
        '@id': url,
        url,
        name: String(grant.title ?? ''),
        ...(lastSeenISO ? { dateModified: lastSeenISO } : {}),
        isPartOf: { '@type': 'WebSite', name: MCP_BRAND_NAME, url: MCP_APP_ORIGIN },
        mainEntity: { '@id': `${url}#grant` },
      },
    ],
  }

  const chip: React.CSSProperties = {
    fontFamily: UI, fontSize: 11.5, fontWeight: 600, padding: '5px 12px',
    borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 6,
    whiteSpace: 'nowrap',
  }
  const neutralChip: React.CSSProperties = { ...chip, background: T.warm, color: T.deep }
  const sectionH2: React.CSSProperties = {
    fontFamily: UI, fontSize: 11, fontWeight: 700, letterSpacing: '0.14em',
    textTransform: 'uppercase', color: T.inkPlace, margin: '0 0 12px',
    display: 'flex', alignItems: 'center', gap: 8,
  }
  const section: React.CSSProperties = {
    paddingTop: 22, marginTop: 22, borderTop: `1px solid ${T.hair}`,
  }

  return (
    <div style={{ minHeight: '100vh', background: T.cream, fontFamily: BODY, color: T.charcoal }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Nav. The CTA pill's colour is an INLINE style, not a class, so the
          specificity collision the reference warns about (a container-scoped
          link colour out-ranking a button class) cannot happen here. */}
      <nav style={{ background: '#fff', borderBottom: `1px solid ${T.hair}` }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '16px 26px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 9, fontFamily: UI, fontWeight: 700, fontSize: 21, letterSpacing: '-0.03em', color: T.deep, textDecoration: 'none' }}>
            <LogoMark size={26} />
            {MCP_BRAND_NAME.toLowerCase()}
          </Link>
          <span style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <Link href="/auth/login" style={{ fontFamily: UI, fontSize: 14, fontWeight: 500, color: T.inkMuted, textDecoration: 'none' }}>
              Sign in
            </Link>
            <Link
              href={signupHref}
              style={{
                fontFamily: UI, fontSize: 14, fontWeight: 600, color: T.cream, background: T.deep,
                padding: '11px 20px', borderRadius: 999, textDecoration: 'none',
                display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
              }}
            >
              Find funding<span className="hidden md:inline">&nbsp;for your organisation</span>
              <ArrowRight style={{ width: 15, height: 15 }} />
            </Link>
          </span>
        </div>
      </nav>

      <main style={{ maxWidth: 800, margin: '0 auto', padding: '32px 26px 70px' }}>
        <div style={{ background: '#fff', border: `1px solid ${T.hair}`, borderRadius: 18, padding: '30px 32px' }}>

          {/* Meta chips. No funder-initial avatar: a grey letter in a rounded
              square carries nothing the title does not, and on a page whose
              first job is to look credible it reads as a logo that failed to
              load. The title now starts at the card's left edge. */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 14 }}>
            <span style={neutralChip}><Building2 style={{ width: 12, height: 12 }} />{typeLabel}</span>
            {geography && (
              <span style={neutralChip}><MapPin style={{ width: 12, height: 12 }} />{geography}</span>
            )}
            <span style={{ ...chip, background: ft.tint, color: ft.fg }}>{ft.label}</span>
          </div>

          <div style={{ marginBottom: 22 }}>
            <h1 style={{ fontFamily: UI, fontSize: 29, fontWeight: 600, lineHeight: 1.15, letterSpacing: '-0.028em', color: T.deep, margin: '0 0 5px' }}>
              {String(grant.title ?? '')}
            </h1>
            <p style={{ fontSize: 15.5, color: T.inkMuted, margin: 0 }}>{String(grant.funder ?? '')}</p>
          </div>

          {/* Metrics strip, with the countdown. A date alone does not create
              urgency; a number does, and it is genuinely useful. */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 18,
            background: T.warm, borderRadius: 14, padding: '18px 20px', marginBottom: 26,
            alignItems: 'center',
          }}>
            <span>
              <span style={{ display: 'block', fontFamily: UI, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: T.inkPlace, marginBottom: 6 }}>Amount</span>
              <span style={{ display: 'block', fontFamily: UI, fontSize: 24, fontWeight: 700, letterSpacing: '-0.025em', color: T.deep, lineHeight: 1.1 }}>
                {formatRange(grant.amount_min as number | null, grant.amount_max as number | null, Boolean(grant.amount_undisclosed), grant.funding_type as string | null)}
              </span>
            </span>
            <span>
              <span style={{ display: 'block', fontFamily: UI, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: T.inkPlace, marginBottom: 6 }}>Deadline</span>
              <span style={{
                display: 'block', fontFamily: UI, fontSize: 18, fontWeight: 600, letterSpacing: '-0.018em', lineHeight: 1.1,
                color: deadlinePassed ? T.inkMuted : T.deep,
                // Struck through rather than removed: the date is still the
                // useful fact once the round has closed.
                textDecoration: deadlinePassed ? 'line-through' : 'none',
                textDecorationThickness: deadlinePassed ? 1.5 : undefined,
              }}>
                {isRolling ? 'Rolling' : deadlineHuman ?? 'Not stated'}
              </span>
            </span>
            {deadlinePassed ? (
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: T.warm, border: `1px solid ${T.ghost}`, borderRadius: 12, padding: '11px 16px', flexShrink: 0 }}>
                <span style={{ display: 'block', fontFamily: UI, fontWeight: 700, fontSize: 14, letterSpacing: '-0.01em', color: T.deep, lineHeight: 1 }}>Round closed</span>
              </span>
            ) : days !== null && !isRolling ? (
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: urgent ? T.terra : T.gold, borderRadius: 12, padding: '11px 16px', flexShrink: 0 }}>
                <span style={{ display: 'block', fontFamily: UI, fontWeight: 700, fontSize: 20, color: T.deep, lineHeight: 1 }}>{days}</span>
                <span style={{ display: 'block', fontFamily: UI, fontWeight: 600, fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.deep, marginTop: 5 }}>
                  {days === 1 ? 'day left' : 'days left'}
                </span>
              </span>
            ) : null}
          </div>

          {grant.description && (
            <div style={{ ...section, borderTop: 'none', marginTop: 0, paddingTop: 0 }}>
              <h2 style={sectionH2}>About this opportunity</h2>
              <p style={{ fontSize: 16, lineHeight: 1.65, color: T.deep, margin: 0, whiteSpace: 'pre-line' }}>
                {String(grant.description)}
              </p>
            </div>
          )}

          {impactSectors.length > 0 && (
            <div style={section}>
              <h2 style={sectionH2}>Impact sectors</h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {impactSectors.map(s => {
                  const c = sectorColour(s)
                  return (
                    <span key={s} style={{ ...chip, background: c.bg, color: c.color }}>
                      {IMPACT_SECTOR_LABELS[s] ?? s.replace(/_/g, ' ')}
                    </span>
                  )
                })}
              </div>
            </div>
          )}

          <div style={section}>
            <h2 style={sectionH2}><ShieldCheck style={{ width: 13, height: 13 }} />Who can apply</h2>
            {structuresStated ? (
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {eligibleStructures.map(s => (
                    <span key={s} style={neutralChip}>{STRUCTURE_LABELS[s] ?? s.replace(/_/g, ' ')}</span>
                  ))}
                </div>
                <p style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13.5, lineHeight: 1.55, color: T.inkMuted, margin: '12px 0 0' }}>
                  <Info style={{ width: 14, height: 14, flexShrink: 0, color: T.inkPlace, marginTop: 2 }} />
                  If your organisation isn&rsquo;t one of these, this funder can&rsquo;t accept your application. Structure is a hard rule, not a preference.
                </p>
              </>
            ) : (
              /* An empty eligible_structures means nobody has established the
                 funder's rule. It does not mean "open to all", and this is the
                 one surface facing search engines, so it says so through the
                 shared helper rather than an inline sentence. Seven surfaces
                 drifted precisely because each wrote its own. */
              <p style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13.5, lineHeight: 1.55, color: T.inkMuted, margin: 0 }}>
                <Info style={{ width: 14, height: 14, flexShrink: 0, color: T.inkPlace, marginTop: 2 }} />
                {ELIGIBILITY_NOT_STATED}
              </p>
            )}
          </div>

          {/* The conversion moment. One panel, mid-card, on a logged-out page
              whose job is conversion, arguing against the question the visitor
              actually arrived with. */}
          <div style={{ background: T.deep, borderRadius: 16, padding: '26px 28px', marginTop: 26 }}>
            <h3 style={{ fontFamily: UI, fontSize: 22, fontWeight: 600, letterSpacing: '-0.025em', color: T.cream, margin: '0 0 9px' }}>
              {deadlinePassed ? 'Missed this round?' : 'Is it worth applying?'}
            </h3>
            <p style={{ fontSize: 15.5, lineHeight: 1.6, color: 'rgba(246,241,231,0.85)', margin: '0 0 20px', maxWidth: '56ch' }}>
              {deadlinePassed
                ? 'There are more in the catalogue. Shoots checks them against your organisation and tells you which ones are open to you now.'
                : 'Structure is only the first hurdle. Shoots checks this opportunity against your organisation and tells you where you actually stand.'}
            </p>
            <ul style={{ margin: '0 0 22px', padding: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
              {[
                { bg: T.terra, Icon: CheckCircle, t: 'Whether you qualify', d: 'Every rule this funder sets, checked against your profile, including the ones that rule you out.' },
                { bg: T.teal,  Icon: TrendingUp,  t: 'How well you match',  d: 'A score against what they fund, who they fund and where, so you know if it is worth the week.' },
                { bg: T.sage,  Icon: Search,      t: 'What else is open',   d: 'Every opportunity in the catalogue, filtered to the ones your organisation can actually apply for.' },
              ].map(({ bg, Icon, t, d }) => (
                <li key={t} style={{ fontSize: 14, lineHeight: 1.55, color: 'rgba(246,241,231,0.85)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 9, marginBottom: 10, background: bg, color: T.deep }}>
                    <Icon style={{ width: 16, height: 16 }} />
                  </span>
                  <b style={{ display: 'block', fontFamily: UI, fontWeight: 600, fontSize: 14.5, color: T.cream, marginBottom: 4, letterSpacing: '-0.012em' }}>{t}</b>
                  {d}
                </li>
              ))}
            </ul>
            <span style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <Link
                href={signupHref}
                style={{
                  fontFamily: UI, fontSize: 15, fontWeight: 600, color: T.deep, background: T.cream,
                  padding: '13px 24px', borderRadius: 999, textDecoration: 'none',
                  display: 'inline-flex', alignItems: 'center', gap: 9,
                }}
              >
                Check this against your organisation
                <ArrowRight style={{ width: 15, height: 15 }} />
              </Link>
              {/* From lib/trial.ts, never a literal: the trial length is a
                  commercial promise and this is the page a stranger reads
                  before signing up. Today that is the setup time alone. The
                  trial is Apply-only and not purchasable until 10 September,
                  and this CTA goes to ordinary signup, which lands on Match,
                  so the offer would be undeliverable from here twice over. */}
              <span style={{ fontSize: 13.5, color: 'rgba(246,241,231,0.7)' }}>{ctaSupportLine()}</span>
            </span>
          </div>

          {/* The funder link stays, and stays one click. Hiding it to force a
              signup is the kind of thing that makes people distrust a
              catalogue. "Visit", not "Apply": the link often goes to a
              programme overview rather than an application form. */}
          {applyUrl && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginTop: 22, paddingTop: 22, borderTop: `1px solid ${T.hair}` }}>
              <span style={{ fontSize: 14.5, lineHeight: 1.55, color: T.inkMuted, maxWidth: '48ch' }}>
                {deadlinePassed ? (
                  <>The funder&rsquo;s page may already list the next round. <b style={{ color: T.deep, fontWeight: 600 }}>Worth a look.</b></>
                ) : (
                  <>Already know this one is right for you? <b style={{ color: T.deep, fontWeight: 600 }}>Go straight to the funder.</b> {MCP_BRAND_NAME} doesn&rsquo;t sit between you and the application.</>
                )}
              </span>
              <a
                href={applyUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontFamily: UI, fontSize: 14.5, fontWeight: 500, color: T.deep, background: '#fff',
                  border: `1px solid ${T.ghost}`, padding: '12px 20px', borderRadius: 999,
                  textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
                }}
              >
                Visit funder site
                <ExternalLink style={{ width: 14, height: 14 }} />
              </a>
            </div>
          )}
        </div>

        {/* Verification. The strongest trust signal on the page, so it is a
            chip rather than 13px grey at the bottom, and it degrades past 30
            days into wording that makes no freshness claim and hands the
            reader an action instead. */}
        <div style={{ textAlign: 'center', marginTop: 26 }}>
          {lastSeenHuman && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: UI, fontSize: 12, fontWeight: 600,
              padding: '6px 13px', borderRadius: 999, marginBottom: 10,
              background: verificationAged ? T.warm : T.greenBg,
              color: verificationAged ? T.deep : T.green,
            }}>
              {verificationAged
                ? <><Clock style={{ width: 12, height: 12 }} />Last checked {lastSeenHuman}. Confirm details with the funder before applying.</>
                : <><CheckCircle style={{ width: 12, height: 12 }} />Checked against the funder&rsquo;s own site on {lastSeenHuman}</>}
            </span>
          )}
          <p style={{ fontSize: 13, lineHeight: 1.6, color: T.inkPlace, margin: 0 }}>
            {MCP_BRAND_NAME} keeps a curated catalogue of live, verified UK funding opportunities, every entry traced back to the
            funder&rsquo;s own published page.{' '}
            <Link href="/mcp" style={{ color: T.deep, fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3, textDecorationColor: T.ghost }}>
              How we build it
            </Link>.
          </p>
        </div>
      </main>
    </div>
  )
}
