// Funds for individuals were tagged as if they took organisations.
//
// Paul, on Doc Society: "might be worth having for individuals, think they are
// worth keeping." Keeping them is the easy half. The half that matters is that
// sixteen live rows describe individual applicants in their own eligibility
// prose, and twelve of them carry ONLY organisation structures in
// `eligible_structures` — which is the field the matcher treats as a hard gate.
//
// So a registered charity is currently being told it qualifies for the Beinneun
// Student Scholarship ("individuals aged 16 or over who are residents of Fort
// Augustus") and for Barrhill Greener Homes ("individual residents aged 18 or
// over... you must own the property"). It cannot apply to either. That is the
// exact failure CLAUDE.md rule 6 exists to prevent, arriving from the other
// direction: not a withheld exclusion, but an asserted eligibility that is false.
//
// NARROWING IS THE SAFE DIRECTION HERE, and it is worth being explicit about why,
// because the publish gate's `tags_changed` note says the opposite for the usual
// case: "Narrowing hides a fund from SOME organisations; it never shows a fund to
// someone barred from it." Correct — and it means removing an organisation
// structure from a fund that never accepted organisations costs nobody a real
// match and stops a wasted application.
//
// THREE GROUPS, and the difference is what the funder's own words support:
//
//   ONLY  — the prose describes individuals, residents or students and says
//           nothing about an organisation applying. Set to ['individual'].
//   BOTH  — the prose names individuals AND groups or organisations. Add
//           'individual' and keep what is there.
//   HEDGE — the prose is unsure ("applications APPEAR to be from individuals").
//           Widened, not narrowed, and flagged for a page read. Guessing a
//           narrowing on hedged evidence is how a real fund gets hidden.
//
//   npx tsx --env-file=.env.local scripts/fix-individual-eligibility-2026-08-20.ts --dry
//   npx tsx --env-file=.env.local scripts/fix-individual-eligibility-2026-08-20.ts
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const DRY = process.argv.includes('--dry')
const SOURCE = 'user_verified:individual-eligibility-2026-08-20'

/** Individuals only. Every organisation structure comes off. */
const ONLY: { id: string; title: string; quote: string }[] = [
  { id: '8cb185b7-a64e-47e3-9d35-43bd8b4c73a5', title: 'Ballantrae Education and Training Fund',
    quote: 'Individuals aged 17 or over living in the Ballantrae Community Council area. Priority given to those aged 17-25.' },
  { id: '0b19ebd6-86f5-4dff-a893-e29bd76fd18d', title: 'Barr Education and Training Fund',
    quote: 'Individuals aged 16 or over living in the Barr Community Council area of South Ayrshire. Applicants must be accepted onto their course.' },
  { id: '5bcec32a-a050-45b4-9788-7d1dece0ed19', title: 'Barrhill Education & Training Fund',
    quote: 'Individuals aged 16 or over resident in Barrhill Community Council area, applying for a further education or training course.' },
  { id: '5aaf0863-889f-47cb-8426-a195e2ebe153', title: 'Barrhill Greener Homes',
    quote: 'Individual residents aged 18 or over who live in the Barrhill Community Council area. You must own the property or have written permission.' },
  { id: 'bd579490-8767-407b-87c8-64d969215de6', title: 'Beinneun Student Scholarship Fund',
    quote: 'Individuals aged 16 or over who are residents of Fort Augustus, Glenmoriston or Glengarry, applying for further or higher education.' },
  { id: '7b86b8ec-59d4-4b89-89d7-965cb90bc0ad', title: 'Forth Giving',
    quote: 'Individuals aged over 16, normally resident in Stirling, Clackmannanshire or Falkirk Council areas.' },
  { id: 'd2116281-d83f-4ade-9777-c8f662315895', title: 'Monmouthshire Further Education Trust Fund',
    quote: 'Individuals aged 25 or under who reside in the County of Monmouthshire as it existed in 1956.' },
  { id: 'aaad3738-7828-439c-95a7-ef6da781ed02', title: 'Thomas John Jones Memorial Fund',
    quote: 'Students living in or who have attended schools in eligible areas of Breconshire or Blaenau Gwent.' },
  { id: '4df9ef88-e673-4507-96e9-f6764d0b54d0', title: 'Hackney — Crisis and Resilience Fund',
    quote: 'Individuals and households living in the London Borough of Hackney who are struggling to afford essentials.' },
]

