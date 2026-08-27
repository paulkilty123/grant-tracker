/* eslint-disable @typescript-eslint/no-explicit-any */
// Armed Forces Covenant Fund Trust — amounts the crawler never went to look for.
//
// crawlArmedForcesCovenant (crawl.ts) reads ONE page, the /programmes/ listing,
// and takes the amount from each card's blurb:
//     const { min, max } = parseAmountRange(desc + ' ' + title)
// It captures the programme URL and never opens it. So a row's amount is
// whatever the listing card happened to mention, and the figures on the
// programme page itself are never read. Of the three live rows: one had both
// figures, one had a max and no min, one had nothing at all and rendered
// "Amount on application" while its page says "Grants of £5,000 to £150,000".
//
// user_verified (70) beats scraper (40), so the daily crawl cannot put these
// back to null, and it does not pin, so a real read can still improve them.
//
//   npx tsx --env-file=.env.local scripts/covenant-amounts-2026-08-27.ts --dry
//   npx tsx --env-file=.env.local scripts/covenant-amounts-2026-08-27.ts
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const SOURCE = 'user_verified:covenant-amounts-2026-08-27'
const DRY    = process.argv.includes('--dry')

const FIXES = [
  {
    id: 'd5cd29aa-66e9-494c-89d1-c78a3c594474',
    title: 'Service Pupil Support programme',
    min: 5000, max: 150000,
    snippet: 'Grants of £5,000 to £150,000 are available for projects supporting service pupils aged 4-18 in full-time education.',
    url: 'https://covenantfund.org.uk/programme/the-service-pupil-support-programme/',
  },
  {
    id: null as string | null,   // resolved by title below
    title: 'Reveal and Respond programme',
    min: 20000, max: 300000,
    snippet: 'Grants of £20,000 to £300,000. Strand 1 offers grants of between £20,000 and £40,000; Strand 2 offers larger grants of between £150,000 and £300,000.',
    url: 'https://covenantfund.org.uk/programme/reveal-and-respond-programme/',
  },
]

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  for (const f of FIXES) {
    let id = f.id
    if (!id) {
      const { data } = await db.from('scraped_grants').select('id')
        .eq('source', 'armed_forces_covenant').eq('title', f.title).maybeSingle()
      if (!data) { console.log(`── ${f.title}: NOT FOUND, skipped`); continue }
      id = (data as any).id
    }
    const { data: before } = await db.from('scraped_grants')
      .select('title, amount_min, amount_max, is_active, field_provenance').eq('id', id!).maybeSingle()
    const b = before as any
    console.log(`── ${b.title}  (live=${b.is_active})`)
    console.log(`   before: ${b.amount_min} – ${b.amount_max}   held by ${b.field_provenance?.amount_max?.source ?? 'nobody'}`)
    if (b.amount_min === f.min && b.amount_max === f.max) { console.log('   already correct'); continue }
    if (DRY) { console.log(`   DRY — would write ${f.min} – ${f.max}`); continue }

    const citation = { snippet: f.snippet, confidence: 'high' as const, reason: `Read from ${f.url} on 2026-08-27.` }
    const r = await mergeGrantUpdate({
      id: id!,
      fields: { amount_min: f.min, amount_max: f.max },
      source: SOURCE,
      pinned: false,
      db,
      citations: { amount_min: citation, amount_max: citation },
    })
    console.log(`   applied : ${JSON.stringify(r.applied)}`)
    if (r.rejected.length) console.log(`   rejected: ${JSON.stringify(r.rejected)}`)

    const { data: after } = await db.from('scraped_grants').select('amount_min, amount_max').eq('id', id!).maybeSingle()
    console.log(`   after : ${(after as any).amount_min} – ${(after as any).amount_max}`)
  }
}
main().catch(e => { console.error(e.message); process.exit(1) })
