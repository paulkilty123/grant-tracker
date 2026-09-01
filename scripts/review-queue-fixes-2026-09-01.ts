// Grounded corrections from the review-queue sweep of 2026-09-01.
//
// Every change below is backed by a sentence read from the funder's own page
// through production's egress (POST /api/admin/read-page — no model call, so
// none of this cost anything). The quote that justifies each one is recorded
// beside it, and is what a reviewer should check rather than the verdict.
//
// DRY BY DEFAULT.  npx tsx --env-file=.env.local scripts/review-queue-fixes-2026-09-01.ts [--live]
//
// SOURCE CHOICE. Everything here writes as `system:review-sweep-2026-09-01`
// (trust 50) rather than `admin:`. These are corrections read off a page, not
// decisions a human has made, and an `admin:` stamp would pin the field at
// trust 100 and permanently block re-enrichment from improving it — the trap
// documented in CLAUDE.md under the field_provenance trust ladder. The cost is
// that a field already carrying an `admin:` stamp will refuse the write; the
// dry run says so per row rather than reporting a silent success.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { mergeGrantUpdate, trustOf } from '../src/lib/grant-merge'

for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

const LIVE = process.argv.includes('--live')
const SOURCE = 'system:review-sweep-2026-09-01'

type Fix = {
  id: string
  what: string
  /** The sentence on the funder's page that justifies it. */
  quote: string
  fields: Record<string, unknown>
}

const FIXES: Fix[] = [
  {
    id: '3d957bb8-0000-0000-0000-000000000000', // CLA Charitable Trust — placeholder, resolved by prefix below
    what: 'CLA Charitable Trust — round shut, reopens for 2027 grant-making',
    quote: 'We are not accepting any further applications in 2026. We expect to re-open in '
         + 'December/January for our 2027 grant-making.',
    fields: { deadline: null, is_rolling: false, next_open_date: '2026-12-01' },
  },
  {
    id: '18d9e659',
    what: 'ScottishPower Foundation — 2027 round closed, 2028 window opens July 2027',
    quote: 'Our Annual Grants Fund 2027 is now closed. We anticipate opening the application '
         + 'window for the Annual Grants Fund 2028 in July 2027.',
    fields: { deadline: null, is_rolling: false, next_open_date: '2027-07-01' },
  },
  {
    id: '321ed3d9',
    what: 'Argyll & Bute Supporting Communities Fund — round closed; ceiling stated as £1,500',
    quote: 'The Supporting Communities Fund 2026 / 27 is now CLOSED. ... Maximum award '
         + 'available is £1,500',
    fields: { deadline: null, is_rolling: false, amount_max: 1500 },
  },
  {
    id: 'c2cbe217',
    what: 'Sussex CF Brighton and Hove Legacy Fund — the fund is live, the timing is not on this page',
    quote: 'Apply via our Main grants application form (check our Main grants page for dates '
         + 'when applications are open).',
    fields: { deadline: null },
  },
  {
    id: '7b924e63',
    what: 'Virgin Media O2 Apprenticeship Talent Fund — page states no closing date',
    quote: 'Apply for funding here. ... Finally, visit the portal to access Virgin Media’s pot '
         + 'and request the funds. (No closing date appears anywhere on the page.)',
    fields: { deadline: null },
  },
]

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // Resolve the 8-character prefixes the sweep worked in to full UUIDs, and
  // REFUSE on anything ambiguous rather than guessing which row was meant.
  const { data: all } = await db.from('scraped_grants')
    .select('id, title, funder, amount_min, amount_max, deadline, is_rolling, next_open_date, field_provenance')
    .not('pipeline_state', 'in', '("rejected","archived")').limit(3000)
  const rows = all ?? []

  console.log(LIVE ? '── LIVE ──' : '── DRY RUN — nothing will be written ──', '\n')
  let applied = 0, refused = 0, ambiguous = 0, wouldBlock = 0

  for (const fix of FIXES) {
    const prefix = fix.id.slice(0, 8)
    const hits = rows.filter(r => String(r.id).startsWith(prefix))
    if (hits.length !== 1) {
      console.log(`?? ${prefix}  ${fix.what}\n   ${hits.length} rows match this prefix — skipped`)
      ambiguous++
      continue
    }
    const row = hits[0] as Record<string, unknown>
    console.log(`── ${prefix}  ${String(row.funder ?? '')} — ${String(row.title ?? '')}`)
    console.log(`   ${fix.what}`)
    console.log(`   quote: "${fix.quote}"`)

    // PREDICT THE LADDER, do not merely report the holder.
    //
    // The first version of this printed "(currently admin:paulkilty1@gmail.com)"
    // beside a change and then said "would apply 6". Both true, and together a
    // lie: `system:` is trust 50 and cannot overwrite an admin field, so two of
    // the six would have been refused and the dry run promised they would not
    // be. A dry run that cannot report a refusal is not a dry run.
    const mine = trustOf(SOURCE as never, false)
    let blocked = 0
    for (const [k, v] of Object.entries(fix.fields)) {
      const prov = ((row.field_provenance ?? {}) as Record<string, { source?: string; backfilled?: boolean }>)[k]
      const same = JSON.stringify(row[k]) === JSON.stringify(v)
      const theirs = prov?.source ? trustOf(prov.source as never, prov.backfilled) : 0
      const willRefuse = !same && prov?.source && theirs > mine
      if (willRefuse) blocked++
      const note = same ? '  [no change]'
        : willRefuse ? `  [WOULD BE REFUSED — held by ${prov!.source} at trust ${theirs}, this write is ${mine}]`
        : prov?.source ? `  (currently ${prov.source}, trust ${theirs})` : ''
      console.log(`   ${k}: ${JSON.stringify(row[k])} -> ${JSON.stringify(v)}${note}`)
    }
    if (blocked > 0) {
      console.log(`   >> ${blocked} field(s) need an admin decision, not a system write. See the report.`)
      wouldBlock++
    }

    if (!LIVE) { applied++; console.log(); continue }

    const res = await mergeGrantUpdate({
      db, id: String(row.id), fields: fix.fields, source: SOURCE as never,
    })
    if (res.rejected?.length) {
      console.log(`   REFUSED by the trust ladder: ${res.rejected.map(r => `${r.field} [${r.reason}${r.blockedBy ? ", held by " + r.blockedBy.source : ""}]`).join(', ')}`)
      refused++
    } else {
      console.log(`   written: ${res.applied?.join(', ') || '(nothing changed)'}`)
      applied++
    }
    console.log()
  }

  console.log(`\n${LIVE ? 'applied' : 'would apply'} ${applied}   refused ${refused}   ambiguous ${ambiguous}   rows needing an admin decision ${wouldBlock}`)
  if (!LIVE) console.log('Re-run with --live to write.')
}
main()
