// Weekly cron — runs every Wednesday at 04:00 UTC
// Checks all active funder watchlist pages for content changes.
// On first run it builds a baseline fingerprint; on subsequent runs it diffs
// against the stored fingerprint and raises a watchlist_alert if anything changed.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ── Fingerprint extraction ────────────────────────────────────────────────────
// Pulls text from h1–h4, <strong>, and prominent <li> tags.
// Normalises to lowercase, deduplicates, and sorts so that cosmetic
// re-orderings don't trigger false positives.
function extractFingerprint(html: string): { fingerprint: string; count: number } {
  const items: string[] = []

  const patterns = [
    /<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi,
    /<strong[^>]*>([\s\S]*?)<\/strong>/gi,
  ]

  for (const re of patterns) {
    let m: RegExpExecArray | null
    while ((m = re.exec(html)) !== null) {
      const text = m[1]
        .replace(/<[^>]+>/g, '')   // strip inner tags
        .replace(/&amp;/g,  '&')
        .replace(/&nbsp;/g, ' ')
        .replace(/&#\d+;/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
      if (text.length > 4 && text.length < 200) {
        items.push(text)
      }
    }
  }

  const unique = Array.from(new Set(items)).sort()
  return {
    fingerprint: unique.join(' || '),
    count: unique.length,
  }
}

type WatchlistEntry = {
  id: string
  name: string
  listing_url: string
  last_fingerprint: string | null
}

type CheckResult = {
  name: string
  status: 'ok' | 'baseline' | 'changed' | 'error'
  detail?: string
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = req.headers.get('authorization') ?? ''
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const supabase = getAdminClient()
  const ranAt    = new Date().toISOString()

  const { data: entries, error } = await supabase
    .from('funder_watchlist')
    .select('id, name, listing_url, last_fingerprint')
    .eq('status', 'active')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results: CheckResult[] = []

  // Process sequentially — we're checking ~20 external sites, no need to hammer
  for (const entry of (entries ?? []) as WatchlistEntry[]) {
    try {
      const res = await fetch(entry.listing_url, {
        signal: AbortSignal.timeout(12000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; GrantTracker/1.0; +https://grant-tracker-kappa.vercel.app)',
          'Accept': 'text/html',
        },
      })

      if (!res.ok) {
        await supabase.from('watchlist_alerts').insert({
          watchlist_id:   entry.id,
          alert_type:     'page_down',
          snapshot_after: `HTTP ${res.status} from ${entry.listing_url}`,
        })
        await supabase.from('funder_watchlist').update({
          last_checked: ranAt,
          last_error:   `HTTP ${res.status}`,
        }).eq('id', entry.id)
        results.push({ name: entry.name, status: 'error', detail: `HTTP ${res.status}` })
        continue
      }

      const html                   = await res.text()
      const { fingerprint, count } = extractFingerprint(html)

      if (!entry.last_fingerprint) {
        // First run — store the baseline, no alert needed
        await supabase.from('funder_watchlist').update({
          last_checked:     ranAt,
          last_fingerprint: fingerprint,
          last_count:       count,
          last_error:       null,
        }).eq('id', entry.id)
        results.push({ name: entry.name, status: 'baseline', detail: `${count} items indexed` })
        continue
      }

      if (fingerprint !== entry.last_fingerprint) {
        // Something changed — raise an alert for admin review
        await supabase.from('watchlist_alerts').insert({
          watchlist_id:    entry.id,
          alert_type:      'listing_changed',
          snapshot_before: entry.last_fingerprint,
          snapshot_after:  fingerprint,
        })
        await supabase.from('funder_watchlist').update({
          last_checked:     ranAt,
          last_fingerprint: fingerprint,
          last_count:       count,
          last_error:       null,
        }).eq('id', entry.id)
        results.push({ name: entry.name, status: 'changed' })
      } else {
        await supabase.from('funder_watchlist').update({
          last_checked: ranAt,
          last_count:   count,
          last_error:   null,
        }).eq('id', entry.id)
        results.push({ name: entry.name, status: 'ok' })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await supabase.from('funder_watchlist').update({
        last_checked: ranAt,
        last_error:   msg.slice(0, 300),
      }).eq('id', entry.id)
      results.push({ name: entry.name, status: 'error', detail: msg })
    }
  }

  return NextResponse.json({
    ranAt,
    checked:  results.length,
    baseline: results.filter(r => r.status === 'baseline').length,
    ok:       results.filter(r => r.status === 'ok').length,
    changed:  results.filter(r => r.status === 'changed').length,
    errors:   results.filter(r => r.status === 'error').length,
    results,
  })
}
