// Work the rows marked dead: probe the URL, then READ THE PAGE.
//
//   npx tsx scripts/triage-dead-rows.ts            # probe + classify, write nothing
//   npx tsx scripts/triage-dead-rows.ts --limit 60
//   npx tsx scripts/triage-dead-rows.ts --include-govuk
//
// 625 rows carry url_status='dead' and 564 were never checked by anything.
// A 200 tells you the URL resolves. It does NOT tell you the fund is open, and
// conflating those two is how a catalogue fills up with expired rounds — so
// this reads the page text for open/closed language as a second stage.
//
// SCOPE: gov_uk and ukri are excluded by default. They are 281 of the 625 and
// are overwhelmingly research, science, medical and for-profit calls that this
// catalogue's users cannot apply for — the UKRI scraper was retired on
// 2026-07-26 for exactly that reason. Including them would inflate the
// "recoverable" number with rows nobody wants.
//
// PROPOSES ONLY. Writes nothing. A heuristic reading of page text is evidence
// for a human, not authority to republish.
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(resolve(HERE, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const OUT = resolve(HERE, '..', 'reports', `dead-row-triage-${new Date().toISOString().slice(0, 10)}.json`)

/** The page says, in its own words, that it is shut. */
const CLOSED_RE = /clos(?:ed|ing) (?:for|to) applications|applications?[^.]{0,70}?(?:are|is|have|has)\s+(?:now\s+)?closed|no longer accepting|not accepting applications|deadline has (?:now )?passed|round (?:is |has )?closed|currently closed|this (?:fund|programme|scheme) (?:is|has) (?:now )?clos|we are not currently/i

/** The page says, in its own words, that you can apply. */
const OPEN_RE = /apply now|applications? (?:are |is )?(?:now )?open|open for applications|how to apply|start your application|submit an application|make an application|apply online|application form/i

/**
 * "Applications open: Monday 7th September 2026" — a fund announcing a FUTURE
 * opening is not open now, but it trips every open-language pattern. Laughology's
 * Happiness Fund read as LIKELY OPEN on the first pass for exactly this reason.
 */
const OPENS_LATER_RE = /applications?\s+(?:will\s+)?opens?:?\s+(?:on\s+)?(?:mon|tue|wed|thu|fri|sat|sun|\d{1,2}(?:st|nd|rd|th)?\s|january|february|march|april|may|june|july|august|september|october|november|december)/i

/** The page is a generic error or parking page even though it returned 200. */
const SOFT_404_RE = /page not found|404|no longer exists|has been moved|sorry, we (?:can'?t|cannot) find|this page (?:is|has been) (?:unavailable|removed)/i

type Row = {
  id: string; funder: string | null; title: string; apply_url: string
  source: string; deadline: string | null; pipeline_state: string
}

type Verdict = 'LIKELY OPEN' | 'OPENS LATER' | 'LIKELY CLOSED' | 'UNCLEAR' | 'SOFT 404' | 'BOT-WALLED' | 'DEAD' | 'UNREACHABLE'

async function probe(url: string): Promise<{ code: number; body: string; note: string }> {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow', signal: AbortSignal.timeout(20_000),
    })
    const body = r.ok ? (await r.text()).slice(0, 400_000) : ''
    return { code: r.status, body, note: '' }
  } catch (e) {
    const m = (e as Error).message ?? ''
    return { code: 0, body: '', note: /ENOTFOUND|getaddrinfo/i.test(m) ? 'DNS' : /timeout|abort/i.test(m) ? 'timeout' : 'fail' }
  }
}

const strip = (h: string) => h
  .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

