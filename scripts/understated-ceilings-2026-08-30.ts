/**
 * Where does the funder's page state a HIGHER ceiling than we show?
 *
 * Every sweep so far has looked for figures we cannot support and removed them.
 * Nobody has looked the other way. The class is invisible from any count we
 * hold, because a row understating its ceiling looks exactly like a correct row
 * — the number is real, it is just too small.
 *
 * It surfaced by accident on 2026-08-30. The National Lottery Community Fund's
 * Egin Grants page says "Amount: £100 to £35,000" and the row said £15,000. Any
 * fundraiser filtering above £15,000 was never shown a fund they qualify for.
 * That is the opposite failure to the one the amount sweep was built for, and
 * the only one in this thread that ADDS funds to a fundraiser's results.
 *
 * Costs the same free page read. Reads through /api/admin/read-page so the
 * fetch happens on production's network, and uses the returned `figures`, which
 * are computed on the whole page rather than on the capped excerpt.
 *
 * COUNTS ONLY. Writes nothing, proposes nothing to apply. NO ANTHROPIC CALL.
 */
export {}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ADMIN_SECRET = process.env.ADMIN_SECRET!
const SITE         = process.env.SITE ?? 'https://www.shootsfunding.co.uk'

/**
 * A figure is a candidate ceiling only if its own sentence frames it as what one
 * applicant can receive. Everything learned the hard way this week is in here.
 */
const PER_GRANT = /\b(grants?|awards?|funding|bursar\w+)\b[^.]{0,50}\bup to\b|\bup to\b[^.]{0,40}\bper (?:grant|award|applicant|organisation|project|year)\b|\bmaximum (?:grant|award|amount|of)\b|\bwe (?:offer|award|give|fund|provide)\b[^.]{0,40}\bup to\b|\bamount:\s*£/i

/** Disqualifiers, each one a real mistake from the 29-30 August sweeps. */
const NOT_A_CEILING: { why: string; re: RegExp }[] = [
  // Base forms too. "We aim to distribute around £42,500 per year" is a pool and
  // was reaching the list because only "distributed" was covered.
  { why: 'pool',        re: /\b(awarded|distributed?|distribute|gave|given|totalling|in total|across|shared)\b[^.]{0,60}\b(grants?|organisations|projects|awards|recipients)\b/i },
  { why: 'pool',        re: /\b(aim to distribute|available to distribute|a pot of|from a pot|per year|per annum|a year)\b/i },
  { why: 'pool',        re: /\b(total (?:fund|pot|budget|of)|programme is worth|set aside|endowment|annually of)\b/i },
  // Both orders. "turnover of under £250,000" AND "under £250,000 turnover" —
  // the second put Two Ridings' applicant-size cap forward as a grant ceiling.
  { why: 'income',      re: /\b(income|turnover|expenditure|reserves|budget)\b[^.]{0,40}\b(under|below|less than|up to|over|above|exceeding|between|of)\b/i },
  { why: 'income',      re: /\b(under|below|less than|up to|over|above|exceeding)\b[^.]{0,30}\b(income|turnover|expenditure|reserves|budget)\b/i },
  { why: 'projectcost', re: /\bproject costs?\b[^.]{0,40}\b(between|up to|under|below|over|above|more than|less than|of)\b/i },
  { why: 'threshold',   re: /\b(or above|or more|and above)\b[^.]{0,60}\b(guidance|scheme|programme|apply|application|major|large)\b/i },
  { why: 'casestudy',   re: /\b(she|he|they|her|his|their) (?:fled|received|was awarded|had|packed|left)\b/i },
  { why: 'loan',        re: /\b(loan|repayment|interest rate|equity|investment of)\b/i },
]

type Row = { id: string; funder: string; title: string; apply_url: string; amount_max: number | null }
type Figure = { figure: string; context: string }

/**
 * The unit has to END a word, or "Multi" and "may" become millions.
 *
 * The first run of this script reported Foundation Scotland's Ballantrae fund
 * as stating £25,000,000,000. The page says "Large grants over £15,000 and up
 * to £25,000 Multi year awards of up to three years are available" — and
 * `(\s?(?:million|m|k))?` matched the M of "Multi". Sussex's £2,000 became
 * £2bn off "may be supported", and a £200 minimum became £200m off "Maximum
 * Grant". Every one of the four largest findings was this bug.
 *
 * `(?![a-z])` after the alternation is the whole fix: £23m still parses,
 * £25,000 Multi does not.
 */
