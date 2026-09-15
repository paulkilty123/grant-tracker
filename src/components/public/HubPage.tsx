import React from 'react'
import Link from 'next/link'
import { MapPin, Calendar, ArrowRight } from 'lucide-react'
import PublicNav, { PUBLIC_T as T, PUBLIC_UI as UI, PUBLIC_BODY as BODY } from '@/components/public/PublicNav'
import { FUNDING_TYPE_COLOUR } from '@/lib/funding-type-colours'
import { formatRange, locationLabel } from '@/lib/utils'
import { MCP_BRAND_NAME, MCP_APP_ORIGIN } from '@/lib/mcp-brand'
import {
  grantPath, hubCounts, sortForHub, typeHubForRow,
  type HubRow, type HubCounts,
} from '@/lib/hubs'

// ── Shared pieces for the browse pages ──────────────────────────────────────
//
// One list shape for every hub, so the sector, region and type pages differ
// only in which rows they hold and what the heading says. The rows are one
// line each: 460 community rows on a page is fine as a list and unreadable as
// cards. Each row is one link, and that link is the point of the page.

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function humaniseDate(s: string | null): string | null {
  if (!s) return null
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return s
  return `${parseInt(m[3], 10)} ${MONTHS_SHORT[parseInt(m[2], 10) - 1]} ${m[1]}`
}

export function deadlineText(row: HubRow, todayISO: string): { text: string; past: boolean } {
  if (row.is_rolling) return { text: 'Rolling', past: false }
  if (!row.deadline) return { text: 'No fixed deadline', past: false }
  const past = row.deadline < todayISO
  return { text: past ? `Closed ${humaniseDate(row.deadline)}` : `Apply by ${humaniseDate(row.deadline)}`, past }
}

export const hubBreadcrumb: React.CSSProperties = {
  fontFamily: UI, fontSize: 13, color: T.inkMuted, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '0 0 18px',
}

export function Crumbs({ items }: { items: { href?: string; label: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" style={hubBreadcrumb}>
      {items.map((it, i) => (
        <React.Fragment key={`${it.label}-${i}`}>
          {i > 0 && <span aria-hidden style={{ color: T.ghost }}>/</span>}
          {it.href
            ? <Link href={it.href} style={{ color: T.inkMuted, textDecoration: 'none' }}>{it.label}</Link>
            : <span style={{ color: T.deep, fontWeight: 600 }}>{it.label}</span>}
        </React.Fragment>
      ))}
    </nav>
  )
}

/** One catalogue row, as a single link line. */
export function GrantRow({ row, todayISO, showRegion = true }: { row: HubRow; todayISO: string; showRegion?: boolean }) {
  const ft = FUNDING_TYPE_COLOUR[typeHubForRow(row).typeKey]
  const amount = formatRange(row.amount_min, row.amount_max, Boolean(row.amount_undisclosed), row.funding_type)
  const dl = deadlineText(row, todayISO)
  const where = locationLabel(row.is_local, row.location_tag)
  return (
    <li style={{ listStyle: 'none', margin: 0, borderTop: `1px solid ${T.hair}` }}>
      <Link
        href={grantPath(row)}
        style={{
          display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 14, alignItems: 'center',
          padding: '13px 4px', textDecoration: 'none', color: T.deep,
        }}
      >
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontFamily: UI, fontSize: 16, fontWeight: 600, letterSpacing: '-0.012em', lineHeight: 1.3, color: T.deep }}>
            {row.title}
          </span>
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginTop: 4, fontSize: 13.5, color: T.inkMuted, fontFamily: BODY }}>
            {row.funder && <span>{row.funder}</span>}
            <span style={{ fontFamily: UI, fontWeight: 600, color: T.deep }}>{amount}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: dl.past ? T.inkPlace : T.inkMuted }}>
              <Calendar style={{ width: 12, height: 12 }} />{dl.text}
            </span>
            {showRegion && where && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <MapPin style={{ width: 12, height: 12 }} />{where}
              </span>
            )}
          </span>
        </span>
        <span style={{
          fontFamily: UI, fontSize: 11.5, fontWeight: 600, padding: '5px 12px', borderRadius: 999,
          background: ft.tint, color: ft.fg, whiteSpace: 'nowrap',
        }}>
          {ft.label}
        </span>
      </Link>
    </li>
  )
}

