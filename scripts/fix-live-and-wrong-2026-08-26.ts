// Live and wrong, worked 2026-08-26.
//
// Twelve rows a user could already see, each with a blocking reason. Every
// change below rests on a sentence read off the funder's own page today; where
// no sentence could be found, the value is cleared rather than kept or guessed.
//
// The three that would have been wrong to guess:
//
//   Postcode Local Trust and Postcode Society Trust read as "between rounds" and
//   are not. Round 3 opened at 9am on 25 August and closes at noon on
//   1 September. Marking them closed would have hidden two open funds with six
//   days left, which is the opposite of the defect the queue flagged.
//
//   Clothworkers' £125,000 "per-applicant figure derived from the text" is an
//   image caption naming one grant HAPANI received. The page states a floor
//   (over £15,000) and no ceiling at all, so the honest ceiling is none.
//
//   Postcode Society Trust's £20,000 came from a duplicate row's funding guide
//   and is simply out of date: the trust's own FAQ says up to £50,000 over three
//   years with a £1,000 minimum payment.
//
// Sources are chosen to leave every value improvable. `user_verified` (70) beats
// ai_enrich without pinning; `admin:` would pin at 100 and freeze the field for
// good, which is wrong for a figure a funder can change. See the trust ladder in
// grant-merge.ts and CLAUDE.md's provenance gotcha.
//
//   npx tsx --env-file=.env.local scripts/fix-live-and-wrong-2026-08-26.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { recordFieldEvidence } from '../src/lib/field-evidence'
import { recordGrantFlags } from '../src/lib/grant-flags'

const APPLY = process.argv.includes('--apply')
const NOW   = '2026-08-26T00:00:00.000Z'

const PLT       = '5c4dccbf-0fe9-4587-a49d-530053bc45fc'
const PST       = 'ec676c7f-93b3-404c-aaf9-7bb1ec71b83b'
const BRIGHTON  = '6c379e4b-482c-4548-9b77-bfb74dc314f8'
const SURREY    = 'a6d972cc-5260-4479-ae49-3656264d0ce8'
const SFCT      = '50a75c68-f590-42ce-96b3-bc71f63faff5'
const SCREEN    = '49dba18b-28ee-47b6-98b8-b90104057183'
const CLOTH     = 'd679e8d8-0c17-4c9f-aec9-2464bbb2ec9d'
const ALLENLANE = 'da45f5fc-31ff-4a5d-9fd9-9821c65b46d7'
const ELLERMAN  = '328baf9b-67e8-4241-a641-d01263a582ad'
const TESCO     = '212840c1-4aee-4dd5-8608-467ecbae35ef'
const CITA      = '75990799-a1a4-490e-a651-90f3147ec669'
const AOS       = 'bd72165c-9f44-4935-9b50-d6bed81def8e'

/** What each page said today, quoted. Every write below cites one of these. */
const QUOTE = {
  postcodeRound3: 'Round 3: 9am 25th August - 12 noon 1st September',
  pstAmount:      'Organisations can apply for up to £50,000 in total for across a 3-year period, dependent on your organisation size.',
  pstMinimum:     'the minimum payment receivable is £1,000',
  clothworkers:   'Eligible organisations are invited to submit applications for a Small Grant (up to £15,000) with a one-stage application process, or a Large Grant (more than £15,000), which has a two-stage application process.',
  ellerman:       'We provide funding of up to a maximum of £60k per year (e.g. an organisation applying for £180k would need to request this funding over three years).',
  tesco:          'registered charities and not-for-profit organisations supporting children and young people to apply for up to £1,500 for causes that improve access to healthy, nutritious food',
  aoShearman:     'Organizations can apply for a one-year grant of up to GBP50,000, a two-year grant of up to GBP100,000 or a three-year grant of up to GBP150,000.',
  cita:           'In excess of 2,500 days IT consultancies provided saving charities thousands in costs',
} as const

const URL = {
  plt:        'https://www.postcodelocaltrust.org.uk/apply-for-a-grant',
  pst:        'https://www.postcodesocietytrust.org.uk/apply-for-a-grant',
  pstFaq:     'https://www.postcodesocietytrust.org.uk/funding-guide/faqs',
  cloth:      'https://www.clothworkersfoundation.org.uk/apply-for-a-grant',
  ellermanDoor: 'https://ellerman.org.uk/apply-for-funding',
  ellermanFund: 'https://ellerman.org.uk/apply-for-funding/what-we-are-looking-to-fund',
  tesco:      'https://tescostrongerstarts.org.uk/apply-for-a-grant/',
  aos:        'https://www.aoshearman.com/en/about-us/social-impact/charity-support',
  cita:       'https://www.cita.org.uk/',
  sfct:       'https://www.sfct.org.uk/the-trusts/',
  screen:     'https://www.screen.scot/funding-and-support/',
} as const

