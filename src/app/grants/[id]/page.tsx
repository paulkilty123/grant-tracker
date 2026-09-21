import React from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatRange, locationLabel } from '@/lib/utils'
import { notFound, redirect } from 'next/navigation'
import { isPubliclyVisible } from '@/lib/public-visibility'
import LogoMark from '@/components/icons/LogoMark'
import { eligibilityStated, ELIGIBILITY_NOT_STATED } from '@/lib/eligibility-disclosure'
import { FUNDING_TYPE_COLOUR, TYPE_NEUTRAL, type FundingTypeKey } from '@/lib/funding-type-colours'
import { sectorColour, TAG_NEUTRAL_COOL } from '@/lib/sector-colours'
import {
  MapPin, Calendar, Info, ExternalLink, ArrowRight,
  Building2, TrendingUp, ShieldCheck, Star, Check, Ban,
} from 'lucide-react'
import { MCP_BRAND_NAME, MCP_APP_ORIGIN } from '@/lib/mcp-brand'
import { ctaSupportParts } from '@/lib/trial'
import { leadParagraph } from '@/components/FunderBrief'
import {
  IMPACT_SECTOR_LABELS, regionHubForRow, sectorSlug, typeHubForRow,
  type HubRow,
} from '@/lib/hubs'
import { getAdminDb } from '@/lib/admin/admin-db'
import { stripPlaceholderLead } from '@/lib/digest/build'
import SaveFundButton from '@/components/public/SaveFundButton'

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
// Field set: the Q1-confirmed superset, plus (from 14 September 2026, Paul's
// call) the factual half of the funder brief: what they fund, who can apply,
// what they will not fund, typical award, where, priorities, decision timeline.
// Rule 6 in CLAUDE.md wants who_can_apply and exclusions complete on every
// surface anyway, and a public page that showed seven structure chips and a
// one-line stub was hiding the catalogue it exists to show off. The judgement
// half of the brief (what makes a strong application, tips) stays behind the
// account, along with field_provenance and the source slug, which leaks
// internal operational names like "catalogue-seed" and "manual_ingest_*".
//
// force-dynamic because the countdown is computed per request. A statically
// rendered "34 days left" is wrong within a day and drifts silently. (Spec §15.)
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'

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
  scio:                  'SCIO',
  individual:            'Individual',
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

// IMPACT_SECTOR_LABELS lives in src/lib/hubs.ts now, shared with the hub
// pages, and covers all twenty-two live values rather than sixteen.

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

/** Non-empty string, and not one of the enricher's ways of saying "unknown". */
function briefText(brief: Record<string, unknown> | null, key: string): string | null {
  const v = brief?.[key]
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (!t || t === 'unknown') return null
  if (/^the source does not (state|specify|mention)/i.test(t)) return null
  return t
}

