// Second pass over the LIKELY OPEN rows: find a FUTURE DEADLINE on the page.
//
//   npx tsx scripts/verify-dead-row-candidates.ts reports/dead-row-triage-YYYY-MM-DD.json
//
// The first pass classifies on open/closed language. That is weak evidence:
// "how to apply" is permanent navigation on every funder's homepage, so it
// cannot separate a live round from a site that merely exists.
//
// A stated closing date in the future is strong evidence. It is also the thing
// the catalogue is missing — a reactivated row with a real deadline is worth
// far more than one with none, because deadline is what drives the whole
// deadlines surface.
//
// Buckets the candidates so a human reviews the strongest first. Writes nothing.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(resolve(HERE, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december']

/** Date near closing-date language, in either order. */
const DEADLINE_CUE = /(?:clos(?:ing|es|e)\s*(?:date)?|deadline|apply\s+by|applications?\s+close|cut[- ]?off)/i

const strip = (h: string) => h
  .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()

/** Every date on the page that sits within 120 chars of deadline language. */
function futureDeadlines(text: string): { iso: string; snippet: string }[] {
  const out: { iso: string; snippet: string }[] = []
  const dateRe = new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS.join('|')})\\w*\\s+(\\d{4})|(${MONTHS.join('|')})\\w*\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})`, 'gi')
  let m: RegExpExecArray | null
  while ((m = dateRe.exec(text)) !== null) {
    const day   = m[1] ? parseInt(m[1], 10) : parseInt(m[5], 10)
    const mon   = MONTHS.indexOf((m[2] ?? m[4]).toLowerCase())
    const year  = parseInt(m[3] ?? m[6], 10)
    if (mon < 0 || !year) continue
    const when = new Date(year, mon, day)
    if (when.getTime() <= Date.now()) continue
    // Only count it if deadline language is nearby — a page full of event dates
    // would otherwise read as a fund with a deadline.
    const around = text.slice(Math.max(0, m.index - 120), m.index + 120)
    if (!DEADLINE_CUE.test(around)) continue
    const iso = when.toISOString().slice(0, 10)
    if (!out.some(o => o.iso === iso)) out.push({ iso, snippet: around.trim().slice(0, 130) })
  }
  return out.sort((a, b) => a.iso.localeCompare(b.iso))
}

async function main() {
  const file = process.argv[2]
  if (!file) { console.error('Usage: npx tsx scripts/verify-dead-row-candidates.ts <triage.json>'); process.exit(1) }
  const all = JSON.parse(readFileSync(file, 'utf8')) as { id: string; funder: string | null; title: string; apply_url: string; source: string; verdict: string }[]
  const candidates = all.filter(r => r.verdict === 'LIKELY OPEN')

  console.log(`\nverifying ${candidates.length} LIKELY OPEN rows for a stated future deadline\n`)

  const strong: (typeof candidates[0] & { deadline: string; snippet: string })[] = []
  const weak: typeof candidates = []

  const CONC = 6
  for (let i = 0; i < candidates.length; i += CONC) {
    const batch = candidates.slice(i, i + CONC)
    await Promise.all(batch.map(async r => {
      try {
        const res = await fetch(r.apply_url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(20_000) })
        if (!res.ok) { weak.push(r); return }
        const found = futureDeadlines(strip(await res.text()))
        if (found.length) strong.push({ ...r, deadline: found[0].iso, snippet: found[0].snippet })
        else weak.push(r)
      } catch { weak.push(r) }
    }))
  }

  strong.sort((a, b) => a.deadline.localeCompare(b.deadline))

  console.log(`STRONG — a future closing date is stated on the page (${strong.length}):\n`)
  for (const s of strong) {
    console.log(`  ${s.deadline}  ${(s.funder ?? '?').slice(0, 30).padEnd(30)} ${s.title.slice(0, 40)}`)
    console.log(`              ${s.snippet.slice(0, 108)}`)
  }
  console.log(`\nWEAKER — page loads and invites applications, but states no dated round (${weak.length}).`)
  console.log(`These are mostly rolling funders whose homepage is the apply route. Worth reviewing,`)
  console.log(`but not evidence of a live round on its own.\n`)
  for (const w of weak.slice(0, 25)) console.log(`  ${(w.funder ?? '?').slice(0, 32).padEnd(32)} ${w.title.slice(0, 44)}`)

  const out = file.replace(/\.json$/, '-verified.json')
  writeFileSync(out, JSON.stringify({ strong, weak }, null, 2))
  console.log(`\nwritten to ${out}`)
  console.log(`NOTHING WAS WRITTEN TO THE CATALOGUE.`)
}

main().catch(e => { console.error(e); process.exit(1) })
