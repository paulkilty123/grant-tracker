// Weekly cron — runs every Wednesday at 04:00 UTC
// Checks all active funder watchlist pages for content changes.
// On first run it builds a baseline fingerprint; on subsequent runs it diffs
// against the stored fingerprint and raises a watchlist_alert if anything changed.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { recordRun } from '@/lib/admin/cron-runs'
import { hasCollapsed, flagRowsForUrl } from '@/lib/watchlist-signals'

export const dynamic     = 'force-dynamic'
// Was 60s, which with a 12s per-site timeout and a sequential loop meant the
// function was killed long before it reached the end of a 239-entry list. Raised
// in line with the other catalogue crons (validate-urls uses 300).
export const maxDuration = 270

// Fetch ceiling; the wall-clock budget below decides how many actually get
// checked. Over-fetching is deliberate so a run of fast-responding sites can use
// its whole budget rather than idling.
//
// 2026-08-16: raised from 120. The cron runs Sundays and Wednesdays, so 120 a
// run cycled 239 active entries in exactly 7 days with no headroom at all.
// Auto-enrolling the 50 between-rounds rows (migration 057) took the list to
// 288, which at 120 would stretch the cycle past a fortnight and mean a
// between-rounds funder could reopen and close again before we looked. The last
// two runs finished in 126s and 146s against a 240s budget, so the wall clock —
// which is the real limit, not this number — has the room.
const BATCH_LIMIT    = 150
const TIME_BUDGET_MS = 240_000

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
  last_count: number | null
}

type CheckResult = {
  name: string
  status: 'ok' | 'baseline' | 'changed' | 'collapsed' | 'error'
  detail?: string
  /** How many catalogue rows this change pushed to the front of the verify queue. */
  flagged?: number
}

// `hasCollapsed` and `flagRowsForUrl` live in @/lib/watchlist-signals — a route
// file may only export its handlers and segment config, so a helper declared
// here could never be imported by a test.

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = req.headers.get('authorization') ?? ''
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  let httpStatus = 200
  const payload = await recordRun('check-watchlist', async () => {
    const supabase = getAdminClient()
    const ranAt    = new Date().toISOString()

    // Oldest-checked first, never-checked before that, and capped to what one run
    // can actually finish.
    //
    // 2026-07-25: this used to select every active entry with NO .order() and NO
    // .limit(), then walk them sequentially under a 60s maxDuration with a 12s
    // per-site timeout. The function was killed partway through every time, and
    // because the order was unspecified it re-checked the same head-of-relation
    // rows each week. Result: 64 of 239 entries stamped per run, and 121 of 239
    // (51%) had last_checked IS NULL — never checked once, ever. Those have no
    // baseline fingerprint, so they could never raise a listing_changed alert.
    // The weekly alerts that DID fire masked the missing half.
    //
    // Ordering by last_checked NULLS FIRST makes coverage rotate: never-checked
    // entries lead, then the stalest. Every entry is now reached within a few
    // weeks instead of never.
    const { data: entries, error } = await supabase
      .from('funder_watchlist')
      .select('id, name, listing_url, last_fingerprint, last_count')
      .eq('status', 'active')
      .order('last_checked', { ascending: true, nullsFirst: true })
      .limit(BATCH_LIMIT)

    if (error) { httpStatus = 500; return { error: error.message } }

    const results: CheckResult[] = []
    const startedAt = Date.now()
    let skippedForBudget = 0

    // Process sequentially — we're checking external sites, no need to hammer
    for (const entry of (entries ?? []) as WatchlistEntry[]) {
      // Same wall-clock guard as the fetch cap: stop before the platform kills us
      // mid-check, so last_checked is stamped for everything we did reach and the
      // rotation advances cleanly.
      if (Date.now() - startedAt > TIME_BUDGET_MS) {
        skippedForBudget = (entries ?? []).length - results.length
        break
      }
      try {
        const res = await fetch(entry.listing_url, {
          signal: AbortSignal.timeout(12000),
          // Chrome-style headers — bare 'GrantTracker/1.0' was tripping
          // Cloudflare/WAFs on Berkshire CF, Kent CF, Somerset CF etc. and
          // returning 404/403, marking healthy listing pages as page_down.
          // 'br' deliberately excluded from Accept-Encoding (Node fetch
          // doesn't auto-decompress Brotli).
          headers: {
            'User-Agent':       'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept':           'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language':  'en-GB,en;q=0.9',
            'Accept-Encoding':  'gzip, deflate',
            'Sec-Fetch-Dest':   'document',
            'Sec-Fetch-Mode':   'navigate',
            'Sec-Fetch-Site':   'none',
            'Upgrade-Insecure-Requests': '1',
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
          // A page that lost most of its content is a different event from a
          // page that edited a sentence, and it is the one signal here that is
          // mechanically precise. Named separately so the feed can be triaged
          // and so the admin screen does not call a takedown a "listing change".
          const collapsed = hasCollapsed(entry.last_count, count)

          await supabase.from('watchlist_alerts').insert({
            watchlist_id:    entry.id,
            alert_type:      collapsed ? 'listing_collapsed' : 'listing_changed',
            snapshot_before: entry.last_fingerprint,
            snapshot_after:  collapsed
              ? `${entry.last_count ?? 0} items → ${count}\n\n${fingerprint}`
              : fingerprint,
          })
          await supabase.from('funder_watchlist').update({
            last_checked:     ranAt,
            last_fingerprint: fingerprint,
            last_count:       count,
            last_error:       null,
          }).eq('id', entry.id)

          const flagged = await flagRowsForUrl(
            supabase, entry.listing_url, collapsed ? 'listing_collapsed' : 'watchlist_change',
          )
          results.push({
            name: entry.name,
            status: collapsed ? 'collapsed' : 'changed',
            detail: collapsed ? `${entry.last_count ?? 0} items → ${count}` : undefined,
            flagged,
          })
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

    if (skippedForBudget > 0) {
      console.log(
        `[check-watchlist] time budget spent after ${results.length} entries; ` +
        `${skippedForBudget} deferred to the next run (they lead the rotation)`
      )
    }

    return {
      ranAt,
      checked:   results.length,
      baseline:  results.filter(r => r.status === 'baseline').length,
      ok:        results.filter(r => r.status === 'ok').length,
      changed:   results.filter(r => r.status === 'changed').length,
      collapsed: results.filter(r => r.status === 'collapsed').length,
      errors:    results.filter(r => r.status === 'error').length,
      // Catalogue rows this run pushed to the front of the verification queue.
      // The number that says whether the watchlist is reaching the catalogue at
      // all: for most of its life it has been raising alerts about funders whose
      // rows had no way of hearing about them.
      queued:    results.reduce((n, r) => n + (r.flagged ?? 0), 0),
      skippedForBudget,
      elapsedMs: Date.now() - startedAt,
      results,
    }
  })
  return NextResponse.json(payload, { status: httpStatus })
}