function classify(code: number, body: string, note: string): { verdict: Verdict; evidence: string } {
  if (code === 0) return { verdict: 'UNREACHABLE', evidence: note }
  if ([404, 410].includes(code)) return { verdict: 'DEAD', evidence: `HTTP ${code}` }
  if ([403, 406, 429].includes(code)) return { verdict: 'BOT-WALLED', evidence: `HTTP ${code} — page is probably fine, we cannot read it` }
  if (code !== 200) return { verdict: 'UNREACHABLE', evidence: `HTTP ${code}` }

  const text = strip(body)
  if (text.length < 400) return { verdict: 'UNCLEAR', evidence: `only ${text.length} chars of text — likely JS-rendered` }
  // A 200 that is really a not-found page. Checked FIRST: such pages often also
  // carry site-wide "how to apply" nav links that would otherwise read as open.
  if (SOFT_404_RE.test(text.slice(0, 3000))) return { verdict: 'SOFT 404', evidence: sentenceAround(text, SOFT_404_RE) }
  const closed = CLOSED_RE.test(text)
  const open   = OPEN_RE.test(text)
  // Closed wins a tie: "applications are closed, see how to apply next year"
  // contains both, and the safe reading is shut.
  if (closed) return { verdict: 'LIKELY CLOSED', evidence: sentenceAround(text, CLOSED_RE) }
  // A future opening date beats generic apply-language: the page is telling you
  // when to come back, not inviting you in.
  if (OPENS_LATER_RE.test(text)) return { verdict: 'OPENS LATER', evidence: sentenceAround(text, OPENS_LATER_RE) }
  if (open)   return { verdict: 'LIKELY OPEN',   evidence: sentenceAround(text, OPEN_RE) }
  return { verdict: 'UNCLEAR', evidence: 'page loads, no open or closed language found' }
}

function sentenceAround(text: string, re: RegExp): string {
  for (const s of text.split(/(?<=[.!?])\s+/)) if (re.test(s)) return s.trim().slice(0, 150)
  return ''
}

async function main() {
  const limArg = process.argv.indexOf('--limit')
  const limit = limArg > -1 ? parseInt(process.argv[limArg + 1], 10) : Infinity
  const includeGovUk = process.argv.includes('--include-govuk')

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })

  let q = db.from('scraped_grants')
    .select('id, funder, title, apply_url, source, deadline, pipeline_state')
    .eq('url_status', 'dead').not('apply_url', 'is', null)
    .or(`deadline.is.null,deadline.gte.${new Date().toISOString().slice(0, 10)}`)
  if (!includeGovUk) q = q.not('source', 'in', '("gov_uk","ukri")')

  const { data, error } = await q
  if (error) throw new Error(error.message)
  const rows = ((data ?? []) as unknown as Row[]).slice(0, limit)

  console.log(`\nprobing ${rows.length} rows marked dead${includeGovUk ? '' : ' (gov_uk and ukri excluded)'}\n`)

  const results: (Row & { verdict: Verdict; evidence: string; code: number })[] = []
  const CONCURRENCY = 6
  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const batch = rows.slice(i, i + CONCURRENCY)
    const done = await Promise.all(batch.map(async r => {
      const p = await probe(r.apply_url)
      const c = classify(p.code, p.body, p.note)
      return { ...r, ...c, code: p.code }
    }))
    results.push(...done)
    if ((i / CONCURRENCY) % 5 === 0) console.log(`  ...${Math.min(i + CONCURRENCY, rows.length)}/${rows.length}`)
  }

  const by = (v: Verdict) => results.filter(r => r.verdict === v)
  const order: Verdict[] = ['LIKELY OPEN', 'OPENS LATER', 'BOT-WALLED', 'UNCLEAR', 'LIKELY CLOSED', 'SOFT 404', 'DEAD', 'UNREACHABLE']

  console.log(`\n${'─'.repeat(76)}`)
  for (const v of order) {
    const n = by(v).length
    if (n) console.log(`${v.padEnd(15)} ${String(n).padStart(4)}  (${Math.round(100 * n / results.length)}%)`)
  }

  console.log(`\nLIKELY OPEN — candidates for a human to review:\n`)
  for (const r of by('LIKELY OPEN').slice(0, 40)) {
    console.log(`  ${(r.funder ?? '?').slice(0, 32).padEnd(32)} ${r.title.slice(0, 42)}`)
    console.log(`     ${r.evidence.slice(0, 110)}`)
  }

  writeFileSync(OUT, JSON.stringify(results, null, 2))
  console.log(`\nfull results written to ${OUT}`)
  console.log(`\nNOTHING WAS WRITTEN TO THE CATALOGUE. "Likely open" is a heuristic read of page`)
  console.log(`text — evidence for a human, not authority to republish.`)
}

main().catch(e => { console.error(e); process.exit(1) })
