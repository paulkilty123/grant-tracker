// The programmes tab, after Paul noticed Impact Hub linking a homepage.
//
// He was right about the symptom and wrong about the conclusion, which is the
// useful bit: Impact Hub DOES have a live programme. "Together for Wellbeing: A
// Mental Health Incubator — Applications now open!" It is on
// london.impacthub.net/programmes, and we link the homepage, which shows a news
// item about the cohort and no way in. So the fund looked dead because of where
// we pointed, not because it is.
//
// Five of the 24 live programme rows link a homepage. Two of those hide an open
// programme one click down:
//
//   Impact Hub    /programmes — Together for Wellbeing, open
//   Hatch         /programmes/ — Launchpad, Incubator, Accelerator and the
//                 Greener Southwark Business Accelerator, all open
//
// AND ONE IS NOT FUNDING AT ALL. The AI Growth Lab's own page: "This is not a
// funding scheme." Participants get "coordinated engagement with relevant
// regulators and delivery partners" — a regulatory sandbox, listed on
// find-government-grants because that is where DBIST publishes things. It is
// also a gov.uk row, which is the source Paul had switched off on 18 August.
//
//   npx tsx --env-file=.env.local scripts/fix-programmes-2026-08-20.ts --dry
//   npx tsx --env-file=.env.local scripts/fix-programmes-2026-08-20.ts
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const DRY = process.argv.includes('--dry')
const SOURCE = 'user_verified:programmes-review-2026-08-20'

const RELINK = [
  {
    id: 'c57f8bba-b4e4-4a24-997a-90a2c59ff573',
    title: 'Impact Hub Programmes',
    fields: {
      apply_url: 'https://london.impacthub.net/programmes',
      funding_index_url: 'https://london.impacthub.net/programmes',
    },
    quote: 'london.impacthub.net/programmes lists "Together for Wellbeing: A Mental Health Incubator — Applications now open!" '
      + 'alongside five past programmes (Together for Wellbeing 2025, ASSETS, Boosting Life Sciences & Social Economy, New Roots, '
      + 'The Circular Startup), all closed. The homepage we linked shows a news item about the cohort and no route in.',
  },
  {
    id: 'acbff6c1-4f2f-47a7-8f98-58d0f2072410',
    title: 'Hatch Enterprise Business Support Programme',
    fields: {
      apply_url: 'https://hatchenterprise.org/programmes/',
      funding_index_url: 'https://hatchenterprise.org/programmes/',
    },
    quote: 'hatchenterprise.org/programmes/ lists Launchpad, Incubator, Accelerator and the Greener Southwark Business '
      + 'Accelerator, all marked "Applications are now open!" The homepage says applications are open without naming a programme.',
  },
]

const WITHDRAW = {
  id: '29740517-2d8b-4557-9d95-c85743c238b3',
  title: 'AI Growth Lab',
  reason: 'out_of_scope: the fund\'s own page states "This is not a funding scheme." Participants receive "coordinated '
    + 'engagement with relevant regulators and delivery partners" — a regulatory sandbox for AI in the legal sector, not '
    + 'money or support a charity applies for. Listed on find-government-grants because that is where DBIST publishes, '
    + 'and gov.uk is the source withdrawn on 2026-08-18. Withdrawn 2026-08-20.',
}

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  console.log('── relinked: an open programme was one click below the page we pointed at')
  for (const r of RELINK) {
    console.log(`   ${r.title.slice(0, 44).padEnd(46)} → ${r.fields.apply_url}`)
    if (DRY) continue
    const citations = Object.fromEntries(Object.keys(r.fields).map(k => [k, { snippet: r.quote, confidence: 'high' as const }]))
    const res = await mergeGrantUpdate({ id: r.id, fields: r.fields, source: SOURCE, db, citations })
    console.log(`      applied: ${res.applied.join(', ') || '(nothing)'}`)
    if (res.rejected?.length) console.log(`      REFUSED: ${JSON.stringify(res.rejected)}`)
  }

  console.log('\n── withdrawn: not funding')
  console.log(`   ${WITHDRAW.title}`)
  if (!DRY) {
    const res = await mergeGrantUpdate({
      id: WITHDRAW.id,
      fields: { is_active: false, pipeline_state: 'rejected', rejection_reason: WITHDRAW.reason },
      source: SOURCE, db,
      citations: { pipeline_state: { snippet: WITHDRAW.reason, confidence: 'high' } },
    })
    console.log(`      applied: ${res.applied.join(', ') || '(nothing)'}`)
  }

  if (DRY) { console.log('\nDRY RUN — nothing written.\n'); return }
  const { data } = await db.from('scraped_grants')
    .select('title, apply_url, is_active, pipeline_state')
    .in('id', [...RELINK.map(r => r.id), WITHDRAW.id])
  console.log('\nverified:')
  for (const d of (data ?? []) as { title: string; apply_url: string; is_active: boolean; pipeline_state: string }[]) {
    console.log(`   ${d.title.slice(0, 40).padEnd(42)} ${d.is_active ? 'live' : 'withdrawn'}  ${d.apply_url}`)
  }
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