function value(raw: string): number | null {
  const m = /£\s?([\d][\d,]*(?:\.\d+)?)(\s?(?:million|m|k))?(?![a-z])/i.exec(raw)
  if (!m) return null
  let v = parseFloat(m[1].replace(/,/g, ''))
  const unit = (m[2] ?? '').trim().toLowerCase()
  if (unit === 'k') v *= 1_000
  if (unit === 'm' || unit === 'million') v *= 1_000_000
  return Number.isFinite(v) ? v : null
}

async function main() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/scraped_grants`
    + `?select=id,funder,title,apply_url,amount_max`
    + `&is_active=eq.true&pipeline_state=eq.published&amount_max=not.is.null&limit=1000`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } })
  if (!res.ok) throw new Error(`rows ${res.status}: ${await res.text()}`)
  const rows = (await res.json() as Row[])
    // Zero is the deliberate in-kind value, not a ceiling to beat.
    .filter(r => (r.amount_max ?? 0) > 0)
  console.log(`published rows carrying a ceiling: ${rows.length}\n`)

  const understated: Record<string, unknown>[] = []
  const indexPages: Record<string, unknown>[] = []
  let read = 0, unreadable = 0

  for (let i = 0; i < rows.length; i += 20) {
    const batch = rows.slice(i, i + 20)
    const r = await fetch(`${SITE}/api/admin/read-page`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ADMIN_SECRET}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: batch.map(b => b.apply_url) }),
    })
    if (!r.ok) { console.log(`  batch at ${i} failed: ${r.status}`); continue }
    const { results } = await r.json() as
      { results: { url: string; ok: boolean; figures?: Figure[] }[] }
    const byUrl = new Map(results.map(x => [x.url, x]))

    for (const row of batch) {
      const page = byUrl.get(row.apply_url)
      if (!page?.ok) { unreadable++; continue }
      read++
      const qualifying: { v: number; f: Figure }[] = []
      for (const f of page.figures ?? []) {
        if (!PER_GRANT.test(f.context)) continue
        if (NOT_A_CEILING.some(d => d.re.test(f.context))) continue
        const v = value(f.figure)
        if (v === null) continue
        qualifying.push({ v, f })
      }

      /**
       * A page listing many funds cannot tell us about THIS one.
       *
       * The first run attributed Paul Hamlyn's £150,000 to the Dixie Rose
       * Findlay Charitable Trust, because the row's apply_url is a Young Camden
       * Foundation directory page carrying dozens of other funders' grants.
       * fundingforall.org.uk did the same for Backstage Trust and Social
       * Investment Business, and Suffolk's current-grants index for two more.
       *
       * Six or more per-grant ceilings on one page is a directory, and the
       * largest of them belongs to somebody else. Counted separately, because
       * "we cannot attribute a figure on this page" is a different answer from
       * "the page agrees with us".
       */
      if (qualifying.length >= 6) { indexPages.push({ ...row, figures: qualifying.length }); continue }

      const best = qualifying.sort((a, b) => b.v - a.v)[0] ?? null
      if (!best) continue
      const ours = row.amount_max!
      // A margin, not any difference: a page often states a band whose top is
      // slightly above a stored typical figure, and that is not a defect worth
      // a reviewer's minute.
      if (best.v > ours * 1.5 && best.v - ours >= 2_000) {
        understated.push({
          id: row.id, funder: row.funder, title: row.title, url: row.apply_url,
          weShow: ours, pageStates: best.v, quote: best.f.context.slice(0, 260),
        })
      }
    }
    console.log(`  ...${Math.min(i + 20, rows.length)}/${rows.length}`)
  }

  console.log(`\nread ${read}, unreadable ${unreadable}, directory pages skipped ${indexPages.length}`)
  console.log(`\n########## THE PAGE STATES A HIGHER CEILING THAN WE SHOW: ${understated.length}\n`)
  for (const u of understated.sort((a, b) =>
    (Number(b.pageStates) / Number(b.weShow)) - (Number(a.pageStates) / Number(a.weShow)))) {
    console.log(`  we show £${Number(u.weShow).toLocaleString('en-GB')}  ->  page states £${Number(u.pageStates).toLocaleString('en-GB')}   ${String(u.funder).slice(0, 40)}`)
    console.log(`      ${u.url}`)
    console.log(`      "${u.quote}"`)
  }

  const out = process.env.OUT
  if (out) {
    await import('node:fs/promises').then(fs => fs.writeFile(out, JSON.stringify({
      readRows: read, unreadable, understated, indexPages,
    }, null, 1)))
    console.log(`\nwritten -> ${out}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
