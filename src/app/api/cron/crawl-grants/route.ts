// Vercel Cron handler — called every day at 6am (split across 3 batches)
// Each batch covers ~15 sources to stay within function time limits.
//
// Batch routing (via ?batch=N query param, set in vercel.json crons):
//   Batch 1 → 06:00 — national/lottery funders + first CFs
//   Batch 2 → 06:05 — corporate funders + mid CFs
//   Batch 3 → 06:10 — Session-4b CFs + independent foundations
//   (no batch param) → all sources (manual/dev use)
import { NextRequest, NextResponse } from 'next/server'
import { crawlAllSources } from '@/lib/crawl'

export const dynamic    = 'force-dynamic'
export const maxDuration = 300   // Vercel Pro: allow up to 5 min per batch

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const batchParam = req.nextUrl.searchParams.get('batch')
  const batch = batchParam === '1' ? 1
              : batchParam === '2' ? 2
              : batchParam === '3' ? 3
              : batchParam === '4' ? 4
              : undefined

  try {
    const results = await crawlAllSources(batch)
    const active  = results.filter(r => r.error !== 'skipped' && r.error !== 'disabled')
    const total   = active.reduce((n, r) => n + r.upserted, 0)
    return NextResponse.json({ success: true, batch: batch ?? 'all', totalUpserted: total, results: active })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Crawl failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
