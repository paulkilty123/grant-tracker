/**
 * What are the 174 rows the verifier flags as a link problem, actually?
 *
 * The verifier's live counts are 74 `wrong_fund`, 59 `multiple_funds` and 41
 * `no_funding_detail` against 400 verified. Read as a headline that is 174 rows
 * whose first click is useless. It is worth knowing whether that is true before
 * spending a week on it, because the last time anyone opened this pile it was
 * not: on 2026-08-21 a pass over 51 `wrong_fund` rows found the flag was simply
 * WRONG on 10 of them, 26 were a funder's own grants index which Paul had
 * already ruled acceptable ("a link landing on a funder's homepage is fine and
 * shouldn't appear as a problem"), 11 could not be read, and 4 were certainly
 * wrong. Four of fifty-one.
 *
 * So this measures rather than fixes, and it measures the thing that matters:
 * not "does the page name the fund" — which admits an FAQ, a news item and a
 * grants-awarded list — but "could a fundraiser landing here work out whether
 * to apply, and how".
 *
 * Reads through /api/admin/read-page so the fetch happens on production's
 * network. This machine is rate-limited by the hosts and blocked by the reader
 * proxy, and the 2026-08-21 pass produced a false finding for exactly that
 * reason: 11 rows reported unfetchable were a broken proxy URL, not broken
 * sites. NO ANTHROPIC CALL.
 */
export {}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ADMIN_SECRET = process.env.ADMIN_SECRET!
const SITE         = process.env.SITE ?? 'https://www.shootsfunding.co.uk'

const NOTES = ['fixable_link: wrong_fund', 'multiple_funds', 'fixable_link: no_funding_detail']

/** The four things a fundraiser needs. Same set the amount sweep used. */
const SIGNALS: { name: string; re: RegExp }[] = [
  { name: 'eligibility', re: /\b(who can apply|eligib\w+|we fund|we do not fund|we don’t fund|exclusions?|registered charit\w+|constituted)\b/i },
  { name: 'amount',      re: /£\s?[\d,]{3,}/ },
  { name: 'apply',       re: /\b(how to apply|application form|apply online|complete the form|application process|apply in writing|start your application)\b/i },
  { name: 'timing',      re: /\b(deadline|closing date|closes on|rolling|year round|trustees? meet|application window|next round|open for applications)\b/i },
]

type Row = { id: string; funder: string; title: string; apply_url: string; note: string }

/** Distinctive words from the fund's title, minus the noise every title shares. */
const STOP = new Set(['grant', 'grants', 'fund', 'funds', 'funding', 'programme', 'program',
  'the', 'and', 'for', 'of', 'to', 'a', 'an', 'trust', 'foundation', 'charitable', 'charity',
  'community', 'small', 'large', 'main', 'open', 'general', 'uk', 'scheme', 'award', 'awards'])

function nameTokens(s: string): string[] {
  return Array.from(new Set(
    s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
     .filter(w => w.length > 3 && !STOP.has(w))))
}

async function main() {
  const url = `${SUPABASE_URL}/rest/v1/scraped_grants`
    + `?select=id,funder,title,apply_url,field_evidence`
    + `&is_active=eq.true&pipeline_state=eq.published&limit=1000`
  const res = await fetch(url, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } })
  if (!res.ok) throw new Error(`rows ${res.status}: ${await res.text()}`)
  const all = await res.json() as (Row & { field_evidence?: { _page_read?: { note?: string } } })[]
  const rows = all.filter(r => NOTES.includes(r.field_evidence?._page_read?.note ?? ''))
    .map(r => ({ ...r, note: r.field_evidence!._page_read!.note! }))
  console.log(`flagged rows to examine: ${rows.length}`)
  for (const n of NOTES) console.log(`  ${rows.filter(r => r.note === n).length}  ${n}`)

  const out: Record<string, unknown>[] = []
  for (let i = 0; i < rows.length; i += 20) {
    const batch = rows.slice(i, i + 20)
    const r = await fetch(`${SITE}/api/admin/read-page`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ADMIN_SECRET}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: batch.map(b => b.apply_url) }),
    })
    if (!r.ok) { console.log(`  batch ${i} failed: ${r.status}`); continue }
    const { results } = await r.json() as { results: { url: string; ok: boolean; chars?: number; excerpt?: string }[] }
    const byUrl = new Map(results.map(x => [x.url, x]))
    for (const row of batch) {
      const page = byUrl.get(row.apply_url)
      if (!page?.ok || !page.excerpt) {
        out.push({ ...row, verdict: 'unreadable' }); continue
      }
      const text = page.excerpt
      const hit = SIGNALS.filter(s => s.re.test(text)).map(s => s.name)
      const toks = nameTokens(row.title)
      const lower = text.toLowerCase()
      // The HOSTNAME counts as evidence of whose page this is, and it has to.
      // The first version matched the funder's name against the page text only,
      // which is a 4,000-character excerpt dominated by nav, and it therefore
      // reported charleshaywardfoundation.org.uk as "not this funder". Four of
      // the five rows it called genuinely wrong were the funder's own site.
      const host = (() => { try { return new URL(row.apply_url).hostname.toLowerCase() } catch { return '' } })()
      const funderToks  = nameTokens(row.funder)
      const namesFund   = toks.length > 0 && toks.filter(t => lower.includes(t)).length / toks.length >= 0.5
      // A funder can have NO distinctive tokens. "A B Charitable Trust" loses
      // charitable and trust to the stop list and a and b to the length filter,
      // leaving an empty array, and `[].some()` is false — so the row was
      // reported as belonging to a different funder on the strength of having
      // an unusually plain name. When there is nothing to match on, the match
      // cannot be evidence of absence.
      const namesFunder = funderToks.length === 0
        ? null
        : funderToks.some(t => lower.includes(t) || host.includes(t))

      // The floor: could someone landing here work out whether to apply, and how.
      const verdict =
        hit.length >= 2 && (namesFund || namesFunder !== false) ? 'could_apply'
        : namesFunder === null ? 'name_too_plain_to_judge'
        : namesFunder ? 'funder_page_thin'
        : 'not_this_funder'
      out.push({ ...row, verdict, signals: hit, namesFund, namesFunder, chars: page.chars })
    }
    console.log(`  ...${Math.min(i + 20, rows.length)}/${rows.length}`)
  }

  console.log('\n########## BY VERDICT')
  for (const v of ['could_apply', 'funder_page_thin', 'name_too_plain_to_judge', 'not_this_funder', 'unreadable']) {
    const sel = out.filter(o => o.verdict === v)
    console.log(`\n${sel.length.toString().padStart(4)}  ${v}`)
    const byNote = new Map<string, number>()
    for (const s of sel) byNote.set(String(s.note), (byNote.get(String(s.note)) ?? 0) + 1)
    for (const [n, c] of Array.from(byNote.entries())) console.log(`        ${String(c).padStart(3)} of them flagged ${n}`)
  }

  console.log('\n########## THE ONES THAT LOOK GENUINELY WRONG')
  for (const o of out.filter(o => o.verdict === 'not_this_funder')) {
    console.log(`  ${String(o.funder).slice(0, 40).padEnd(42)} ${String(o.title).slice(0, 40)}`)
    console.log(`      ${o.apply_url}   [${o.note}]`)
  }

  const path = process.env.OUT
  if (path) await import('node:fs/promises').then(fs => fs.writeFile(path, JSON.stringify(out, null, 1)))
  if (path) console.log(`\nwritten -> ${path}`)
}

main().catch(e => { console.error(e); process.exit(1) })
