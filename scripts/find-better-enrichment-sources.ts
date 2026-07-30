// When a brief comes back empty, the apply_url is usually the wrong page.
//
//   npx tsx scripts/find-better-enrichment-sources.ts            # report
//   npx tsx scripts/find-better-enrichment-sources.ts --json     # emit for the enricher
//
// Edward Holt Trust is the case that prompted this. Its apply_url pointed at
// /grant-application, which carries 606 characters and says only "you should
// receive an acknowledgement email, check your spam folder". The enricher read
// it faithfully and produced a brief whose one insider tip was about spam
// folders. The real criteria — homelessness, registered charity, Greater
// Manchester — sit on /funding, 1,330 characters away.
//
// So a thin brief is rarely a funder with nothing to say. It is almost always a
// row pointed at a form-confirmation page, a portal login, or a JS shell. This
// walks the same host for the page that actually describes the funding, and
// emits it as an additionalSources entry the enricher can fetch.
//
// Read-only. Emits candidates; it does not enrich anything itself.
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseHTML } from 'node-html-parser'

const HERE = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(resolve(HERE, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const OUT = resolve(HERE, '..', 'reports', 'better-enrichment-sources.json')

/** Link text or path suggesting a page that describes the funding itself. */
const GOOD_PAGE = /fund(ing)?|grants?|apply|applic|eligib|criteria|guidelin|what[- ]we[- ]fund|who[- ]can|support|programme/i

/** Pages that never carry criteria, however promising the URL looks. */
// `/search` was proposed as a better source for The Cadogan Charity: a site-wide
// search page on an aggregator has plenty of text and plenty of cue words, and
// describes no fund at all. Listing and directory pages have the same problem.
const BAD_PAGE = /privacy|cookie|terms|accessib|contact|news|blog|event|donate|vacanc|job|login|signin|account|basket|press|\/search|\/results|\/browse|\/directory|\/all-funds/i

const visibleText = (html: string) => html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()

async function get(url: string): Promise<string> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(20_000) })
    return r.ok ? await r.text() : ''
  } catch { return '' }
}

/** How much of this page reads like funding criteria rather than chrome? */
function criteriaScore(text: string): number {
  const cues = [
    /who can apply/i, /eligib/i, /we (?:will |do not |don't )?fund/i, /criteria/i,
    /applicant must/i, /registered charit/i, /grants? (?:of|up to|between)/i,
    /priorit/i, /we do not fund/i, /exclusion/i, /deadline|closing date/i,
  ]
  return cues.reduce((n, re) => n + (re.test(text) ? 1 : 0), 0)
}

async function main() {
  const emit = process.argv.includes('--json')
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

  const rows: { id: string; funder: string | null; title: string; apply_url: string | null; funder_brief: Record<string, unknown> | null }[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from('scraped_grants')
      .select('id, funder, title, apply_url, funder_brief')
      .eq('is_active', true).not('apply_url', 'is', null).range(from, from + 999)
    rows.push(...(data ?? []) as never[])
    if (!data || data.length < 1000) break
  }

  // A brief whose CONTENT is empty, not merely whose keys are missing. My
  // review script counted keys and passed 16 rows with sixteen empty strings.
  const thin = rows.filter(r => {
    const b = r.funder_brief ?? {}
    const len = (k: string) => String((b as Record<string, unknown>)[k] ?? '').trim().length
    return len('who_can_apply') === 0 && len('what_they_fund') === 0
  })

  console.log(`\nactive rows: ${rows.length}   with an EMPTY brief: ${thin.length}\n`)

  const found: { id: string; funder: string; from: string; better: string; gain: string }[] = []

  for (const r of thin) {
    const base = r.apply_url!
    let origin: string
    try { origin = new URL(base).origin } catch { continue }

    const homeHtml = await get(base)
    const baseText = visibleText(homeHtml)

    // Candidate links on the same host, from the page we already hold.
    const root = homeHtml ? parseHTML(homeHtml) : null
    const cands = new Set<string>()
    for (const a of root?.querySelectorAll('a[href]') ?? []) {
      const href = a.getAttribute('href') ?? ''
      const label = (a.text ?? '').trim()
      if (!GOOD_PAGE.test(href) && !GOOD_PAGE.test(label)) continue
      if (BAD_PAGE.test(href) || BAD_PAGE.test(label)) continue
      try {
        const abs = new URL(href, base).toString().split('#')[0]
        if (abs.startsWith(origin) && abs !== base.split('#')[0]) cands.add(abs)
      } catch { /* unparseable href */ }
    }
    // Common paths, in case the page we hold has no useful navigation.
    for (const p of ['/funding', '/grants', '/apply', '/how-to-apply', '/what-we-fund', '/eligibility']) {
      cands.add(origin + p)
    }

    let best: { url: string; text: string; score: number } | null = null
    for (const c of Array.from(cands).slice(0, 8)) {
      const t = visibleText(await get(c))
      if (t.length < 400) continue
      const sc = criteriaScore(t)
      if (!best || sc > best.score || (sc === best.score && t.length > best.text.length)) {
        best = { url: c, text: t, score: sc }
      }
    }

    const baseScore = criteriaScore(baseText)
    if (best && (best.score > baseScore || best.text.length > baseText.length * 1.5)) {
      found.push({
        id: r.id, funder: r.funder ?? '?', from: base, better: best.url,
        gain: `criteria cues ${baseScore} -> ${best.score}, text ${baseText.length} -> ${best.text.length} chars`,
      })
      console.log(`  ${(r.funder ?? '?').slice(0, 30).padEnd(30)} ${best.url.replace(origin, '')}`)
      console.log(`     ${found[found.length - 1].gain}`)
    } else {
      console.log(`  ${(r.funder ?? '?').slice(0, 30).padEnd(30)} no better page found on this host`)
    }
  }

  console.log(`\nbetter source found for ${found.length} of ${thin.length}`)
  if (emit) {
    writeFileSync(OUT, JSON.stringify(found, null, 2))
    console.log(`written to ${OUT}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
