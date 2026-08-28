// The verdicts document, applied. Paul's list, in his order.
//
// Three of these reverse something I said earlier today, and the reversals are
// the reason the document exists:
//
//   RENEW. I said apply the repoint, having checked the URL returned 200.
//   gmet.org.uk rewrites any unknown path to a site search and answers 200, so
//   the page never existed and my check could not have told me. Proved it since:
//   /this-path-does-not-exist-abc123 also returns 200, at /search?search=this+path…
//   The row is withdrawn instead of repointed.
//
//   GROCERS'. I said the repoint rested on a false premise because the old URL
//   returned 200. It returns 200 and REDIRECTS to /apply-for-a-grant. I printed
//   the status code and not the effective URL, so I read a redirect as a live
//   page. The repoint was right and I was wrong to hold it.
//
//   CATALYSEHER, CHICHESTER, CROWDFUNDER, ARTS COUNCIL. All four were
//   recommended for withdrawal on a CAPTCHA. All four are live routes to money.
//   CatalyseHer closes on 7 September.
//
// Not touched here: the five judgement withdrawals, the two splits and the GLA
// scope question. Those wait for Paul.
//
//   npx tsx --env-file=.env.local scripts/apply-verdicts-2026-08-28.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate, stampNewGrant } from '../src/lib/grant-merge'
import { formatRejectReason } from '../src/lib/admin/reject-reasons'

const APPLY = process.argv.includes('--apply')

const CATALYSEHER = '1e6c3908-dde9-4254-9a64-1ddba2f5d4a4'
const GROCERS     = 'e8b2a1c0-0000-0000-0000-000000000000' // resolved by title below
const SEVERN      = '0ac6d1d9-0000-0000-0000-000000000000'
const SUNLEY      = '0000'

/** Rows to withdraw, with the sentence from the funder's own page that decides it. */
const WITHDRAW: { title: string; code: string; why: string }[] = [
  { title: 'One Croydon Alliance Community Funding', code: 'non_funder',
    why: 'The page lists other people\'s funds — London Hearts defibrillator grants, Croydon Common Ground, the Displaced Children fund. One Croydon Alliance is a health and care partnership, not a funder.' },
  { title: 'Access Growth Fund', code: 'out_of_scope',
    why: 'Access funds intermediaries, not frontline organisations: "Access is open to applications from social investors and fund managers to develop future funds." A charity cannot apply whatever the fund is called.' },
  { title: 'ChangemakerXchange Fellowship', code: 'non_funder',
    why: 'No grant, fellowship or money of any kind on the site. Members "join the community through our programmes: immersive journeys where they connect, learn, and collaborate".' },
  { title: 'WCIT AI/ML Learning Exchange for Charities', code: 'non_funder',
    why: '"Helping charities and not-for-profits embarking on Artificial Intelligence/Machine Learning with thought leadership and practical advice." Workshops and a knowledge repository, no money.' },
  { title: 'The Cadogan Charity — General Grants', code: 'non_funder',
    why: 'The page describes what they have given and to whom, and carries no application process, no eligibility criteria and no contact route for applicants. A description of generosity is not a door.' },
  { title: 'Social Business Trust — Strategic Growth Support', code: 'non_funder',
    why: 'SBT selects rather than receives: "We find social enterprises with a compelling mission, inspiring leaders, and an ambition to grow." No form, no expression of interest, no open call, only an info@ address.' },
]

