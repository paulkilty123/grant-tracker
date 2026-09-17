// Four live rows a fundraiser cannot apply from, taken out of view.
//
// Paul, 2026-09-01: "fix or hide them now" — the walkthrough is recorded on the
// 3rd. Fixing was tried first and failed on the evidence: none of the four has a
// reachable application page.
//
//   3 Charity Commission register entries. The link resolves and the page is
//     genuine, which is why nothing caught them: a register entry states trustee
//     counts and expenditure and offers no route in. mackintoshfoundation.org.uk
//     and djanoglyfoundation.org do not resolve from production; djanogly.com is
//     176 characters of stray Word metadata.
//
//   1 Waitrose Community Matters. Both candidate replacements were read and both
//     return 404: /home/inspiration/about-waitrose/community-matters.html and
//     /ecom/content/about-us/community-matters. Guessing a third would be the
//     "suggestions need a second read" trap — two thirds of proposed links fail
//     when opened, and both of mine already have.
//
// NOT `rejected`. These funders are real and still give money; what is missing
// is a way in. `tagged_awaiting_review` + is_active false takes them off the
// site and leaves them in the review queue under "link needs fixing", which is
// what they are. A rejection would file them as not-funds and lose that.
//
// DRY BY DEFAULT.  npx tsx --env-file=.env.local scripts/hide-unapplyable-2026-09-01.ts [--live]

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

const LIVE = process.argv.includes('--live')

const ROWS: { prefix: string; what: string; evidence: string }[] = [
  { prefix: '043634a3', what: 'DCR Allen Charitable Trust',
    evidence: 'apply_url is the Charity Commission register entry for 277293. The page states total '
            + 'income, expenditure and trustee count. No application route, and no funder website found.' },
  { prefix: '65961bc8', what: 'Djanogly Foundation — General Grants',
    evidence: 'apply_url is the Charity Commission register entry for 280500, whose entire statement of '
            + 'activity is "Grants are made to registered charities". djanogly.com returns 176 characters '
            + 'of stray document metadata; djanoglyfoundation.org does not resolve.' },
  { prefix: '1f67aead', what: 'The Mackintosh Foundation — Theatre and Charitable Grants',
    evidence: 'apply_url is the Charity Commission register entry for 327751. mackintoshfoundation.org.uk '
            + 'does not resolve from production, direct or through the reader proxy.' },
  // The FIFTH, and the one that makes the case for the host check rather than a
  // one-off correction: Harford was live, published, and carried no blocking
  // reason at all, so it appeared in no queue and nothing would ever have
  // surfaced it. Found by sweeping all 961 rows for the pattern. Same evidence
  // as the three above, and no funder site resolves.
  { prefix: '2506cc66', what: 'Harford Charitable Trust',
    evidence: 'apply_url is the Charity Commission register entry for 299945. Neither '
            + 'harfordcharitabletrust.org.uk nor harfordtrust.org.uk resolves from production.' },
  { prefix: '3da49c2b', what: 'Waitrose & Partners — Community Matters',
    evidence: 'The stored URL returns "404 NOT FOUND" from waitrose.com. Two candidate replacements were '
            + 'read from production and both 404 as well.' },
]

const NOTE = 'review sweep 2026-09-01: no application route. Withheld pending a working link, not rejected.'

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const rows: Record<string, unknown>[] = []
  for (let from = 0; from < 6000; from += 500) {
    const { data, error } = await db.from('scraped_grants')
      .select('id, title, funder, apply_url, is_active, pipeline_state').order('id').range(from, from + 499)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if ((data ?? []).length < 500) break
  }

  console.log(LIVE ? '── LIVE ──' : '── DRY RUN — nothing will be written ──', `\n(${rows.length} rows scanned)\n`)
  let done = 0, skipped = 0

  for (const r of ROWS) {
    const hits = rows.filter(x => String(x.id).startsWith(r.prefix))
    if (hits.length !== 1) { console.log(`?? ${r.prefix}  ${hits.length} matches — skipped\n`); skipped++; continue }
    const row = hits[0]
    console.log(`── ${r.prefix}  ${r.what}`)
    console.log(`   ${row.apply_url}`)
    console.log(`   ${r.evidence}`)
    console.log(`   is_active ${row.is_active} -> false   pipeline_state ${row.pipeline_state} -> tagged_awaiting_review`)

    if (!LIVE) { done++; console.log(); continue }

    // is_active and pipeline_state are UNTRACKED, so nothing here touches the
    // trust ladder and nothing is pinned. needs_intervention_reason is left
    // alone deliberately: a note there is a tombstone that freezes the row out
    // of every cron, and these rows should keep being re-read in case the
    // funder publishes a page.
    const res = await mergeGrantUpdate({
      db, id: String(row.id), source: 'system:review-sweep-2026-09-01' as never,
      fields: { is_active: false, pipeline_state: 'tagged_awaiting_review', rejection_reason: NOTE },
    })
    const ok = res.applied?.includes('is_active') && res.applied?.includes('pipeline_state')
    console.log(ok ? `   hidden: ${res.applied.join(', ')}` : `   FAILED — applied: ${JSON.stringify(res.applied)}`)
    if (ok) done++; else skipped++
    console.log()
  }

  console.log(`\n${LIVE ? 'hidden' : 'would hide'} ${done}   skipped ${skipped}`)
  if (!LIVE) console.log('Re-run with --live to write.')
}
main()
