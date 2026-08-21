// Eleven funds from an Idox Open4Community feed, checked against the catalogue.
//
// The feed's own links are login-walled, so each was researched on the funder's
// own site instead — the rule already in the ledger for this source.
//
// ALREADY HELD (3):
//   Morrisons Foundation   live, £20,000, already on
//                          /connecting-communities-grant-request. No change.
//   Commonweal Housing     ARCHIVED, and its own site says "Now Open" — "Apply
//                          for funding to explore housing ideas that can improve
//                          outcomes for at-risk youth". Revived to the queue.
//   Esmée Communities &    Held as "Next expression of interest round expected
//   Collections            January 2027". The Museums Association says it will
//                          "open for applications in the week commencing 28
//                          September 2026". Four months wrong, and a museum
//                          reading our card would not look again this year.
//
// NEW, RESEARCHED, IN SCOPE (6), staged INACTIVE for Paul to activate, per the
// standing rule that nothing enters the catalogue live.
//
// FOUND ALONG THE WAY: Henry Smith's Career Ready fund is open on their grants
// page and absent from the catalogue. Not on the feed; added because it was there.
//
// OUT OF SCOPE (2), not added: the Low Carbon Fuels Fund is £93m for sustainable
// aviation fuel producers, and the Cladding Safety Scheme is for building owners
// remediating cladding. Neither is something a charity applies to a funder for.
//
// UNIDENTIFIED (1): "Funding for UK Healthcare Delivery Projects" is too vague to
// pin down. The likeliest matches are the Hospital Saturday Fund, whose 11 August
// deadline had passed before the feed item, and MSD UK's second 2026 window
// closing 8 September. Guessing between them would put a wrong funder in the
// catalogue, so it is reported rather than added.
//
//   npx tsx --env-file=.env.local scripts/add-idox-feed-2026-08-21.ts --dry
//   npx tsx --env-file=.env.local scripts/add-idox-feed-2026-08-21.ts
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate, stampNewGrant } from '../src/lib/grant-merge'

const DRY = process.argv.includes('--dry')
// `system:` and not `admin:` — these are staged FOR review, not reviewed. An
// admin source carries full trust and would permanently block re-enrichment.
const SOURCE = 'system:idox-feed-2026-08-21'

const NEW_ROWS: Record<string, unknown>[] = [
  {
    title: 'Henry Smith Foundation — Maternity Equity',
    funder: 'Henry Smith Foundation',
    apply_url: 'https://henrysmith.foundation/grants/',
    funding_type: 'grant',
    is_rolling: false,
    next_open_date: 'Listed as Coming Soon; no opening date published',
    description: 'Supporting organisations delivering preventative maternity support during pregnancy and birth. Listed as "Coming Soon" on the Henry Smith grants page as at 21 August 2026; criteria, amounts and dates not yet published.',
  },
  {
    title: 'Heart Research UK — Healthy Hearts Grants (Northern Ireland)',
    funder: 'Heart Research UK',
    apply_url: 'https://heartresearch.org.uk/what-we-do/community-health/healthy-hearts-grants/',
    funding_type: 'grant',
    amount_max: 15000,
    deadline: '2026-09-16',
    is_rolling: false,
    description: 'Grants of up to £15,000 for new, original and innovative work that actively promotes a healthy heart and helps prevent or reduce the risk of heart disease in local communities. Open to UK not-for-profit organisations including registered charities, community groups, voluntary organisations and sports and physical activity clubs. The Northern Ireland window opened at 9am on 19 August 2026 and closes at 5pm on 16 September 2026; the programme runs regional windows through the year.',
  },
  {
    title: 'Sunrise Medical Community Fund',
    funder: 'Sunrise Medical',
    apply_url: 'https://www.sunrisemedical.co.uk/community-fund',
    funding_type: 'grant',
    amount_max: 5000,
    deadline: '2026-09-30',
    is_rolling: false,
    description: 'Grants of up to £5,000 to break down the financial and practical barriers that prevent people living with mobility challenges from participating fully in their communities. Open to individuals, families, community groups, charities, disability organisations and sports clubs across the UK, for projects helping wheelchair users and disabled people to greater independence, inclusion and opportunity. Closes 11:59pm on 30 September 2026.',
  },
  {
    title: 'Macmillan Q Lab — Holistic Cancer Care',
    funder: 'Macmillan Cancer Support / Q (NHS Alliance)',
    apply_url: 'https://www.macmillan.org.uk/about-us/what-we-do/macmillan-funding-grants/q-lab',
    funding_type: 'programme',
    amount_min: 75000,
    amount_max: 200000,
    deadline: '2026-09-14',
    is_rolling: false,
    description: 'A nine-month innovation lab asking "How might we reimagine holistic cancer care closer to people\'s homes?" Teams receive £75,000 for nine months of workshops, facilitated peer learning and coaching on a design process, with the opportunity to apply for up to £200,000 more to put ideas into practice over a further twelve months. Applications require a TEAM of community organisations and public sector organisations working together. Team applications 27 July to 14 September 2026; individual expressions of interest 8 September to 7 October 2026.',
  },
  {
    // Paul's call, 2026-08-21: "keep Celebrate Towns". Worth recording why it was
    // a call at all. TOWNS enter, not charities — the press material asks
    // communities to "encourage their local MPs, councillors and Business
    // Improvement Districts to share their success stories" — so a charity is
    // rarely the entrant. But the £20,000 goes "towards community-led projects",
    // which is money reaching the audience by a route they can influence, and a
    // fundraiser who knows the competition exists can get their town to enter.
    title: "Let's Celebrate Towns",
    funder: 'Visa and Nationwide',
    apply_url: 'https://www.atcm.org/lets-celebrate',
    funding_index_url: 'https://www.visaeupromotions.com/lets-celebrate-towns/visa-nationwide',
    funding_type: 'grant',
    amount_min: 20000,
    amount_max: 20000,
    deadline: '2026-10-25',
    is_rolling: false,
    description: "A national competition run by Visa with Nationwide, now in its fourth year, spotlighting UK high streets and communities. Entries run 17 August to 25 October 2026 across five categories: High Street Revival, Backing Local Business, Protecting Valued Places, Connected Places and Community Pride. Winning towns each receive a £20,000 grant towards community-led projects or new initiatives that give small businesses a boost. Judged by an independent panel, winners announced at an awards ceremony in Parliament on 14 December 2026. NOTE: towns enter rather than individual organisations, usually via a Business Improvement District, council or MP. A charity's route in is to get its town to enter.",
  },
  {
    title: 'Henry Smith Foundation — Career Ready',
    funder: 'Henry Smith Foundation',
    apply_url: 'https://henrysmith.foundation/grants/',
    funding_type: 'grant',
    is_rolling: false,
    description: 'Funding organisations working in careers education for young people. Listed as open on the Henry Smith grants page as at 21 August 2026; amounts and deadline not stated on the index. Not on the Idox feed — found while checking the Maternity Equity fund and absent from the catalogue.',
  },
]

