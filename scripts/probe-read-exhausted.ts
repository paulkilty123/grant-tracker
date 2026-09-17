// Can this row's page be read by ANYTHING we have?
//
// The review queue can tell you a page failed to read. It cannot tell you whether
// trying again would help, because `_page_read` stores the last attempt and not a
// count. So "we have exhausted this" is not derivable at render time — it has to
// be attempted and recorded. This is that attempt.
//
// It writes `field_evidence._read_exhausted` when BOTH paths fail, and DELETES it
// the moment either succeeds. The delete matters more than the write: a marker
// that only ever accumulates would send rows to a human tab and keep them there
// after the funder fixed their site, which is the detect-only-adds-never-clears
// trap the catalogue has been bitten by before.
//
//   npx tsx --env-file=.env.local scripts/probe-read-exhausted.ts --ids=a,b,c [--dry]
//   npx tsx --env-file=.env.local scripts/probe-read-exhausted.ts --live-and-wrong [--dry]
import { createClient } from '@supabase/supabase-js'
import { fetchPage } from '../src/lib/verification/verify-row'
import { looksLikeAWall } from '../src/lib/verification/page-readable'

const DRY = process.argv.includes('--dry')
const idsArg = process.argv.find(a => a.startsWith('--ids='))

/** A URL nothing can fetch, whatever the network says. `mailto:` is the live
 *  case: The Paley Trust's apply_url is an email address. */
function notAWebUrl(url: string | null | undefined): boolean {
  const u = (url ?? '').trim()
  if (!u) return true
  return !/^https?:\/\//i.test(u)
}

export type ReadProbe = {
  at:     string
  reason: 'not_a_web_url' | 'both_paths_failed' | 'bot_wall' | 'empty_page'
  detail: string
  /** How many probes in a row have failed. Structural failures start settled;
   *  everything else has to fail twice before anyone is asked to look at it. */
  consecutive: number
}

/**
 * One failed probe is not exhaustion.
 *
 * The Hygiene Bank returned zero characters on the dry run and a real page on the
 * live run four minutes later. Had the first result written a marker that a human
 * tab keys off, a working funder would have been queued for Paul's attention on
 * the strength of one flaky fetch — and stayed there, because nothing would have
 * re-probed a row already classified as hopeless.
 *
 * So a fetch failure has to repeat before it counts. `not_a_web_url` is exempt: a
 * `mailto:` address will not become fetchable on the second attempt.
 */
const CONSECUTIVE_FAILURES_REQUIRED = 2

/**
 * A fetch that "succeeded" and returned a wall.
 *
 * The first version of this probe called six of seven rows readable, because
 * `fetchPage` resolves happily on any 200. What it had actually collected was
 * Arts Council's Cloudflare interstitial (508 chars, "Just a moment..."),
 * TechSoup's Imperva rejection (82 chars, "Request unsuccessful. Incapsula
 * incident ID...") and The Hygiene Bank returning zero characters. A probe that
 * cannot fail is not a probe, and this one could not.
 *
 * THE DETECTOR NOW LIVES IN `src/lib/verification/bot-wall.ts` and this imports
 * it. It was defined here and NOT in verify-row.ts, which had its own
 * `text.length < 200`, so for months the probe knew a page was a wall and the
 * verifier judged the same page as though it described a fund. Two readers with
 * two answers about one page is the whole defect; one module is the fix.
 */

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  let ids: string[] = []
  if (idsArg) ids = idsArg.slice('--ids='.length).split(',').map(s => s.trim()).filter(Boolean)
  else {
    console.error('Pass --ids=<uuid,uuid>. Refusing to probe the whole catalogue by accident.')
    process.exit(1)
  }

  const { data: rows, error } = await db
    .from('scraped_grants')
    .select('id, title, apply_url, field_evidence')
    .in('id', ids)
  if (error) throw new Error(error.message)

  const now = new Date().toISOString()
  let exhausted = 0
  let readable = 0
  let cleared = 0

  for (const r of rows ?? []) {
    const url = r.apply_url as string | null
    const title = String(r.title ?? '').slice(0, 46)
    let probe: ReadProbe | null = null

    if (notAWebUrl(url)) {
      probe = { at: now, reason: 'not_a_web_url', consecutive: 0, detail: `apply_url is not fetchable: ${String(url).slice(0, 60)}` }
    } else {
      // fetchPage tries direct, then the reader proxy, and only returns an error
      // when both have failed. Then force the proxy once more, because the
      // escalation path shapes the request differently and occasionally wins.
      const first = await fetchPage(url!)
      const firstWall = 'error' in first ? { walled: true, why: first.error } : looksLikeAWall(first.text)

      if (firstWall.walled) {
        const forced = await fetchPage(url!, true)
        const forcedWall = 'error' in forced ? { walled: true, why: forced.error } : looksLikeAWall(forced.text)
        if (forcedWall.walled) {
          const empty = firstWall.why.includes('no text at all') && forcedWall.why.includes('no text at all')
          probe = {
            at: now,
            consecutive: 0,
            reason: empty ? 'empty_page'
              : /signature|just a moment|incapsula|unsuccessful/i.test(`${firstWall.why} ${forcedWall.why}`) ? 'bot_wall'
              : 'both_paths_failed',
            detail: `direct: ${firstWall.why} || proxy: ${forcedWall.why}`.slice(0, 300),
          }
        }
      }
    }

    const evidence = { ...((r.field_evidence ?? {}) as Record<string, unknown>) }
    const had = '_read_exhausted' in evidence

    if (probe) {
      const prior = (evidence._read_exhausted ?? null) as ReadProbe | null
      const priorCount = prior && prior.reason !== 'not_a_web_url' ? Number(prior.consecutive ?? 1) : 0
      probe.consecutive = probe.reason === 'not_a_web_url'
        ? CONSECUTIVE_FAILURES_REQUIRED
        : priorCount + 1
      const settled = probe.consecutive >= CONSECUTIVE_FAILURES_REQUIRED
      if (settled) exhausted++
      evidence._read_exhausted = probe
      console.log(`  ${settled ? 'EXHAUSTED' : 'failed 1/2'}  ${title.padEnd(48)} ${probe.reason} (${probe.consecutive}/${CONSECUTIVE_FAILURES_REQUIRED})`)
    } else {
      readable++
      if (had) { cleared++; console.log(`  READABLE   ${title.padEnd(48)} (marker cleared)`) }
      else console.log(`  READABLE   ${title.padEnd(48)}`)
      delete evidence._read_exhausted
    }

    if (!DRY) {
      const { error: upErr } = await db
        .from('scraped_grants').update({ field_evidence: evidence }).eq('id', r.id)
      if (upErr) console.log(`     WRITE FAILED: ${upErr.message}`)
    }
  }

  console.log(`\nprobed ${rows?.length ?? 0}   settled as exhausted ${exhausted}   readable ${readable}   markers cleared ${cleared}${DRY ? '   (dry)' : ''}`)
  console.log('A row is only exhausted once it has failed twice running, or its URL is not fetchable at all.')
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
