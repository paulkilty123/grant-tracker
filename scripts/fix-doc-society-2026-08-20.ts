// Doc Society: keep the row, make it true.
//
// Paul: "might be worth having for individuals, think they are worth keeping."
// So this is not a withdrawal. It is the three things that were wrong regardless
// of who the row is for.
//
// 1. THE TITLE NAMES A FUND THAT DOES NOT EXIST. "Good Pitch & Documentary Fund"
//    is two things welded together: Good Pitch is a convening event that
//    introduces filmmakers to funders and campaign partners, and nothing on
//    docsociety.org/funds/ is called a Documentary Fund. The page lists eight
//    named funds, three of them open. The row is a front door over all of them,
//    so it is titled and linked as one.
//
// 2. THE AMOUNTS WERE NOT THE FUNDER'S. £10,000 to £200,000 appears nowhere.
//    The published position is "the total Doc Society contribution to your
//    project cannot exceed £150,000", with single awards "likely to fall in the
//    £30K range for development and from £50,000 to £80,000 for production".
//
// 3. `individual` was missing from the structures, which is the whole point of
//    keeping it: "applications must be made by the project's dedicated
//    individual producer, through a limited company registered and centrally
//    managed in the UK" — as an individual OR through their UK company. The
//    existing tags already excluded charities correctly; they just did not
//    include the person the fund is actually for.
//
//   npx tsx --env-file=.env.local scripts/fix-doc-society-2026-08-20.ts --dry
//   npx tsx --env-file=.env.local scripts/fix-doc-society-2026-08-20.ts
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const DRY = process.argv.includes('--dry')
const ID = 'b3dac130-3d54-4bb6-8714-034016f18611'
const SOURCE = 'user_verified:doc-society-2026-08-20'

const SNIPPET =
  'docsociety.org/funds/ lists eight funds — Doc Society Fund, Climate Story Fund, BFI Doc Society Production, '
  + 'Development, Made of Truth, Expanded Screen and RAD Funds, and the BFI Doc Society Talent Development Programme. '
  + 'Three are open. No fund is called "Good Pitch" or "Documentary Fund"; Good Pitch is a convening event. '
  + 'BFI Doc Society guidance: "Applications must be made by the project\'s dedicated individual producer, through a '
  + 'limited company registered and centrally managed in the UK", and "the total Doc Society contribution to your '
  + 'project cannot exceed £150,000", with awards "likely to fall in the £30K range for development and from £50,000 '
  + 'to £80,000 for production".'

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data } = await db.from('scraped_grants').select('funder_brief, eligible_structures').eq('id', ID).limit(1)
  if (!data?.length) { console.error('row not found'); process.exit(1) }
  const brief = { ...((data[0].funder_brief ?? {}) as Record<string, unknown>) }
  const current = (data[0].eligible_structures as string[] | null) ?? []

  brief.who_can_apply =
    'Independent documentary filmmakers and non-fiction storytellers, not organisations delivering services. '
    + 'Applications are made by the project\'s dedicated individual producer, either as an individual or through a '
    + 'limited company registered and centrally managed in the UK. The BFI-backed funds require UK filmmakers. '
    + 'A charity can be a campaign or outreach partner on a Good Pitch project, but is not the applicant.'
  brief.how_to_apply =
    'Start at docsociety.org/funds/, which lists every fund and marks each open or closed. Three are open: the Doc '
    + 'Society Fund, the BFI Doc Society Production Fund and the BFI Doc Society Talent Development Programme. '
    + 'Each fund has its own guidelines and its own window.'

  const fields: Record<string, unknown> = {
    title: 'Doc Society — Documentary Film Funds',
    amount_min: 30000,
    amount_max: 150000,
    funding_index_url: 'https://docsociety.org/funds/',
    eligible_structures: Array.from(new Set([...current, 'individual'])),
    funder_brief: brief,
  }

  if (DRY) { console.log(JSON.stringify({ ...fields, funder_brief: '(updated)' }, null, 2), '\n(dry)'); return }

  const citations = Object.fromEntries(
    Object.keys(fields).map(k => [k, { snippet: SNIPPET, confidence: 'high' as const }]),
  )
  const r = await mergeGrantUpdate({ id: ID, fields, source: SOURCE, db, citations })
  console.log(`applied:  ${JSON.stringify(r.applied)}`)
  if (r.rejected?.length) console.log(`REFUSED:  ${r.rejected.map(x => `${x.field} (${x.reason}, held by ${x.blockedBy?.source})`).join('; ')}`)

  const { data: after } = await db.from('scraped_grants')
    .select('title, amount_min, amount_max, funding_type, eligible_structures, funding_index_url').eq('id', ID).limit(1)
  console.log('\nnow:', JSON.stringify(after?.[0], null, 2))
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