/** The mesh: every hub links to every other hub, with counts. */
export function HubLinks({ counts, current }: { counts: HubCounts; current?: string }) {
  const group = (title: string, items: { href: string; label: string; count: number }[]) => (
    <div>
      <h3 style={{ fontFamily: UI, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.inkPlace, margin: '0 0 10px' }}>{title}</h3>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: 7 }}>
        {items.map(it => {
          const active = it.href === current
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                aria-current={active ? 'page' : undefined}
                style={{
                  fontFamily: UI, fontSize: 12.5, fontWeight: 600, padding: '6px 12px', borderRadius: 999,
                  textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: active ? T.deep : '#fff', color: active ? T.cream : T.deep,
                  border: `1px solid ${active ? T.deep : T.ghost}`,
                }}
              >
                {it.label}
                <span style={{ fontWeight: 500, color: active ? 'rgba(246,241,231,0.75)' : T.inkPlace }}>{it.count}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
  return (
    <div style={{ display: 'grid', gap: 22 }}>
      {group('By funding type', counts.types.map(t => ({ href: `/grants/type/${t.slug}`, label: t.label, count: t.count })))}
      {group('By region', counts.regions.map(r => ({ href: `/grants/region/${r.slug}`, label: r.label, count: r.count })))}
      {group('By area of work', counts.sectors.map(s => ({ href: `/grants/sector/${s.slug}`, label: s.label, count: s.count })))}
    </div>
  )
}

export function HubCta({ signupHref }: { signupHref: string }) {
  return (
    <div style={{ background: T.deep, borderRadius: 18, padding: '26px 28px', marginTop: 30, color: T.cream }}>
      <h2 style={{ fontFamily: UI, fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', margin: '0 0 8px', color: T.cream }}>
        See which of these you can actually apply for
      </h2>
      <p style={{ fontFamily: BODY, fontSize: 14.5, lineHeight: 1.55, margin: '0 0 18px', color: 'rgba(246,241,231,0.85)', maxWidth: '56ch' }}>
        Tell {MCP_BRAND_NAME} what your organisation is and does, and every opportunity in the catalogue is checked against it: legal structure, location, income, and what the funder says it will not fund.
      </p>
      <Link
        href={signupHref}
        style={{
          fontFamily: UI, fontSize: 15, fontWeight: 600, color: T.deep, background: T.cream,
          padding: '13px 24px', borderRadius: 999, textDecoration: 'none',
          display: 'inline-flex', alignItems: 'center', gap: 9,
        }}
      >
        Find funding for your organisation
        <ArrowRight style={{ width: 15, height: 15 }} />
      </Link>
    </div>
  )
}

// ── The page ─────────────────────────────────────────────────────────────────

export interface HubPageProps {
  /** Page path, for the active state in the mesh and the canonical. */
  path: string
  crumbs: { href?: string; label: string }[]
  heading: string
  intro: React.ReactNode
  rows: HubRow[]
  allRows: HubRow[]
  /** Region hubs already say where; the region column is noise there. */
  showRegion?: boolean
  /** Extra copy under the list, e.g. the UK-wide note on a nation page. */
  footnote?: React.ReactNode
}

export default function HubPage(p: HubPageProps) {
  const signupHref = '/signup'
  const todayISO = new Date().toISOString().slice(0, 10)
  const rows = sortForHub(p.rows, todayISO)
  const counts = hubCounts(p.allRows)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: p.heading,
    url: `${MCP_APP_ORIGIN}${p.path}`,
    isPartOf: { '@type': 'WebSite', name: MCP_BRAND_NAME, url: MCP_APP_ORIGIN },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: rows.length,
      itemListElement: rows.map((r, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: r.title,
        url: `${MCP_APP_ORIGIN}${grantPath(r)}`,
      })),
    },
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: p.crumbs.map((c, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: c.label,
        ...(c.href ? { item: `${MCP_APP_ORIGIN}${c.href}` } : {}),
      })),
    },
  }

  return (
    <div style={{ minHeight: '100vh', background: T.cream, color: T.charcoal, fontFamily: BODY }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <PublicNav signupHref={signupHref} />
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 26px 70px' }}>
        <Crumbs items={p.crumbs} />
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 28, alignItems: 'start' }} className="hub-grid">
          <div style={{ background: '#fff', border: `1px solid ${T.hair}`, borderRadius: 18, padding: '30px 32px', minWidth: 0 }}>
            <h1 style={{ fontFamily: UI, fontSize: 29, fontWeight: 600, lineHeight: 1.15, letterSpacing: '-0.028em', color: T.deep, margin: '0 0 10px' }}>
              {p.heading}
            </h1>
            <p style={{ fontSize: 15.5, lineHeight: 1.55, color: T.inkMuted, margin: '0 0 22px', maxWidth: '62ch' }}>{p.intro}</p>
            {rows.length === 0 ? (
              <p style={{ fontSize: 15, color: T.inkMuted }}>Nothing live in this list right now. The catalogue is checked daily, so it is worth coming back.</p>
            ) : (
              <ul style={{ margin: 0, padding: 0, borderBottom: `1px solid ${T.hair}` }}>
                {rows.map(r => <GrantRow key={r.id} row={r} todayISO={todayISO} showRegion={p.showRegion ?? true} />)}
              </ul>
            )}
            {p.footnote && <p style={{ fontSize: 14, lineHeight: 1.55, color: T.inkMuted, margin: '18px 0 0' }}>{p.footnote}</p>}
            <HubCta signupHref={signupHref} />
          </div>
          <aside style={{ background: '#fff', border: `1px solid ${T.hair}`, borderRadius: 18, padding: '22px 22px', position: 'sticky', top: 20 }}>
            <HubLinks counts={counts} current={p.path} />
          </aside>
        </div>
        <div style={{ textAlign: 'center', marginTop: 26 }}>
          <p style={{ fontSize: 13, lineHeight: 1.6, color: T.inkPlace, margin: 0 }}>
            {MCP_BRAND_NAME} keeps a curated catalogue of live, verified UK funding opportunities, every entry traced back to the
            funder&rsquo;s own published page.
          </p>
        </div>
      </main>
      <style>{`@media (max-width: 860px) { .hub-grid { grid-template-columns: minmax(0, 1fr) !important; } .hub-grid aside { position: static !important; } }`}</style>
    </div>
  )
}