const log: string[] = []
const note = (s: string) => { log.push(s); console.log(s) }

async function main() {
  const db = getAdminDb()
  if (!APPLY) { console.log('DRY RUN — nothing will be written. Pass --apply.\n') }

  const merge = async (id: string, what: string, fields: Record<string, unknown>,
                       source: string, citations?: Record<string, { snippet: string; confidence: 'high' | 'med' | 'low' }>) => {
    if (!APPLY) { note(`[dry] ${what}: ${Object.keys(fields).join(', ')} <- ${source}`); return }
    const r = await mergeGrantUpdate({ id, fields, source, db, citations })
    note(`${what}: applied [${r.applied.join(', ') || 'nothing'}]${r.rejected.length ? ` REJECTED ${JSON.stringify(r.rejected)}` : ''}`)
  }

  const stamp = async (id: string, what: string, patch: Record<string, unknown>) => {
    if (!APPLY) { note(`[dry] ${what}: evidence ${Object.keys(patch).join(', ')}`); return }
    const r = await recordFieldEvidence({ id, patch: patch as never, db })
    note(`${what}: stamped [${r.stamped.join(', ')}]`)
  }

  const clearFlags = async (id: string, what: string, source: string) => {
    const { data } = await db.from('scraped_grants').select('raw_data').eq('id', id).single()
    if (!APPLY) { note(`[dry] ${what}: clear flags from ${source}`); return }
    await recordGrantFlags({ db, grantId: id, existingRawData: (data as { raw_data: unknown } | null)?.raw_data, source, flags: [] })
    note(`${what}: flags from ${source} cleared`)
  }

  const evid = (quote: string, url: string, agrees: boolean | null = true) =>
    ({ quote, source_url: url, checked_at: NOW, by: 'admin:live-and-wrong-2026-08-26', agrees })

  // ── 1. Timing ────────────────────────────────────────────────────────────
  // Both postcode trusts run the same three rounds a year and Round 3 is OPEN,
  // closing at noon on 1 September. The card held no date at all, so the fund
  // read as neither open nor shut.
  for (const [id, name, url] of [[PLT, 'Postcode Local Trust', URL.plt], [PST, 'Postcode Society Trust', URL.pst]] as const) {
    await merge(id, `${name} deadline`, { deadline: '2026-09-01' },
                'user_verified:round3-open-2026-08-26',
                { deadline: { snippet: QUOTE.postcodeRound3, confidence: 'high' } })
    await stamp(id, `${name} deadline`, { deadline: evid(QUOTE.postcodeRound3, url) })
  }

  // Postcode Society Trust's £20,000 came from a duplicate row's funding guide
  // in August and the trust's own FAQ now says otherwise. amount_min is left
  // null on purpose: "the minimum payment receivable is £1,000" is a payment
  // schedule rule, not a floor on what you may ask for.
  await merge(PST, 'Postcode Society Trust ceiling', { amount_max: 50000 },
              'user_verified:funder-faq-2026-08-26',
              { amount_max: { snippet: QUOTE.pstAmount, confidence: 'high' } })
  await stamp(PST, 'Postcode Society Trust ceiling', { amount_max: evid(QUOTE.pstAmount, URL.pstFaq) })

  // Brighton's ward pots: the page is a JavaScript shell the engine cannot read,
  // the brief was written from memory, and the £22,000 in it is a WARD's pot
  // rather than anything one applicant can ask for. Out of view, funder watched.
  // pipeline_state passed explicitly so transitionPipelineState is skipped.
  await merge(BRIGHTON, 'Better Brighton & Hove ward pots',
              { is_active: false, pipeline_state: 'between_rounds_scheduled' },
              'system:live-and-wrong-2026-08-26')

  // Surrey: the card says rolling and is right — crisis funding and grants for
  // individuals have no deadline — but the write-up described the closed EOI
  // round as if it were the way in. Only the timing sentence changes.
  {
    const { data } = await db.from('scraped_grants').select('funder_brief').eq('id', SURREY).single()
    const brief = { ...((data as { funder_brief: Record<string, unknown> }).funder_brief) }
    delete brief._stale_dates
    brief.decision_timeline =
      'Main Grants Round 2 for 2026-27 is closed to new expressions of interest. EOIs closed on 2 July 2026, '
      + 'invited full applications close on 1 September 2026, and decisions follow in the week of 14 December 2026. '
      + 'Crisis Funding and Grants for Individuals are rolling with no deadline, and Area Fund enquiries are taken at any time.'
    await merge(SURREY, 'Community Foundation for Surrey timing', { funder_brief: brief },
                'user_verified:live-and-wrong-2026-08-26')
  }

  // ── 3. Front doors ───────────────────────────────────────────────────────
  // Neither row is broken. Both point at the funder's own index of funds, which
  // is what a funder-level row should do; recording the index is what tells
  // describesADiscreteFund() to stop asking which single fund the page is about.
  await merge(SFCT, 'Sainsbury Family Charitable Trusts index', { funding_index_url: URL.sfct }, 'system:live-and-wrong-2026-08-26')
  await merge(SCREEN, 'Screen Scotland index', { funding_index_url: URL.screen }, 'system:live-and-wrong-2026-08-26')

  // ── 5. Amounts ───────────────────────────────────────────────────────────
  // Clothworkers: the page sets a floor and no ceiling. £250,000 was the
  // scraper's and £125,000 is one named award in an image caption, so neither is
  // a cap. A blank maximum renders as absent; an invented one misleads.
  await merge(CLOTH, 'Clothworkers ceiling', { amount_max: null }, 'system:live-and-wrong-2026-08-26',
              { amount_max: { snippet: QUOTE.clothworkers, confidence: 'high' } })
  await stamp(CLOTH, 'Clothworkers ceiling', { amount_max: evid(QUOTE.clothworkers, URL.cloth, null) })
  await clearFlags(CLOTH, 'Clothworkers', 'system:enrich_checks:v1')

  // Allen Lane: the flag fired on 21 August and the verifier confirmed the
  // stored £15,000 against the funder's page on the 23rd. Nothing to correct;
  // the flag is simply older than the evidence.
  await clearFlags(ALLENLANE, 'Allen Lane', 'system:enrich_checks:v1')

  // Ellerman: the figure is published, one page in from the homepage we point
  // at, which is why the verifier read silence. Moving the link to the funding
  // front door puts the read where the facts are.
  await merge(ELLERMAN, 'John Ellerman link',
              { apply_url: URL.ellermanDoor, funding_index_url: URL.ellermanDoor },
              'user_verified:live-and-wrong-2026-08-26',
              { apply_url: { snippet: QUOTE.ellerman, confidence: 'high' } })
  await stamp(ELLERMAN, 'John Ellerman amount', {
    amount_max: evid(QUOTE.ellerman, URL.ellermanFund),
    amount_min: evid(QUOTE.ellerman, URL.ellermanFund, null),
  })
  await clearFlags(ELLERMAN, 'John Ellerman', 'system:enrich_checks:v1')

  // Tesco: the sentence is on the page the row already links to. The verifier
  // read it as silent, which is a miss rather than a defect in the row.
  await stamp(TESCO, 'Tesco Stronger Starts amount', { amount_max: evid(QUOTE.tesco, URL.tesco) })

  // A&O Shearman: all three figures are on the page, in the funder's own
  // sentence. The guard compares our write-up against the citation we hold, not
  // against the page, so it was arguing with a snippet rather than the funder.
  {
    const { data } = await db.from('scraped_grants').select('funder_brief').eq('id', AOS).single()
    const brief = { ...((data as { funder_brief: Record<string, unknown> }).funder_brief) }
    delete brief._ungrounded_amounts
    await merge(AOS, 'A&O Shearman amounts', { funder_brief: brief }, 'user_verified:live-and-wrong-2026-08-26',
                { funder_brief: { snippet: QUOTE.aoShearman, confidence: 'high' } })
    await stamp(AOS, 'A&O Shearman amounts', {
      amount_min: evid(QUOTE.aoShearman, URL.aos),
      amount_max: evid(QUOTE.aoShearman, URL.aos),
    })
  }

  // CITA: here the guard was right. The page says the consultancy saves
  // charities "thousands"; the £2.4 million was worked out rather than read.
  {
    const { data } = await db.from('scraped_grants').select('funder_brief').eq('id', CITA).single()
    const brief = { ...((data as { funder_brief: Record<string, unknown> }).funder_brief) }
    delete brief._ungrounded_amounts
    brief.typical_award =
      'This is not a grant scheme. It provides pro bono IT consulting. CITA has provided in excess of 2,500 days '
      + 'of IT consultancy to charities, saving them thousands in costs. There is no financial award.'
    await merge(CITA, 'CITA write-up', { funder_brief: brief }, 'user_verified:live-and-wrong-2026-08-26',
                { funder_brief: { snippet: QUOTE.cita, confidence: 'high' } })
  }

  console.log(`\n${APPLY ? 'APPLIED' : 'DRY RUN'} — ${log.length} steps`)
}

main().catch(e => { console.error(e); process.exit(1) })
