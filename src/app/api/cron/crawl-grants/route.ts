// Vercel Cron handler — called every day at 6am
// Crawls GOV.UK Find a Grant and 360Giving for new/updated grants
import { NextRequest, NextResponse } from 'next/server'
import { crawlAllSources } from '@/lib/crawl'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const results = await crawlAllSources()
    const total = results.reduce((n, r) => n + r.upserted, 0)
    return NextResponse.json({ success: true, totalUpserted: total, results })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Crawl failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
