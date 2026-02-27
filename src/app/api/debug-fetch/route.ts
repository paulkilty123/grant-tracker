import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'Missing url param' }, { status: 400 })

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GrantTracker/1.0)',
        'Accept': 'text/html,*/*',
        'Accept-Language': 'en-GB,en;q=0.9',
      },
      signal: AbortSignal.timeout(15_000),
    })

    const html = await res.text()
    return NextResponse.json({
      status: res.status,
      length: html.length,
      hasResourceTeaser: html.includes('resource_teaser'),
      hasCardBody: html.includes('card__body'),
      hasCardNavy: html.includes('card--navy'),
      hasCardContainer: html.includes('card__container'),
      hasTitle: html.includes('class="title"'),
      hasFundBox: html.includes('fund-box'),
      hasTextSide: html.includes('text-side'),
      snippet: html.substring(0, 1200),
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
