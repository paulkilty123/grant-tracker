import React from 'react'
import Link from 'next/link'
import type { Metadata } from 'next'
import PublicNav, { PUBLIC_T as T, PUBLIC_UI as UI, PUBLIC_BODY as BODY } from '@/components/public/PublicNav'
import { GrantRow, HubCta, HubLinks } from '@/components/public/HubPage'
import { MCP_BRAND_NAME, MCP_APP_ORIGIN } from '@/lib/mcp-brand'
import { hubCounts, loadPublicRows, sortForHub } from '@/lib/hubs'

// The front door of the public catalogue. Links to every hub, and lists what
// closes soonest, so a crawler (or a person) arriving here is one click from
// any live row. See src/lib/hubs.ts for why.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: `Browse UK funding for charities, CICs and social enterprises | ${MCP_BRAND_NAME}`,
  description: 'Every live grant, programme, social investment and in-kind offer in the Shoots catalogue, browsable by area of work, region and funding type. Each entry is checked against the funder\'s own page.',
  alternates: { canonical: `${MCP_APP_ORIGIN}/grants` },
  openGraph: {
    type: 'website',
    title: `Browse UK funding | ${MCP_BRAND_NAME}`,
    description: 'Live grants, programmes, investment and in-kind support for UK charities, CICs and social enterprises, by sector, region and type.',
    url: `${MCP_APP_ORIGIN}/grants`,
  },
}

export default async function GrantsIndexPage() {
  const signupHref = '/signup'
  const todayISO = new Date().toISOString().slice(0, 10)
  const all = await loadPublicRows()
  const counts = hubCounts(all)
  const closingSoon = sortForHub(all.filter(r => r.deadline && r.deadline >= todayISO), todayISO).slice(0, 12)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Browse UK funding',
    url: `${MCP_APP_ORIGIN}/grants`,
    isPartOf: { '@type': 'WebSite', name: MCP_BRAND_NAME, url: MCP_APP_ORIGIN },
  }

  return (
    <div style={{ minHeight: '100vh', background: T.cream, color: T.charcoal, fontFamily: BODY }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <PublicNav signupHref={signupHref} />
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 26px 70px' }}>
        <div style={{ background: '#fff', border: `1px solid ${T.hair}`, borderRadius: 18, padding: '30px 32px' }}>
          <h1 style={{ fontFamily: UI, fontSize: 29, fontWeight: 600, lineHeight: 1.15, letterSpacing: '-0.028em', color: T.deep, margin: '0 0 10px' }}>
            Browse UK funding
          </h1>
          <p style={{ fontSize: 15.5, lineHeight: 1.55, color: T.inkMuted, margin: '0 0 26px', maxWidth: '62ch' }}>
            Grants, programmes, social investment and in-kind support for UK charities, CICs and social enterprises.
            Every entry is live and checked against the funder&rsquo;s own page. Pick a funding type, a region or an area of work.
          </p>
          <HubLinks counts={counts} />

          <h2 style={{ fontFamily: UI, fontSize: 13, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.deep, margin: '34px 0 12px' }}>
            Closing soonest
          </h2>
          <ul style={{ margin: 0, padding: 0, borderBottom: `1px solid ${T.hair}` }}>
            {closingSoon.map(r => <GrantRow key={r.id} row={r} todayISO={todayISO} bare />)}
          </ul>
          <p style={{ fontSize: 14, color: T.inkMuted, margin: '14px 0 0' }}>
            <Link href="/grants/type/grants" style={{ color: T.deep, fontWeight: 600 }}>All grants</Link>
            {' '}lists more. Closing dates and amounts show once you have an account.
          </p>
          <HubCta signupHref={signupHref} />
        </div>
        <div style={{ textAlign: 'center', marginTop: 26 }}>
          <p style={{ fontSize: 13, lineHeight: 1.6, color: T.inkPlace, margin: 0 }}>
            {MCP_BRAND_NAME} keeps a curated catalogue of live, verified UK funding opportunities, every entry traced back to the
            funder&rsquo;s own published page.
          </p>
        </div>
      </main>
    </div>
  )
}
