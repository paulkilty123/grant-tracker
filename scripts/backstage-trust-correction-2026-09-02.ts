// Backstage Trust, corrected 2026-09-02 against the May 2026 Information Pack.
//
// Paul asked for the row to be checked against fundingforall.org.uk. The page
// is fine and the fund is open; the pack the page links to
// (Applying-to-Backstage-Trust_May-2026.doc) contradicts four things the row
// said, all of which came from an ai_enrich pass that only saw the page:
//
//   how_to_apply       said "request the Information Pack from the trust". The
//                      pack IS the instructions: apply in writing by email to
//                      info@backstagetrust.org.uk, at most four sides of A4,
//                      no attachments, with the trust's short form.
//   decision_timeline  said "consult the pack". The pack says twelve weeks.
//   eligible_structures included sole_trader. The pack: "cannot directly fund
//                      individuals or pay training fees".
//   funder_tips        were inferred. The real tip is the pack's "shopping
//                      list": the trust often funds a small section of a much
//                      larger project.
//
// The £500,000 ceiling is Funding for All's figure; the pack states no maximum.
// The Charity Commission shows £4m to £6m spent a year (1145887), so the figure
// is plausible and is kept, but typical_award now says whose figure it is.
//
// Source is user_verified (70): above ai_enrich so a re-enrich cannot undo it,
// below admin so the row is not frozen if the trust changes its process.
//
//   npx tsx --env-file=.env.local scripts/backstage-trust-correction-2026-09-02.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const APPLY  = process.argv.includes('--apply')
const ID     = '040888ac-bdd1-4a22-9f33-cc841f9b5cbb'
const SOURCE = 'user_verified:backstage-pack-2026-09-02'

const PACK = 'https://fundingforall.org.uk/wp-content/uploads/2026/05/Applying-to-Backstage-Trust_May-2026.doc'

async function main() {
  const db = getAdminDb()
  const { data: row, error } = await db.from('scraped_grants')
    .select('id, title, funder_brief, eligible_structures, eligibility_criteria')
    .eq('id', ID).single()
  if (error || !row) throw new Error(`row not found: ${error?.message}`)
  if (!/backstage/i.test(row.title)) throw new Error(`wrong row: ${row.title}`)

  const brief = { ...(row.funder_brief as Record<string, unknown>) }
  const citations = { ...((brief._citations as Record<string, unknown>) ?? {}) }

  const set = (field: string, value: string, snippet: string) => {
    brief[field] = value
    citations[field] = { snippet, confidence: 'high', source_url: PACK }
  }

  set('how_to_apply',
    'Apply in writing by email to info@backstagetrust.org.uk, with the trust\'s short grant application form. Keep the application to four sides of A4 at most, with no other documents attached; longer applications are not considered. Include your contact details, a brief description of your organisation and why it fits the trust\'s criteria, a summary of the project with its full cost, completion date and budget breakdown, a shopping list of the project\'s separate parts, your fundraising plans and how much is already pledged, and how the project will be monitored and evaluated. The form and the guidance are in the Information Pack on the Funding for All page. The trust has no website.',
    'please do so in writing and submit your application by email. Your application should be no more than four sides of A4: applications longer than this, or accompanied by other documentation, will not be considered for support.')

  set('decision_timeline',
    'No deadline; applications are accepted at any time. The trust aims to say within twelve weeks of receipt whether the trustees can consider the project. If the ask is urgent, say so when you email.',
    'we would hope to let you know within twelve weeks of receipt of your application if the Trustees are able to consider your project.')

  set('exclusions',
    'Only registered charities and Community Interest Companies can apply. The trust cannot fund individuals directly or pay training fees. Organisations without a robust safeguarding policy are not supported; a copy is requested if the application succeeds. Applications over four sides of A4, or with documents attached, are not considered.',
    'the trust cannot directly fund individuals or pay training fees. In addition, Backstage Trust is only able to support organisations with a robust safeguarding policy in place')

  set('who_can_apply',
    'Registered charities and Community Interest Companies with a focus on the performing arts, particularly theatre and music. A robust safeguarding policy must be in place. Individuals cannot be funded.',
    'Backstage can only make grants to registered charities or Community Interest Companies. Please note that the trust cannot directly fund individuals or pay training fees.')

  set('funder_tips',
    'Give the trust a shopping list: it often funds one small section of a much larger project, so break the budget into separately fundable parts and it can pick one. Say how much is already pledged. The trust also says it will fund the less appealing items of capital projects, so the unglamorous line is a fair ask. Four sides of A4 is a hard limit.',
    'a "shopping list" of different aspects of the project – Backstage is often able to fund a small section of a much larger project')

  set('typical_award',
    'No minimum or maximum is stated by the trust. Funding for All lists the fund as up to £500,000; the trust spends between £4m and £6m a year across its grants.',
    'There is no specified minimum or maximum amount you can apply for.')

  brief._citations = citations
  brief.last_enriched = '2026-09-02'

  const fields: Record<string, unknown> = {
    title: 'Backstage Trust performing arts grants',
    description: 'Grants to UK registered charities and Community Interest Companies in the performing arts, particularly theatre and music. Supports young people\'s involvement, community participation in live arts, professional development for small and medium arts organisations, freelance performing arts workers, new writing, and parts of capital projects. Applications are accepted at any time, by email, on four sides of A4 at most. The trust states no minimum or maximum; Funding for All lists it as up to £500,000.',
    eligible_structures: ['registered_charity', 'cio', 'scio', 'cic_guarantee', 'cic_shares'],
    funder_brief: brief,
    // untracked, passes straight through
    eligibility_criteria: ['Registered charity or CIC', 'Performing arts focus, particularly theatre and music', 'Robust safeguarding policy in place', 'Cannot fund individuals or training fees'],
  }

  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}: ${row.title}`)
  console.log('  was eligible_structures:', row.eligible_structures)
  console.log('  fields:', Object.keys(fields).join(', '))
  if (!APPLY) { console.log('  pass --apply to write'); return }

  const r = await mergeGrantUpdate({ id: ID, fields, source: SOURCE, db })
  console.log('  applied:', r.applied.join(', ') || 'nothing')
  if (r.rejected.length) console.log('  REJECTED:', JSON.stringify(r.rejected))
}

main().catch(e => { console.error(e); process.exit(1) })