const ESMEE = '29ccb203-29b4-4ebf-815c-a67377452510'
const COMMONWEAL = '7f8efdf7-22e9-4d06-aee8-62b18008c247'

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  console.log('── corrections to rows we already hold')
  if (DRY) {
    console.log('   Esmée Communities & Collections → opens w/c 28 Sep 2026 (dry)')
    console.log('   Commonweal Housing → back into the queue (dry)')
  } else {
    const r1 = await mergeGrantUpdate({
      id: ESMEE,
      fields: {
        next_open_date: 'Opens for applications in the week commencing 28 September 2026',
        next_open_date_parsed: '2026-09-28',
        apply_url: 'https://www.museumsassociation.org/funding/efccf/',
      },
      source: SOURCE, db,
      citations: { next_open_date: { snippet: 'museumsassociation.org/funding/efccf/, read 2026-08-21: the fund will "open for applications in the week commencing 28 September 2026", with "renewed criteria and guidance" published then. Our row said January 2027.', confidence: 'high' } },
    })
    console.log(`   Esmée Communities & Collections: ${r1.applied.join(', ') || '(nothing)'}`)
    if (r1.rejected?.length) console.log(`      REFUSED: ${JSON.stringify(r1.rejected)}`)

    const r2 = await mergeGrantUpdate({
      id: COMMONWEAL,
      fields: { pipeline_state: 'tagged_awaiting_review', is_active: false },
      source: SOURCE, db,
      citations: { pipeline_state: { snippet: 'commonwealhousing.org.uk, read 2026-08-21: the call is "Now Open" — "Apply for funding to explore housing ideas that can improve outcomes for at-risk youth." The row was archived.', confidence: 'high' } },
    })
    console.log(`   Commonweal Housing: ${r2.applied.join(', ') || '(nothing)'}`)
  }

  console.log('\n── new rows, staged inactive')
  let added = 0
  for (const row of NEW_ROWS) {
    const { data: dupe } = await db.from('scraped_grants').select('id').eq('title', row.title as string).limit(1)
    if (dupe?.length) { console.log(`   ALREADY PRESENT: ${row.title}`); continue }
    console.log(`   ${String(row.title).slice(0, 52).padEnd(54)} ${row.funder}`)
    if (DRY) continue
    const stamped = stampNewGrant({ ...row, source: SOURCE, is_active: false }, SOURCE as never)
    const { error } = await db.from('scraped_grants').insert(stamped)
    if (error) { console.log(`      FAILED: ${error.message}`); continue }
    added++
  }

  if (DRY) { console.log('\nDRY RUN — nothing written.\n'); return }
  console.log(`\nadded: ${added}/${NEW_ROWS.length}`)

  const { data: check } = await db.from('scraped_grants')
    .select('title, is_active, pipeline_state, deadline').in('title', NEW_ROWS.map(r => r.title as string))
  console.log('\nverified — nothing live:')
  for (const c of (check ?? []) as { title: string; is_active: boolean; pipeline_state: string; deadline: string | null }[]) {
    console.log(`   ${c.title.slice(0, 50).padEnd(52)} ${c.pipeline_state.padEnd(22)} ${c.is_active ? 'LIVE ← WRONG' : 'staged'}  ${c.deadline ?? ''}`)
  }
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
