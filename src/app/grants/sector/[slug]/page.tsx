import React from 'react'
import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import HubPage from '@/components/public/HubPage'
import { MCP_BRAND_NAME, MCP_APP_ORIGIN } from '@/lib/mcp-brand'
import {
  HUB_MIN_ROWS, IMPACT_SECTOR_LABELS, SECTOR_PHRASE,
  loadPublicRows, rowsForSector, sectorKeyFromSlug, sectorSlug,
} from '@/lib/hubs'
import { roundedCount } from '@/lib/hubs'
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params
  const key = sectorKeyFromSlug(slug)
  if (!key) return { title: `Not found | ${MCP_BRAND_NAME}` }
  const label = IMPACT_SECTOR_LABELS[key]
  const phrase = SECTOR_PHRASE[key] ?? label.toLowerCase()
  const url = `${MCP_APP_ORIGIN}/grants/sector/${sectorSlug(key)}`
  const title = `${label} funding for UK charities, CICs and social enterprises | ${MCP_BRAND_NAME}`
  const description = `Live grants, programmes and investment for organisations working in ${phrase}, each checked against the funder's own page. Amounts, deadlines and who can apply.`
  return {
    title, description,
    alternates: { canonical: url },
    openGraph: { type: 'website', title, description, url },
  }
}

export default async function SectorHubPage({ params }: Params) {
  const { slug } = await params
  const key = sectorKeyFromSlug(slug)
  if (!key) notFound()
  const all = await loadPublicRows()
  const rows = rowsForSector(all, key)
  if (rows.length < HUB_MIN_ROWS) notFound()
  const label = IMPACT_SECTOR_LABELS[key]
  const phrase = SECTOR_PHRASE[key] ?? label.toLowerCase()
  const path = `/grants/sector/${sectorSlug(key)}`

  return (
    <HubPage
      path={path}
      crumbs={[{ href: '/grants', label: 'Browse funding' }, { label }]}
      heading={`${label} funding`}
      intro={
        <>
          {cap(roundedCount(rows.length))} live opportunities for UK charities, CICs and social enterprises working in {phrase}: grants,
          programmes, social investment and in-kind support, soonest deadline first. Narrow by region from the list on the right,
          or see <Link href="/grants/type/grants" style={{ color: T_DEEP, fontWeight: 600 }}>grants only</Link>.
        </>
      }
      rows={rows}
      allRows={all}
    />
  )
}

const T_DEEP = '#1D3C3E'
