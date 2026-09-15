import React from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import HubPage from '@/components/public/HubPage'
import { MCP_BRAND_NAME, MCP_APP_ORIGIN } from '@/lib/mcp-brand'
import { HUB_MIN_ROWS, loadPublicRows, rowsForType, typeHub } from '@/lib/hubs'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ slug: string }> }

const INTRO: Record<string, string> = {
  grants:     'Money you do not pay back, from trusts, foundations, community foundations, corporates and the lottery.',
  programmes: 'Accelerators, incubators and support programmes with an application and an intake. What you get is time, expertise and a cohort rather than a cheque, though some carry a grant too.',
  investment: 'Loans, blended finance and equity for charities and social enterprises with trading income. Repayable, so the numbers need to work.',
  'in-kind':  'Free or subsidised goods, services, space and expertise. No cash changes hands, but the value is real.',
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params
  const hub = typeHub(slug)
  if (!hub) return { title: `Not found | ${MCP_BRAND_NAME}` }
  const url = `${MCP_APP_ORIGIN}/grants/type/${hub.slug}`
  const title = `${hub.noun} for UK charities, CICs and social enterprises | ${MCP_BRAND_NAME}`
  const description = `${INTRO[hub.slug]} Every entry is live and checked against the funder's own page. Amounts, deadlines and who can apply.`
  return {
    title, description,
    alternates: { canonical: url },
    openGraph: { type: 'website', title, description, url },
  }
}

export default async function TypeHubPage({ params }: Params) {
  const { slug } = await params
  const hub = typeHub(slug)
  if (!hub) notFound()
  const all = await loadPublicRows()
  const rows = rowsForType(all, hub)
  if (rows.length < HUB_MIN_ROWS) notFound()
  const path = `/grants/type/${hub.slug}`

  return (
    <HubPage
      path={path}
      crumbs={[{ href: '/grants', label: 'Browse funding' }, { label: hub.label }]}
      heading={hub.noun}
      intro={<>{INTRO[hub.slug]} {rows.length} live, soonest deadline first.</>}
      rows={rows}
      allRows={all}
    />
  )
}
