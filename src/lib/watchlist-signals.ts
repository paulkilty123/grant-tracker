/**
 * Turning a changed funder page into work the verification engine can do.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE JOIN THAT DID NOT EXIST
 *
 * `funder_watchlist` and `scraped_grants` have no foreign key between them and,
 * until this file, no code anywhere joined them. The watchlist was built as a
 * DISCOVERY instrument — has this funder's listing page got something new on it
 * — and it answers into a feed holding 387 unresolved alerts, none of which has
 * ever been resolved, growing by about 54 a week. Meanwhile the catalogue holds
 * rows making claims about those same funders with no way of hearing that the
 * page moved underneath them.
 *
 * A changed page is a much better reason to re-read a row than a timer, because
 * it is evidence that something happened rather than evidence that time passed.
 * That is the whole argument for this file.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT DELIBERATELY IS NOT
 *
 * It is not the general re-check trigger. The watchlist covers 54 of 963
 * eligible rows on an exact URL match — 5.6% — and 134 of its 239 original
 * entries mapped to no catalogue row at all. A cadence built on it would
 * re-check a quarter of the catalogue for mostly cosmetic reasons and never
 * touch the rest. The clock-free cadence in verify-cadence.ts is the general
 * answer; this is a targeted one.
 *
 * Lives in lib rather than in the route because a Next.js route file may only
 * export its HTTP handlers and segment config, so a helper declared there cannot
 * be imported by a test.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/** Why a row jumped the verification queue. Mirrors `scraped_grants.verify_flag`. */
export type VerifyFlagReason = 'watchlist_change' | 'listing_collapsed'

/**
 * Has this page lost most of its content?
 *
 * Of the 17 changes raised on 16 August, sixteen were news carousels, jobs
 * boards, blog lists and one copy typo. Exactly one was mechanically separable
 * without asking a model: Five Lamps went from 11 heading items to 0. A page
 * that stops rendering its own headings has been taken down, walled or
 * redesigned — never "the funder edited a sentence" — and every row we hold on
 * that URL is worth re-reading.
 *
 * Both shapes require the page to have had something to lose. A site that has
 * always fingerprinted thin is not collapsing, it is thin, and treating it as a
 * takedown every week is how a precise signal turns into noise.
 */
export function hasCollapsed(before: number | null | undefined, after: number): boolean {
  const had = typeof before === 'number' && Number.isFinite(before) ? before : 0
  if (had >= 4  && after === 0)     return true   // emptied
  if (had >= 10 && after * 2 < had) return true   // more than halved
  return false
}

/**
 * Send every catalogue row on this exact URL to the front of the queue.
 *
 * THE MATCH IS ON THE EXACT URL, NOT THE HOST, and that is the load-bearing
 * choice. 261 rows share a host with a watchlist entry against 54 that match
 * exactly, and those 261 are concentrated on the community-foundation sites that
 * change on almost every check — Essex has fired 14 times in 24 cycles. Matching
 * by host would let one cosmetic edit to a CF homepage push dozens of unrelated
 * rows to band 0, which is how a precise signal becomes a flood and then gets
 * ignored. Narrow is what makes this safe to act on unattended.
 *
 * A flag is not a claim about the row. It says "read this next", and the engine
 * clears it once it has.
 */
export async function flagRowsForUrl(
  db: SupabaseClient,
  url: string,
  reason: VerifyFlagReason,
): Promise<number> {
  if (!url) return 0
  const { data, error } = await db
    .from('scraped_grants')
    .update({ verify_flag: reason })
    .eq('apply_url', url)
    // `not.in` on a NULL state yields NULL and would silently drop those rows,
    // the same trap migration 054 documents for `coalesce` on this enum column.
    .or('pipeline_state.is.null,pipeline_state.not.in.("rejected","archived")')
    .select('id')
  if (error) {
    // Never throw: a failed flag must not abort the watchlist run that found it.
    // The run's own count reports how many landed, so a silent zero is visible.
    console.error(`[watchlist] could not flag rows for ${url}: ${error.message}`)
    return 0
  }
  return (data ?? []).length
}

/** Which reader produced a page's text. The two grammars differ, see below. */
export type ReadVia = 'direct' | 'proxy'

// ── Fingerprint extraction ────────────────────────────────────────────────────
// Pulls text from h1–h4, <strong>, and prominent <li> tags.
// Normalises to lowercase, deduplicates, and sorts so that cosmetic
// re-orderings don't trigger false positives.
//
// TWO READERS, TWO GRAMMARS. A direct fetch returns HTML; the reader proxy
// returns markdown, where the same headings are `## Grants` and the same bold is
// `**Now open**`. Running the HTML patterns over markdown finds nothing at all,
// which is not an empty page — it is the wrong parser, and it would read as a
// listing that had collapsed to zero items.
/**
 * Chrome the reader proxy renders as content, and a direct fetch does not.
 *
 * Measured against three real pages on 2026-08-27. Power to Change came back
 * with 45 "items", most of them a cookie-consent table rendered as bold text:
 * ": 1 day", ": http cookie", ": indexeddb". Those values change between reads,
 * so every run would have reported the listing as changed and flagged every
 * catalogue row on that URL into the verification queue.
 *
 * APPLIED TO THE PROXY GRAMMAR ONLY, deliberately. Filtering the HTML grammar
 * too would change the fingerprint of all ~350 entries that already have one,
 * and the next run would read every single one as a changed listing. The noise
 * arrives with the proxy; the filter stays with it.
 */
const PROXY_NOISE = new RegExp([
  'cookie', 'consent', 'privacy', 'local storage', 'indexeddb', 'session',
  'navigation menu', 'skip to', 'follow us', 'social media', 'search',
  'sign in', 'log in', 'newsletter', 'accessibility', 'terms of use',
  '^:', '^\\d+ (day|days|month|months|year|years)$', '^#', 'gif$',
].join('|'), 'i')

export function extractFingerprint(html: string, via: ReadVia = 'direct'): { fingerprint: string; count: number } {
  const items: string[] = []

  const patterns = via === 'proxy'
    ? [
        // Markdown headings, to the end of the line.
        /^#{1,4}\s+(.+)$/gim,
        // Bold, which is what the proxy renders <strong> as.
        /\*\*([^*\n]{5,199})\*\*/g,
      ]
    : [
        /<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi,
        /<strong[^>]*>([\s\S]*?)<\/strong>/gi,
      ]

  for (const re of patterns) {
    let m: RegExpExecArray | null
    while ((m = re.exec(html)) !== null) {
      const text = m[1]
        .replace(/<[^>]+>/g, '')   // strip inner tags
        // `[Apply now](https://…)` -> `Apply now`. Markdown only; a no-op on HTML.
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/[*_`]+/g, '')
        .replace(/&amp;/g,  '&')
        .replace(/&nbsp;/g, ' ')
        .replace(/&#\d+;/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
      if (text.length > 4 && text.length < 200) {
        if (via === 'proxy' && PROXY_NOISE.test(text)) continue
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

// Moved here from the route on 2026-08-27, for the reason stated at the top of
// this file: a route may only export its handlers, so while this lived there it
// could not be tested. It gained a second grammar the same day, which is exactly
// the kind of change that wants a test.
