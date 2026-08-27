// Weekly cron — runs every Wednesday at 04:00 UTC
// Checks all active funder watchlist pages for content changes.
// On first run it builds a baseline fingerprint; on subsequent runs it diffs
// against the stored fingerprint and raises a watchlist_alert if anything changed.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { recordRun } from '@/lib/admin/cron-runs'
import { hasCollapsed, flagRowsForUrl, extractFingerprint, type ReadVia } from '@/lib/watchlist-signals'

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

/**
 * Read a listing page, the same way every other job in this codebase reads one.
 *
 * Direct fetch first, reader proxy second. On 26 August this job reported 16
 * errors in 150 pages and 13 were a flat HTTP 403: Camden, Kensington & Chelsea,
 * Power to Change, Wolfson, Inspiring Scotland, Ashoka. Those hosts 403 every
 * non-browser client, so they had never been checked once, had no baseline, and
 * could never raise a listing_changed alert. The proxy is the sanctioned route
 * into them and enrichment and verification have both used it for weeks; this
 * was the only job still reading direct-only.
 *
 * The proxy is only ever reached AFTER a direct read fails, so it costs nothing
 * on the ~90% of hosts that answer normally.
 *
 * Throws when neither reader can deliver, so the caller's existing catch records
 * `last_error` exactly as before. The message names both attempts, because "HTTP
 * 403" alone stopped being the whole story the moment there was a second route.
 */
async function readListing(url: string, preferProxy = false): Promise<{ text: string; via: ReadVia }> {
  // A host that blocked us last time will block us again, and the direct attempt
  // costs 12 seconds of a 240 second budget to learn nothing. With 39 entries in
  // that state, trying direct first every run would spend half the budget on
  // known-dead attempts and shorten the rotation for everyone else. So an entry
  // whose baseline came from the proxy goes straight back to the proxy, and only
  // falls back to a direct read if the proxy fails — which also lets a funder
  // who lifts their block return to direct reads on their own.
  let proxyFirstFailure = ''
  if (preferProxy) {
    try {
      return await readViaProxy(url)
    } catch (err) {
      // Fall through to the direct attempt, but keep what the proxy said. This
      // job's whole failure mode was errors that named one attempt and hid the
      // other.
      proxyFirstFailure = err instanceof Error ? err.message : String(err)
    }
  }

  let direct: string
  try {
    const res = await fetch(url, {
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
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return { text: await res.text(), via: 'direct' }
  } catch (err) {
    direct = err instanceof Error ? err.message : String(err)
  }

  if (proxyFirstFailure) throw new Error(`${proxyFirstFailure}; then direct: ${direct}`)
  if (!process.env.READER_PROXY_URL) throw new Error(direct)

  try {
    return await readViaProxy(url)
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err)
    throw new Error(`${direct}; ${why}`)
  }
}

async function readViaProxy(url: string): Promise<{ text: string; via: ReadVia }> {
  const base = process.env.READER_PROXY_URL
  if (!base) throw new Error('reader proxy not configured')
  {
    const res = await fetch(`${base.replace(/\/$/, '')}/${url}`, {
      signal: AbortSignal.timeout(30000),
      headers: {
        Accept: 'text/plain',
        ...(process.env.READER_PROXY_KEY ? { Authorization: `Bearer ${process.env.READER_PROXY_KEY}` } : {}),
      },
    })
    if (!res.ok) throw new Error(`reader proxy HTTP ${res.status}`)
    const text = await res.text()
    // A bot challenge comes back through the proxy as a short "checking your
    // browser" page with HTTP 200. Fingerprinting that would store a baseline
    // for a page nobody has read, which is worse than recording the failure:
    // the next real read would then look like a change.
    if (text.length < 200 || /robot challenge|checking the site connection|verifying you are (not )?a (human|bot)/i.test(text)) {
      throw new Error(`reader proxy returned a challenge or ${text.length} chars`)
    }
    // A not-found page arrives from the proxy with HTTP 200 and real content:
    // the direct fetch's 404 becomes a rendered "404 page not found" document.
    // Fingerprinting that would store the error page as the baseline and report
    // the entry healthy for ever, which is worse than the failure it replaces.
    //
    // Corrected 2026-08-27: the commit that added this named Camden as an
    // instance and Camden is NOT one. That came from testing a URL I had
    // shortened by hand rather than the one on the row; the stored URL reads
    // fine and returns 38,000 characters. The guard is still right, and 4 of the
    // 39 unbaselined entries do carry an HTTP 404 (Art Fund, Dulverton, Heritage
    // Crafts, and one more), but the example was wrong.
    //
    // The proxy puts the page title on the first line, so that is where to look.
    const title = text.slice(0, 200).split('\n').find(l => /^title:/i.test(l)) ?? ''
    if (/\b404\b|page not found|page cannot be found|page unavailable/i.test(title)) {
      throw new Error(`page is missing: "${title.replace(/^title:\s*/i, '').trim().slice(0, 60)}"`)
    }
    return { text, via: 'proxy' as const }
  }
}

type WatchlistEntry = {
  id: string
  name: string
  listing_url: string
  last_fingerprint: string | null
  last_count: number | null
  /** Which reader produced last_fingerprint. NULL predates migration 067 and is direct. */
  last_read_via: ReadVia | null
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
      .select('id, name, listing_url, last_fingerprint, last_count, last_read_via')
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
        const { text, via }          = await readListing(entry.listing_url, entry.last_read_via === 'proxy')
        const { fingerprint, count } = extractFingerprint(text, via)

        // A fingerprint is only ever compared against one taken the same way:
        // the proxy reads markdown and a direct fetch reads HTML, so the same
        // unchanged page fingerprints differently through each. Without this, one
        // direct-fetch blip would raise "listing changed", flag every catalogue
        // row on that URL into the verification queue, and raise it again on the
        // next successful direct read. Re-baseline instead, and say so.
        const readerChanged = entry.last_fingerprint !== null
          && (entry.last_read_via ?? 'direct') !== via

        if (!entry.last_fingerprint || readerChanged) {
          // First run, or the first read through a different reader — store the
          // baseline, no alert either way.
          await supabase.from('funder_watchlist').update({
            last_checked:     ranAt,
            last_fingerprint: fingerprint,
            last_count:       count,
            last_read_via:    via,
            last_error:       null,
          }).eq('id', entry.id)
          results.push({
            name:   entry.name,
            status: 'baseline',
            detail: readerChanged
              ? `${count} items indexed, re-baselined via ${via}`
              : `${count} items indexed${via === 'proxy' ? ' via the reader proxy' : ''}`,
          })
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
            last_read_via:    via,
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
            last_checked:  ranAt,
            last_count:    count,
            last_read_via: via,
            last_error:    null,
          }).eq('id', entry.id)
          results.push({ name: entry.name, status: 'ok' })
        }
      } catch (err) {
        // Neither reader could deliver. The page_down alert used to be raised
        // only for an HTTP status and not for a timeout or a DNS failure, which
        // split one event across two behaviours; now that both arrive here, both
        // raise it. `msg` names each attempt, so the feed says whether the proxy
        // was tried and what it said.
        const msg = err instanceof Error ? err.message : String(err)
        await supabase.from('watchlist_alerts').insert({
          watchlist_id:   entry.id,
          alert_type:     'page_down',
          snapshot_after: `${msg} from ${entry.listing_url}`,
        })
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