async function main() {
  const db = getAdminDb()
  if (!APPLY) console.log('DRY RUN — nothing written. Pass --apply.\n')

  const byTitle = async (title: string) => {
    const { data } = await db.from('scraped_grants').select('id, title, apply_url, is_active').eq('title', title).limit(1)
    return (data as any[])?.[0] ?? null
  }

  const write = async (what: string, id: string, fields: Record<string, unknown>, source: string,
                       citations?: Record<string, { snippet: string; confidence: 'high' | 'med' | 'low' }>) => {
    if (!APPLY) { console.log(`[dry] ${what}: ${Object.keys(fields).join(', ')}`); return }
    const r = await mergeGrantUpdate({ id, db, fields, source, citations })
    console.log(`${what}: applied [${r.applied.join(', ') || 'nothing'}]`
      + `${r.rejected.length ? ` REJECTED ${JSON.stringify(r.rejected.map((x: any) => x.reason))}` : ''}`)
  }

  // 1. CatalyseHer — open, closing 7 September, and behind a different domain.
  const cat = await byTitle('Visa CatalyseHer Programme')
  if (cat) {
    await write('CatalyseHer', cat.id, {
      apply_url: 'https://catalyseher-uk.inco-group.co/',
      deadline: '2026-09-07',
      is_rolling: false,
      amount_max: 5000,
    }, 'user_verified:verdicts-2026-08-28', {
      apply_url: { snippet: 'Applications are now open for Cohort 4, starting in September 2026. The inco.co.uk path is the bot wall, not the fund.', confidence: 'high' },
      deadline:  { snippet: 'Applications close 7 September 2026, programme starts 23 September.', confidence: 'high' },
      amount_max:{ snippet: 'Microgrants up to £5,000, with $300k USD available in direct cash grants across the programme.', confidence: 'high' },
    })
  } else console.log('CatalyseHer: NOT FOUND')

  // 2. Grocers' — the old path redirects, the scheme name is invented, and the
  //    round is shut until March.
  const gro = await byTitle("Grocers' Charity Memorial Grant")
  if (gro) {
    await write("Grocers' Charity", gro.id, {
      title: "The Grocers' Charity — Open Grants",
      apply_url: 'https://grocershall.co.uk/the-charity/apply-for-a-grant',
      amount_max: 5000,
      is_active: false,
      pipeline_state: 'between_rounds_scheduled',
      next_open_date: '31 March 2027',
    }, 'user_verified:verdicts-2026-08-28', {
      title:      { snippet: 'Nine categories and no memorial scheme: hardship, children and young people, elderly, disability and inclusion, health, military, arts, heritage, environment.', confidence: 'high' },
      apply_url:  { snippet: 'The old path redirects to /the-charity/apply-for-a-grant, which is the real route.', confidence: 'high' },
      amount_max: { snippet: 'one-off grants of up to £5,000, UK-registered charities only, turnover under £500,000.', confidence: 'high' },
      next_open_date: { snippet: 'The deadline was 17 July 2026 at noon and applications reopen 31 March 2027.', confidence: 'high' },
    })
  } else console.log("Grocers': NOT FOUND")

  // 3. Severn Trent — the label is invented, the fund is open, and its panel
  //    deadline is in three days.
  const sev = await byTitle("Severn Trent Community Fund — Children's Football Clubs")
  if (sev) {
    await write('Severn Trent', sev.id, {
      title: 'Severn Trent Community Fund — New Project Funding',
      apply_url: 'https://www.stwater.co.uk/about-us/severn-trent-community-fund/new-project-funding/',
      amount_min: 2000,
      amount_max: 50000,
      deadline: '2026-08-31',
      is_rolling: false,
    }, 'user_verified:verdicts-2026-08-28', {
      title:      { snippet: 'There is no football or children\'s sport stream anywhere on the fund\'s pages. The funder runs two named streams: New Project Funding and Core Funding.', confidence: 'high' },
      amount_max: { snippet: 'New Project Funding: £2,000 to £20,000 and £20,000 to £50,000.', confidence: 'high' },
      deadline:   { snippet: '"Our Community Fund is always open for applications", with panel deadlines. The next is 31 August 2026.', confidence: 'high' },
    })
  } else console.log('Severn Trent: NOT FOUND')

  // 4. Bernard Sunley — keep, but point at the door rather than the hallway.
  const bs = await byTitle('Bernard Sunley Foundation — Capital Grants')
  if (bs) {
    await write('Bernard Sunley', bs.id, {
      apply_url: 'https://www.bernardsunley.org/how-to-apply/',
    }, 'user_verified:verdicts-2026-08-28', {
      apply_url: { snippet: '"we award around £5 million to capital projects throughout England and Wales", and the site carries How To Apply, an Eligibility Check and a Grant Application Form.', confidence: 'high' },
    })
  } else console.log('Bernard Sunley: NOT FOUND')

  // 5. Renew — withdrawn, and my repoint reversed.
  const renew = await byTitle('Renew Community Fund')
  if (renew) {
    const reason = formatRejectReason('non_funder',
      'The linked page is GMET\'s list of about thirty other people\'s funds, which is signposting rather than a fund. '
      + 'The proposed replacement page does not exist: gmet.org.uk rewrites any unknown path to a site search and answers 200, '
      + 'so it looked alive to a status-code check and is not. GMET\'s own fund is the Green Spaces Fund, closed for 2026 with the next round trailed for early 2027.')
    await write('Renew Community Fund', renew.id,
      { is_active: false, pipeline_state: 'rejected', rejection_reason: reason },
      'system:verdicts-2026-08-28')
  } else console.log('Renew: NOT FOUND')

  // 6. Lloyds — the Specialist Programme is not a thing they run.
  const lloyds = await byTitle('Lloyds Bank Foundation — Specialist Programme')
  if (lloyds) {
    const reason = formatRejectReason('non_funder',
      'The funding page names exactly one open programme, Good Place to Live: New Beginnings Fund, and nothing called a Specialist Programme. '
      + 'The Racial Equity and Deaf and Disabled People\'s Organisation programmes are described as coming to an end. '
      + 'New Beginnings is staged separately rather than this row being renamed into it.')
    await write('Lloyds Specialist', lloyds.id,
      { is_active: false, pipeline_state: 'rejected', rejection_reason: reason },
      'system:verdicts-2026-08-28')
  } else console.log('Lloyds: NOT FOUND')

  // 7. The six clean withdrawals.
  for (const w of WITHDRAW) {
    const row = await byTitle(w.title)
    if (!row) { console.log(`${w.title}: NOT FOUND`); continue }
    if (!row.is_active) { console.log(`${w.title}: already out of view`); continue }
    await write(`withdraw ${w.title.slice(0, 34)}`, row.id, {
      is_active: false, pipeline_state: 'rejected', rejection_reason: formatRejectReason(w.code, w.why),
    }, 'system:verdicts-2026-08-28')
  }

  // 8. Lloyds New Beginnings, staged. Inactive and awaiting review, per the
  //    catalogue rule that every addition is Paul's to activate.
  if (APPLY) {
    const { data: exists } = await db.from('scraped_grants').select('id')
      .ilike('title', '%New Beginnings%').limit(1)
    if ((exists as any[])?.length) {
      console.log('New Beginnings: a row already exists, not staging a second')
    } else {
      const row = stampNewGrant({
        title: 'Lloyds Bank Foundation — Good Place to Live: New Beginnings Fund',
        funder: 'Lloyds Bank Foundation for England and Wales',
        apply_url: 'https://www.lloydsbankfoundation.org.uk/funding/good-place-to-live-new-beginnings/',
        funding_type: 'grant',
        funder_type: 'trust_foundation',
        location_tag: 'England & Wales',
        is_local: false,
        amount_max: 200000,
        deadline: '2026-09-09',
        is_rolling: false,
        eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares'],
        impact_sectors: ['housing', 'community'],
        is_active: false,
        source: 'admin:verdicts-2026-08-28',
      }, 'user_verified:verdicts-2026-08-28')
      const { error } = await db.from('scraped_grants').insert(row)
      console.log(error ? `New Beginnings: INSERT FAILED ${error.message}`
                        : `New Beginnings: staged as ${row.pipeline_state}, inactive, awaiting review`)
    }
  } else {
    console.log('[dry] stage Lloyds New Beginnings, inactive, awaiting review')
  }
}

main().catch(e => { console.error(e); process.exit(1) })
