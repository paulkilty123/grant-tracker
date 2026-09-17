// Paul's four decisions, 2026-09-01.
//
//   RELINKS, accepted. Henry Smith's clergy page is unambiguous; Key Fund's
//   /apply/ is thinner but it is the funder's own apply page and the alternative
//   is a URL we know is wrong.
//
//   NEXT_OPEN_DATE, accepted. CLA 2026-12-01 and ScottishPower 2027-07-01, both
//   on the funder's own sentence. FLAGGED FOR RE-CHECK rather than treated as
//   settled: they are claims about the FUTURE, which is the one kind the
//   perishable-field rule cannot supersede later — a reopening date can only be
//   withdrawn by a human, because withdrawing it is not a removal of a claim we
//   can see is false, it is a bet that has not resolved yet.
//
// SOURCE. `admin:paulkilty1@gmail.com`, because these ARE human decisions —
// Paul read the evidence and ruled. That is the one case where admin trust is
// the honest stamp rather than the trap CLAUDE.md warns about, and it is also
// required: both next_open_date fields are already held by admin at trust 100
// and nothing below it can write.
//
// DRY BY DEFAULT.  npx tsx --env-file=.env.local scripts/apply-paul-decisions-2026-09-01.ts [--live]

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { recordGrantFlags } from '../src/lib/grant-flags'
import { predictWrite, describePrediction } from '../src/lib/admin/dry-run-refusal'

for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}
const LIVE = process.argv.includes('--live')
const SOURCE = 'admin:paulkilty1@gmail.com'

type Decision = {
  prefix: string; what: string; quote: string
  fields: Record<string, unknown>
  /** Set on a forward-looking claim, so it comes back rather than going stale. */
  recheck?: string
}

const DECISIONS: Decision[] = [
  {
    prefix: 'b5b74039', what: 'Henry Smith Christian Grants — relink to the clergy page',
    quote: 'The Christian Grants programme supports initiatives that promote Anglican Clergy Wellbeing. '
         + 'Read from production: 23,477 chars, names the fund, six application signals.',
    fields: { apply_url: 'https://henrysmith.foundation/grants/clergy/' },
  },
  {
    prefix: '6f3892eb', what: 'Key Fund — relink to the funder’s own apply page',
    quote: 'thekeyfund.co.uk/apply/ reads from production at 4,899 chars with two application signals. '
         + 'Thinner than ideal, and the alternative is a URL we know is wrong.',
    fields: { apply_url: 'https://thekeyfund.co.uk/apply/' },
  },
  {
    prefix: '3d957bb8', what: 'CLA Charitable Trust — reopening date',
    quote: 'We are not accepting any further applications in 2026. We expect to re-open in '
         + 'December/January for our 2027 grant-making.',
    fields: { next_open_date: '2026-12-01' },
    recheck: '2026-12-01',
  },
  {
    prefix: '18d9e659', what: 'ScottishPower Foundation — reopening date',
    quote: 'Our Annual Grants Fund 2027 is now closed. We anticipate opening the application window '
         + 'for the Annual Grants Fund 2028 in July 2027.',
    fields: { next_open_date: '2027-07-01' },
    recheck: '2027-07-01',
  },
]

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const rows: Record<string, unknown>[] = []
  for (let f = 0; f < 6000; f += 500) {
    const { data, error } = await db.from('scraped_grants')
      .select('*').not('pipeline_state', 'in', '("rejected","archived")').order('id').range(f, f + 499)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? [])); if ((data ?? []).length < 500) break
  }

  console.log(LIVE ? '── LIVE ──' : '── DRY RUN — nothing will be written ──', '\n')
  let applied = 0, refused = 0

  for (const d of DECISIONS) {
    const hits = rows.filter(r => String(r.id).startsWith(d.prefix))
    if (hits.length !== 1) { console.log(`?? ${d.prefix}: ${hits.length} matches — skipped\n`); refused++; continue }
    const row = hits[0]
    console.log(`── ${d.prefix}  ${String(row.funder ?? '')} — ${String(row.title ?? '').slice(0, 44)}`)
    console.log(`   ${d.what}`)
    console.log(`   "${d.quote}"`)

    for (const [k, v] of Object.entries(d.fields)) {
      const prov = ((row.field_provenance ?? {}) as Record<string, never>)[k]
      const p = predictWrite({ field: k, currentValue: row[k], currentProv: prov, newValue: v, source: SOURCE as never })
      console.log(`   ${describePrediction(k, row[k], v, p)}`)
    }
    if (d.recheck) console.log(`   + flagged for re-check on ${d.recheck} (a forward claim, not a settled fact)`)

    if (!LIVE) { applied++; console.log(); continue }

    const res = await mergeGrantUpdate({ db, id: String(row.id), fields: d.fields, source: SOURCE as never })
    const wanted = Object.keys(d.fields)
    const missed = wanted.filter(f => !res.applied?.includes(f))
    if (missed.length) { refused++; console.log(`   REFUSED: ${missed.join(', ')} — ${JSON.stringify(res.rejected?.map(x => x.reason))}`) }
    else { applied++; console.log(`   written: ${res.applied.join(', ')}`) }

    // The re-check flag rides on raw_data.checks, which is untracked, so it can
    // never be blocked by the ladder and never pins anything.
    if (d.recheck) {
      await recordGrantFlags({
        db, grantId: String(row.id), source: 'admin:paulkilty1@gmail.com',
        existingRawData: row.raw_data,
        flags: [{
          code: 'possible_multi_round_uncaptured',
          detail: `Reopening date ${d.recheck} accepted by Paul on 2026-09-01 from the funder's own sentence. `
                + `A FORWARD CLAIM, not a settled fact: re-read the page on or before that date. `
                + `The perishable-field rule cannot supersede this automatically, because withdrawing a `
                + `reopening date is not removing a claim we can see is false.`,
        }],
      })
      console.log('   re-check flag recorded')
    }
    console.log()
  }

  console.log(`\n${LIVE ? 'applied' : 'would apply'} ${applied}   refused ${refused}`)
  if (!LIVE) console.log('Re-run with --live to write.')
}
main()