async function loadGrant(rawId: string) {
  const id = decodeURIComponent(rawId)
  // The admin client, not the session client: since migration 088 the public
  // key cannot read the catalogue, so a logged-out reader's session would
  // return nothing and this page could never decide between "sign in" and
  // "open to the public". Visibility is enforced by isPubliclyVisible below.
  const supabase = getAdminDb()

  const { data: byExternal } = await supabase
    .from('scraped_grants')
    .select('*')
    .eq('external_id', id)
    .maybeSingle()
  if (byExternal) return isPubliclyVisible(byExternal) ? { row: byExternal, externalId: id } : null

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (UUID_RE.test(id)) {
    const { data: byUuid } = await supabase
      .from('scraped_grants')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (byUuid) return isPubliclyVisible(byUuid) ? { row: byUuid, externalId: id } : null
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
// ── Page ─────────────────────────────────────────────────────────────────────
// Option C (Paul's brief, Claude outputs/record-page, 21 Sept 2026, v2 as
// given in the conversation): the facts sit in the fund card; every section
// renders from a stored field; no browse paths and no "more like this"; a
// white ground. Two audiences on one template: a signed-in member sees no
// sign-up band, a header button to the dashboard, and a working "Save this
// fund"; a logged-out reader of an open_to_public row sees the sign-up band
// and no save button (the carry-through is pass 2). Visibility is unchanged.
export default async function PublicGrantPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const result = await loadGrant(id)
  if (!result) notFound()
  const { row: grant, externalId } = result

  // ── Who is reading ─────────────────────────────────────────────────────────
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const signedIn = Boolean(user)
  const isPublic = Boolean((grant as { open_to_public?: boolean | null }).open_to_public)
  // 18 Sept 2026, Paul: a stranger almost never has an account, so the door
  // is sign-up, not sign-in. Unchanged by the redesign.
  if (!signedIn && !isPublic) redirect('/signup')

  // Already on the reader's saved list? Only worth asking when signed in.
  let alreadySaved = false
  if (user) {
    const { data: orgs } = await supabase.from('organisations').select('id').eq('owner_id', user.id)
    const orgIds = (orgs ?? []).map(o => o.id)
    if (orgIds.length) {
      const { count } = await supabase.from('grant_interactions').select('id', { count: 'exact', head: true })
        .in('org_id', orgIds).eq('grant_id', String(grant.id)).eq('action', 'saved')
      alreadySaved = (count ?? 0) > 0
    }
  }

  // ── Fields ─────────────────────────────────────────────────────────────────
  const impactSectors: string[]      = Array.isArray(grant.impact_sectors)      ? grant.impact_sectors      : []
  const eligibleStructures: string[] = Array.isArray(grant.eligible_structures) ? grant.eligible_structures : []
  const structuresStated             = eligibilityStated(eligibleStructures)
  const brief: Record<string, unknown> | null = grant.funder_brief && typeof grant.funder_brief === 'object' ? grant.funder_brief as Record<string, unknown> : null
  const whatTheyFund = briefText(brief, 'what_they_fund') ?? leadParagraph(brief, grant.description ? String(grant.description) : null)
  const whoCanApply  = briefText(brief, 'who_can_apply')
  // The digest's own helper: "Not stated. However, applicants must be..."
  // keeps the caveat and drops the placeholder; a bare "none stated" empties
  // the box, and an empty box is not drawn (the eligible box goes full width).
  const exclusionsRaw = briefText(brief, 'exclusions')
  const exclusionsStripped = exclusionsRaw ? stripPlaceholderLead(exclusionsRaw).trim() : ''
  const exclusions = exclusionsStripped && !/^\s*(no(ne)?\b[^.]{0,40}(exclusion|stated|specified|listed)|not stated|n\/a)\.?\s*$/i.test(exclusionsStripped) ? exclusionsStripped : null

  const isProgramme = String(grant.funding_type ?? '') === 'programme'
  const DETAIL_ROWS: ReadonlyArray<readonly [string, string, typeof MapPin]> = isProgramme
    ? [
        ['programme_offer',      'What you get',          Star],
        ['stage_fit',            'Who it is for',         ShieldCheck],
        ['geographic_focus',     'Geographic focus',      MapPin],
        ['time_commitment',      'Time commitment',       Calendar],
        ['cohort_and_selection', 'Places and selection',  TrendingUp],
        ['decision_timeline',    'Decision timeline',     Calendar],
        ['delivered_by',         'Delivered by',          Building2],
      ]
    : [
        ['geographic_focus',  'Geographic focus',   MapPin],
        ['priorities',        'Current priorities', TrendingUp],
        ['typical_award',     'Typical award',      Info],
        ['decision_timeline', 'Decision timeline',  Calendar],
      ]
  // Empty rows are dropped (v2): a label with nothing beside it is worse than
  // no row. strong_application and funder_tips are never in the list.
  const details = DETAIL_ROWS
    .map(([key, label, Icon]) => ({ key, label, Icon, text: briefText(brief, key) }))
    .filter((d): d is typeof d & { text: string } => d.text !== null)

  const funderType = String(grant.funder_type ?? 'other')
  const funderTypeLabel = FUNDER_LABELS[funderType] ?? funderType.replace(/_/g, ' ')
  const geography  = locationLabel(grant.is_local, grant.location_tag)
  const typeKey = TYPE_KEY[String(grant.funding_type ?? 'grant')] ?? null
  const ft      = typeKey ? FUNDING_TYPE_COLOUR[typeKey] : TYPE_NEUTRAL
  const detailsHeading = `${ft.label === 'In-kind' ? 'Offer' : ft.label} details`

  // ── The Closes cell (v2) ───────────────────────────────────────────────────
  // A date with the days-left pill; "Next round opens" with its date;
  // "Rolling"; or "No deadline published". Between-rounds rows are never
  // active, so they never reach this page.
  const deadlineISO    = grant.deadline ? String(grant.deadline) : null
  const days           = deadlineISO ? daysUntil(deadlineISO) : null
  const isRolling      = Boolean(grant.is_rolling)
  const deadlinePassed = !isRolling && days !== null && days < 0
  const nextOpenText   = grant.next_open_date ? String(grant.next_open_date) : null
  const nextOpenISO    = grant.next_open_date_parsed ? String(grant.next_open_date_parsed) : null
  const weekday = (iso: string | null) => {
    const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/)
    return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' }) : null
  }
  type Closes = { label: string; main: string; sub: string | null; pill: string | null; muted: boolean }
  const closes: Closes = deadlineISO && !isRolling && !deadlinePassed
    ? { label: 'Closes', main: humaniseDateLong(deadlineISO)!, sub: weekday(deadlineISO), pill: days === 0 ? 'Closes today' : `${days} ${days === 1 ? 'day' : 'days'} left`, muted: false }
    : deadlineISO && !isRolling && deadlinePassed
      ? (nextOpenText
          ? { label: 'Next round opens', main: humaniseDateLong(nextOpenISO) ?? nextOpenText, sub: null, pill: null, muted: false }
          : { label: 'Closed', main: humaniseDateLong(deadlineISO)!, sub: 'This round has closed', pill: null, muted: true })
      : isRolling
        ? { label: 'Closes', main: 'Rolling', sub: 'Applications accepted at any time', pill: null, muted: false }
        : nextOpenText
          ? { label: 'Next round opens', main: humaniseDateLong(nextOpenISO) ?? nextOpenText, sub: null, pill: null, muted: false }
          : { label: 'Closes', main: 'No deadline published', sub: null, pill: null, muted: true }

  // ── Amount (v2: the range where there is one, via the existing formatter) ──
  const amountLo = grant.amount_min as number | null
  const amountHi = grant.amount_max as number | null
  const amountText = (amountLo || amountHi) ? formatRange(amountLo, amountHi, false, grant.funding_type as string | null) : null
  const amountMuted = !amountText
  const amountShown = (amountText ?? (isProgramme ? 'Programme only' : 'Amount not published')).replace(/ (million|thousand|k|m)\b/gi, ' $1')

  const applyUrl = grant.apply_url ? String(grant.apply_url) : null
  const url      = canonicalFor(externalId)
  const lastSeenISO = grant.last_seen_at ? String(grant.last_seen_at).split('T')[0] : null
  const signupHref = '/signup'
  const primaryHref = signedIn ? '/dashboard' : signupHref

  // ── Footer hub links: this record's sector, region and type ────────────────
  const hubRow: HubRow = {
    id: String(grant.id), external_id: grant.external_id ? String(grant.external_id) : null,
    title: String(grant.title ?? ''), funder: grant.funder ? String(grant.funder) : null,
    funding_type: grant.funding_type ? String(grant.funding_type) : null,
    amount_min: amountLo, amount_max: amountHi, amount_undisclosed: Boolean(grant.amount_undisclosed),
    deadline: deadlineISO, is_rolling: isRolling,
    location_tag: grant.location_tag ? String(grant.location_tag) : null,
    is_local: Boolean(grant.is_local), impact_sectors: impactSectors,
  }
  const regionHubOfRow = regionHubForRow(hubRow)
  const typeHubOfRow   = typeHubForRow(hubRow)
  const primarySector  = impactSectors.find(s => IMPACT_SECTOR_LABELS[s]) ?? null

  // ── JSON-LD (unchanged in shape; see the notes on the previous version) ────
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'MonetaryGrant',
        '@id': `${url}#grant`,
        name: String(grant.title ?? ''),
        description: buildMetaDescription({
          typeLabel: ft.label, amountMin: amountLo, amountMax: amountHi,
          funder: grant.funder ? String(grant.funder) : null, sectors: impactSectors,
          geography: geography || null, isRolling, deadlineISO, deadlinePassed,
        }),
        url,
        ...(amountLo !== null || amountHi !== null
          ? { amount: { '@type': 'MonetaryAmount', currency: 'GBP', ...(amountLo !== null ? { minValue: amountLo } : {}), ...(amountHi !== null ? { maxValue: amountHi } : {}) } }
          : {}),
        ...(grant.funder
          ? { funder: { '@type': 'Organization', name: String(grant.funder), ...(applyUrl ? { url: applyUrl } : {}), ...(geography ? { areaServed: geography } : {}) } }
          : {}),
      },
      {
        '@type': 'WebPage', '@id': url, url, name: String(grant.title ?? ''),
        ...(lastSeenISO ? { dateModified: lastSeenISO } : {}),
        isPartOf: { '@type': 'WebSite', name: MCP_BRAND_NAME, url: MCP_APP_ORIGIN },
        mainEntity: { '@id': `${url}#grant` },
      },
    ],
  }

  // ── Tokens (the brief's) ───────────────────────────────────────────────────
  const P = {
    page: '#F4F7F6', card: '#FFFFFF', border: 'rgba(29,60,62,0.08)', hair: 'rgba(29,60,62,0.10)', rule: 'rgba(29,60,62,0.12)',
    ink: '#1D3C3E', secondary: '#3F5B4E', muted: '#6B7D76', label: '#5B6F68',
    eligibleBg: '#EFF5EE', eligibleFg: '#2F6B3A', exclBg: '#FBEFEA', exclFg: '#993C1D',
    gold: '#EBCE78', icon: '#4EAAB4', chipNeutral: TAG_NEUTRAL_COOL, cream: '#F6F1E7',
  }
  const chip: React.CSSProperties = { fontFamily: UI, fontSize: 14, fontWeight: 600, padding: '6px 13px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap' }
  const lbl: React.CSSProperties  = { fontFamily: UI, fontWeight: 700, fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: P.label }
  const h2: React.CSSProperties   = { fontFamily: UI, fontWeight: 700, fontSize: 21, letterSpacing: '-0.01em', color: P.ink, margin: 0 }
  const primaryBtn: React.CSSProperties = { fontFamily: UI, fontWeight: 600, fontSize: 15, background: P.ink, color: '#FFFFFF', borderRadius: 999, padding: '12px 18px', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }
  const facts: React.CSSProperties = { fontSize: 16, lineHeight: 1.6, color: P.secondary, margin: 0, whiteSpace: 'pre-line' }

  return (
    <div style={{ minHeight: '100vh', background: P.page, color: P.ink, fontFamily: BODY, display: 'flex', flexDirection: 'column' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Header: logo, Sign in, one primary button. No Browse funding. */}
      <header style={{ background: '#fff', borderBottom: `1px solid ${P.border}` }}>
        <div style={{ maxWidth: 1228, margin: '0 auto', padding: '16px 26px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 11, fontFamily: UI, fontWeight: 500, fontSize: 27, letterSpacing: '-0.01em', color: P.ink, textDecoration: 'none' }}>
            <LogoMark size={42} />
            {MCP_BRAND_NAME.toLowerCase()}
          </Link>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
            {!signedIn && (
              <Link href="/auth/login" style={{ fontFamily: UI, fontSize: 15, fontWeight: 500, color: P.secondary, textDecoration: 'none' }}>Sign in</Link>
            )}
            <Link href={primaryHref} style={{ fontFamily: UI, fontSize: 15, fontWeight: 600, color: '#fff', background: P.ink, padding: '12px 22px', borderRadius: 999, textDecoration: 'none', whiteSpace: 'nowrap' }}>
              {/* "Your matches" on phones (v2, question 3): the full label wraps at 360px. */}
              <span className="hidden sm:inline">{signedIn ? 'Your dashboard' : 'See your funding matches'}</span>
              <span className="sm:hidden">{signedIn ? 'Dashboard' : 'Your matches'}</span>
            </Link>
          </nav>
        </div>
      </header>

      <div style={{ width: '100%', maxWidth: 1000, margin: '0 auto', padding: '26px 16px 0', boxSizing: 'border-box', flexGrow: 1 }}>
        <main style={{ marginTop: 18, background: P.card, border: `1px solid ${P.border}`, borderRadius: 24, padding: 'clamp(24px, 4vw, 40px) clamp(18px, 5vw, 44px) clamp(24px, 3.5vw, 36px)' }}>

          {/* Chips: type, funder type, region, then sectors. */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ ...chip, background: ft.tint, color: ft.fg }}>{ft.label}</span>
            <span style={{ ...chip, background: P.chipNeutral.bg, color: P.chipNeutral.color }}>{funderTypeLabel}</span>
            {geography && <span style={{ ...chip, background: P.chipNeutral.bg, color: P.chipNeutral.color }}>{geography}</span>}
            {impactSectors.filter(s => IMPACT_SECTOR_LABELS[s]).map(s => {
              const c = sectorColour(s)
              return <span key={s} style={{ ...chip, background: c.bg, color: c.color }}>{IMPACT_SECTOR_LABELS[s]}</span>
            })}
          </div>

          <h1 style={{ fontFamily: UI, fontWeight: 700, fontSize: 'clamp(26px, 3.6vw, 36px)', lineHeight: 1.1, letterSpacing: '-0.02em', margin: '18px 0 0', color: P.ink }}>
            {String(grant.title ?? '')}
          </h1>

          {/* Facts strip: amount, closes, actions. Three cells on desktop; stacked on phone via the grid. */}
          <div className="record-facts" style={{ marginTop: 26, borderTop: `1px solid ${P.rule}`, borderBottom: `1px solid ${P.rule}`, padding: '20px 0', display: 'grid', gap: 22, alignItems: 'start' }}>
            <div>
              <div style={lbl}>Amount</div>
              <div style={{ fontFamily: UI, fontWeight: 700, fontSize: amountMuted ? 17 : 24, letterSpacing: '-0.015em', marginTop: 6, color: amountMuted ? P.muted : P.ink }}>{amountShown}</div>
            </div>
            <div>
              <div style={lbl}>{closes.label}</div>
              <div style={{ fontFamily: UI, fontWeight: 700, fontSize: closes.muted || closes.main.length > 18 ? 17 : 24, letterSpacing: '-0.015em', marginTop: 6, color: closes.muted ? P.muted : P.ink }}>{closes.main}</div>
              {(closes.sub || closes.pill) && (
                <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: P.secondary, flexWrap: 'wrap' }}>
                  {closes.sub && <span>{closes.sub}</span>}
                  {closes.pill && <span style={{ fontFamily: UI, background: P.gold, color: P.ink, fontWeight: 700, fontSize: 12, padding: '3px 9px', borderRadius: 999 }}>{closes.pill}</span>}
                </div>
              )}
            </div>
            <div>
              {applyUrl && (
                <a href={applyUrl} target="_blank" rel="noopener noreferrer" style={primaryBtn}>
                  Funder&rsquo;s page <ExternalLink style={{ width: 16, height: 16 }} />
                </a>
              )}
              {signedIn && (
                <SaveFundButton grantId={String(grant.id)} reminderAt={deadlineISO && !deadlinePassed && !isRolling ? deadlineISO : null} alreadySaved={alreadySaved} ui={UI} deep={P.ink} hair="rgba(29,60,62,0.35)" />
              )}
            </div>
          </div>

          {whatTheyFund && (
            <div style={{ marginTop: 28 }}>
              <div style={lbl}>What they fund</div>
              <p style={{ margin: '10px 0 0', fontSize: 17, lineHeight: 1.6, color: P.ink, maxWidth: '68ch', whiteSpace: 'pre-line' }}>{whatTheyFund}</p>
            </div>
          )}

          <div style={{ height: 1, background: P.hair, margin: '32px 0' }} />

          <h2 style={h2}>Who can apply</h2>
          <div className="record-who" style={{ display: 'grid', gap: 14, marginTop: 16, alignItems: 'stretch' }}>
            <div style={{ background: P.eligibleBg, borderRadius: 16, padding: '18px 20px' }}>
              <div style={{ fontFamily: UI, display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 16, color: P.eligibleFg, marginBottom: 12 }}>
                <Check style={{ width: 20, height: 20 }} />Eligible
              </div>
              {whoCanApply
                ? <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, whiteSpace: 'pre-line' }}>{whoCanApply}</p>
                : <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: P.muted }}>{ELIGIBILITY_NOT_STATED}</p>}
              {structuresStated && (
                <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {eligibleStructures.map(s => (
                    <span key={s} style={{ ...chip, background: '#fff', color: P.eligibleFg, fontSize: 13, padding: '4px 11px' }}>{STRUCTURE_LABELS[s] ?? s.replace(/_/g, ' ')}</span>
                  ))}
                </div>
              )}
            </div>
            {exclusions && (
              <div style={{ background: P.exclBg, borderRadius: 16, padding: '18px 20px' }}>
                <div style={{ fontFamily: UI, display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 16, color: P.exclFg, marginBottom: 12 }}>
                  <Ban style={{ width: 20, height: 20 }} />Exclusions
                </div>
                <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, whiteSpace: 'pre-line' }}>{exclusions}</p>
              </div>
            )}
          </div>

          {details.length > 0 && (
            <>
              <div style={{ height: 1, background: P.hair, margin: '32px 0' }} />
              <h2 style={h2}>{detailsHeading}</h2>
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column' }}>
                {details.map(({ key, label, Icon, text }) => (
                  <div key={key} className="record-row" style={{ display: 'grid', gap: '8px 28px', padding: '18px 0', borderTop: `1px solid ${P.hair}` }}>
                    <div style={{ fontFamily: UI, display: 'flex', alignItems: 'flex-start', gap: 9, fontWeight: 700, fontSize: 15, paddingTop: 2, color: P.ink }}>
                      <Icon style={{ width: 18, height: 18, flexShrink: 0, marginTop: 1, color: P.icon }} />{label}
                    </div>
                    <p style={facts}>{text}</p>
                  </div>
                ))}
              </div>
            </>
          )}

          {applyUrl && (
            <div style={{ marginTop: 32, paddingTop: 26, borderTop: `1px solid ${P.hair}` }}>
              <a href={applyUrl} target="_blank" rel="noopener noreferrer" style={{ ...primaryBtn, display: 'inline-flex', padding: '12px 22px' }}>
                Apply on the funder&rsquo;s website <ExternalLink style={{ width: 16, height: 16 }} />
              </a>
            </div>
          )}
        </main>

        {/* Sign-up band. Logged out only. The fallback line for everyone (v2). */}
        {!signedIn && (
          <section className="record-band" style={{ marginTop: 22, background: P.ink, color: P.cream, borderRadius: 24, padding: 'clamp(22px, 3vw, 28px) clamp(20px, 4vw, 36px)', display: 'grid', gap: 20, alignItems: 'center', position: 'relative', overflow: 'hidden' }}>
            <div>
              <div style={{ fontFamily: UI, fontWeight: 700, fontSize: 'clamp(20px, 2.4vw, 23px)', letterSpacing: '-0.015em' }}>Find funding matched to you</div>
              <p style={{ margin: '8px 0 0', fontSize: 15.5, lineHeight: 1.55, color: '#C7D3CE', maxWidth: 560 }}>
                More funding like this is open now. {MCP_BRAND_NAME} checks each fund against your organisation and shows you the ones worth applying for.
              </p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <Link href={signupHref} style={{ fontFamily: UI, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: P.cream, color: P.ink, borderRadius: 999, padding: '13px 24px', fontWeight: 600, fontSize: 15, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                See your funding matches <ArrowRight style={{ width: 16, height: 16 }} />
              </Link>
              <div style={{ marginTop: 10, fontSize: 13, color: '#A9BBB5', whiteSpace: 'nowrap' }}>{ctaSupportParts()[0]}</div>
            </div>
          </section>
        )}
      </div>

      {/* Footer: logo, and this record's hub links. Visible, never hidden. */}
      <footer style={{ marginTop: 36, background: '#fff', borderTop: `1px solid ${P.border}` }}>
        <div style={{ maxWidth: 1228, margin: '0 auto', padding: '30px 26px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: UI, fontWeight: 500, fontSize: 21, color: P.ink, textDecoration: 'none' }}>
            <LogoMark size={24} />{MCP_BRAND_NAME.toLowerCase()}
          </Link>
          <nav aria-label="Related funding" style={{ display: 'flex', gap: 22, fontSize: 13, flexWrap: 'wrap' }}>
            {primarySector && <Link href={`/grants/sector/${sectorSlug(primarySector)}`} style={{ color: P.muted, textDecoration: 'none' }}>{IMPACT_SECTOR_LABELS[primarySector]} funding</Link>}
            {regionHubOfRow && <Link href={`/grants/region/${regionHubOfRow.slug}`} style={{ color: P.muted, textDecoration: 'none' }}>{regionHubOfRow.slug === 'uk' ? 'UK-wide funding' : `Funding ${regionHubOfRow.phrase}`}</Link>}
            <Link href={`/grants/type/${typeHubOfRow.slug}`} style={{ color: P.muted, textDecoration: 'none' }}>{typeHubOfRow.label}</Link>
          </nav>
        </div>
      </footer>

      {/* The three responsive grids. Desktop: three fact cells, two boxes, label-beside-text rows, band in two columns. Phone: everything stacks. */}
      <style>{`
        .record-facts { grid-template-columns: 1fr; }
        .record-who   { grid-template-columns: 1fr; }
        .record-row   { grid-template-columns: 1fr; }
        .record-band  { grid-template-columns: 1fr; }
        @media (min-width: 760px) {
          .record-facts { grid-template-columns: 1fr 1fr 250px; }
          .record-facts > div + div { border-left: 1px solid rgba(29,60,62,0.12); padding-left: 28px; }
          .record-who   { grid-template-columns: 1fr 1fr; }
          .record-row   { grid-template-columns: 210px 1fr; }
          .record-band  { grid-template-columns: 1fr auto; }
        }
      `}</style>
    </div>
  )
}
