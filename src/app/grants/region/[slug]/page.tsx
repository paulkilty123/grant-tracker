import React from 'react'
import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import HubPage from '@/components/public/HubPage'
import { MCP_BRAND_NAME, MCP_APP_ORIGIN } from '@/lib/mcp-brand'
import { HUB_MIN_ROWS, loadPublicRows, regionHub, rowsForRegion } from '@/lib/hubs'
import { roundedCount } from '@/lib/hubs'
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ slug: string }> }

function headingFor(slug: string, label: string): string {
  if (slug === 'uk') return 'UK-wide funding'
  if (slug === 'international') return 'Funding for international work'
  return `Funding in ${label}`
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params
  const hub = regionHub(slug)
  if (!hub) return { title: `Not found | ${MCP_BRAND_NAME}` }
  const url = `${MCP_APP_ORIGIN}/grants/region/${hub.slug}`
  const title = slug === 'uk'
    ? `UK-wide grants and funding for charities, CICs and social enterprises | ${MCP_BRAND_NAME}`
    : `Grants and funding for charities, CICs and social enterprises ${hub.phrase} | ${MCP_BRAND_NAME}`
  const description = slug === 'uk'
    ? 'Live grants, programmes and investment open to organisations anywhere in the UK, each checked against the funder\'s own page. Amounts, deadlines and who can apply.'
    : `Live grants, programmes and investment for organisations ${hub.phrase}, each checked against the funder's own page. Amounts, deadlines and who can apply.`
  return {
    title, description,
    alternates: { canonical: url },
    openGraph: { type: 'website', title, description, url },
  }
}

export default async function RegionHubPage({ params }: Params) {
  const { slug } = await params
  const hub = regionHub(slug)
  if (!hub) notFound()
  const all = await loadPublicRows()
  const rows = rowsForRegion(all, hub)
  if (rows.length < HUB_MIN_ROWS) notFound()
  const path = `/grants/region/${hub.slug}`
  const isNation = !['uk', 'international'].includes(hub.slug)

  return (
    <HubPage
      path={path}
      crumbs={[{ href: '/grants', label: 'Browse funding' }, { label: hub.label }]}
      heading={headingFor(hub.slug, hub.label)}
      intro={
        hub.slug === 'uk' ? (
          <>
            {cap(roundedCount(rows.length))} live opportunities open to charities, CICs and social enterprises anywhere in the UK: the soonest deadlines, then the most recently checked.
            Funders that only work in one nation or region are on their own pages.
          </>
        ) : hub.slug === 'international' ? (
          <>
            {cap(roundedCount(rows.length))} live opportunities for UK organisations whose work reaches beyond the UK: the soonest deadlines, then the most recently checked.
          </>
        ) : (
          <>
            {cap(roundedCount(rows.length))} live opportunities from funders that work specifically {hub.phrase}: the soonest deadlines, then the most recently checked.
            Most <Link href="/grants/region/uk" style={{ color: T_DEEP, fontWeight: 600 }}>UK-wide funding</Link> is open to
            organisations {hub.phrase} too.
          </>
        )
      }
      rows={rows}
      allRows={all}
      showRegion={hub.slug !== 'uk'}
      footnote={isNation ? (
        <>
          Local funders often restrict to one county, city or borough. The location shown on each row is the funder&rsquo;s own
          stated area, so check it before you spend time on an application.
        </>
      ) : undefined}
    />
  )
}

const T_DEEP = '#1D3C3E'