/** Genuinely open to both. Add `individual`, keep everything else. */
const BOTH: { id: string; title: string; quote: string }[] = [
  { id: 'e6379d1a-0437-4ea5-9bca-06385dfd7c08', title: 'Andy Fanshawe Memorial Trust',
    quote: 'Disadvantaged young people, either as individuals or in small groups.' },
  { id: '3410838c-128e-4870-ace5-c082f194cdcb', title: 'Haggerston Estate Micro Grants Fund',
    quote: "L&Q residents and residents' groups of the Haggerston Estate. No formal charity registration or legal structure required." },
  { id: '5a368644-3211-4a40-9447-d5594938a519', title: 'Lambeth Community Connections Fund',
    quote: 'Individuals and community groups can apply.' },
  { id: 'ced26048-d908-4919-bc4b-0bdad1c2d155', title: 'Spacehive',
    quote: 'Individuals and community groups can create and lead projects.' },
  { id: 'ddc93bb0-b74d-42e7-86a7-172f9a39913c', title: 'SSE Start Up Programme',
    quote: 'Individuals and organisations at startup or early stage developing social or environmental enterprises.' },
  { id: 'a9bf3c97-5e60-403d-9951-6fc218d4150c', title: 'Start Up Loans — South West',
    quote: 'Individuals aged 18+ with a viable business idea. Sole traders, limited companies, and partnerships are eligible.' },
]

/** Hedged prose. Widen only, and say so. */
const HEDGE: { id: string; title: string; quote: string }[] = [
  { id: 'ed3f6ba2-c76c-4b44-9bf4-5846f4ad4bed', title: 'James Ahern Foundation',
    quote: 'Young people at some kind of disadvantage. Applications APPEAR to be from individuals rather than organisations — hedged, so widened rather than narrowed. Needs the page read.' },
]

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const targets = [
    ...ONLY.map(r => ({ ...r, mode: 'only' as const })),
    ...BOTH.map(r => ({ ...r, mode: 'both' as const })),
    ...HEDGE.map(r => ({ ...r, mode: 'hedge' as const })),
  ]

  let applied = 0, refused = 0
  for (const t of targets) {
    const { data } = await db.from('scraped_grants').select('eligible_structures').eq('id', t.id).limit(1)
    if (!data?.length) { console.log(`  NOT FOUND ${t.title}`); continue }
    const current: string[] = (data[0].eligible_structures as string[] | null) ?? []

    const next = t.mode === 'only'
      ? ['individual']
      : Array.from(new Set([...current, 'individual']))

    const removed = current.filter(s => !next.includes(s))
    console.log(`\n── ${t.title}`)
    console.log(`   was: [${current.join(', ') || '(empty)'}]`)
    console.log(`   now: [${next.join(', ')}]${removed.length ? `   removed: ${removed.join(', ')}` : ''}`)
    if (DRY) continue

    const r = await mergeGrantUpdate({
      id: t.id,
      fields: { eligible_structures: next },
      source: SOURCE,
      db,
      citations: { eligible_structures: { snippet: t.quote, confidence: t.mode === 'hedge' ? 'low' : 'high' } },
    })
    applied += r.applied.length
    if (r.rejected?.length) {
      refused += r.rejected.length
      console.log(`   REFUSED: ${r.rejected.map(x => `${x.field} (${x.reason}, held by ${x.blockedBy?.source})`).join('; ')}`)
    }
  }

  if (DRY) { console.log('\nDRY RUN — nothing written.\n'); return }
  console.log(`\nfields applied: ${applied}   refused: ${refused}`)

  // The floor: read back and prove no individual-only fund still admits an org.
  const { data: after } = await db.from('scraped_grants')
    .select('title, eligible_structures')
    .in('id', ONLY.map(r => r.id))
  const leaky = (after ?? []).filter(r => {
    const es = (r.eligible_structures as string[] | null) ?? []
    return es.some(s => s !== 'individual')
  })
  console.log(`individual-only rows still admitting an organisation: ${leaky.length}`)
  for (const r of leaky) console.log(`  ${r.title}: ${(r.eligible_structures as string[]).join(', ')}`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
