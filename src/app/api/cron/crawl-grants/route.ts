// Vercel Cron handler — called every day at 6am (split across 3 batches)
// Each batch covers ~15 sources to stay within function time limits.
//
// Batch routing (via ?batch=N query param, set in vercel.json crons):
//   Batch 1 → 06:00 — national/lottery funders + first CFs
//   Batch 2 → 06:05 — corporate funders + mid CFs
//   Batch 3 → 06:10 — Session-4b CFs + independent foundations
//   (no batch param) → all sources (manual/dev use)
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { crawlAllSources } from '@/lib/crawl'
import { classifyUnclassified } from '@/lib/classify'

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
              : batchParam === '5' ? 5
              : batchParam === '6' ? 6
              : batchParam === '7' ? 7
              : batchParam === '8' ? 8
              : batchParam === '9' ? 9
              : undefined

  try {
    const results = await crawlAllSources(batch)
    const active  = results.filter(r => r.error !== 'skipped' && r.error !== 'disabled')
    const total   = active.reduce((n, r) => n + r.upserted, 0)

    // Auto-classify any unclassified grants (new or previously missed).
    // Run after every batch so sectors/funding type are always populated.
    let classified = 0
    let classifyFailed = 0
    let unclassifiedRemaining: number | null = null
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } },
      )
      const r = await classifyUnclassified(supabase, 60)
      classified     = r.classified
      classifyFailed = r.failed

      // Backlog visibility — count unclassified rows still active after this
      // batch. Surfaces in Vercel logs so a quietly-failing classifier path
      // doesn't go unnoticed (which is exactly what produced the 152-row
      // backlog discovered on 2026-05-08).
      const { count } = await supabase
        .from('scraped_grants')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)
        .or('impact_sectors.is.null,impact_sectors.eq.{}')
      unclassifiedRemaining = count ?? null

      const BACKLOG_THRESHOLD = 10
      if (unclassifiedRemaining != null && unclassifiedRemaining > BACKLOG_THRESHOLD) {
        console.warn(
          `[crawl-grants] CLASSIFY_BACKLOG ${unclassifiedRemaining} active rows still unclassified after batch=${batch ?? 'all'} ` +
          `(classified=${classified}, failed=${classifyFailed}). ` +
          `Threshold=${BACKLOG_THRESHOLD}. If this persists, investigate the classifier path.`
        )
      }
    } catch (err) {
      console.error('[crawl-grants] Post-crawl classify failed:', err)
    }

    return NextResponse.json({
      success: true,
      batch: batch ?? 'all',
      totalUpserted: total,
      classify: { classified, failed: classifyFailed, unclassifiedRemaining },
      results: active,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Crawl failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
