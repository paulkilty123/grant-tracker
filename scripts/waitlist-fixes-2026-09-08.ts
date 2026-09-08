// The six live-and-wrong rows, the Men's Health Community Fund un-reject, and
// the Hull merge. Approved by Paul on 8 September, which is the explicit go the
// launch freeze requires for live rows.
//
// Every fact written below comes from a page fetched in this session, read
// whole rather than truncated. Field writes go in at user_verified (trust 70)
// because they are read off the funder's own page today; state changes are set
// directly, as the review queue does.
//
// TWO THINGS THE SNAPSHOT CHANGED, both of which would have been wrong:
//
//   BGV's eligible_structures is already PINNED to ltd_shares and cooperative,
//   which is the correct answer to the equity question an admin has evidently
//   already made. It is not touched. The row's actual faults are its homepage
//   apply_url, a missing amount and a deadline the page does not support.
//
//   Of the two Hull Community Fund rows, 49d410cd carries admin pins on
//   deadline, is_rolling, location_tag and eligible_structures, and b06af7a3
//   carries none. So the curated row is 49d410cd and that is the keeper. The
//   unpinned duplicate goes.
//
//   npx tsx --env-file=.env.local scripts/waitlist-fixes-2026-09-08.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { formatRejectReason } from '../src/lib/admin/reject-reasons'

const APPLY = process.argv.includes('--apply')
const SRC = 'user_verified:waitlist-fixes-2026-09-08'

type Cit = Record<string, { snippet: string; confidence: 'high' | 'med' | 'low'; source_url?: string }>

// ── Rows to reject, with the sentence that decides each ──────────────────────
const REJECTS: { id: string; re: RegExp; code: string; note: string }[] = [
  {
    id: '1e994bdb-bb99-4c97-b02c-ee23c1874e18', re: /Firstport Start It/,
    code: 'out_of_scope',
    note: 'Individuals only, on its own page: "Who\'s it for? Individuals with a business idea that addresses a social, environmental and/or community issue", and the eligibility tests are a person\'s: "You are aged 18 or over. You are a permanent resident of Scotland." The row also held £5,000 to £25,000 where the page says "Up to £5,000" and £25,000 appears nowhere on it. Firstport\'s four organisation-facing funds are staged separately for review.',
  },
  {
    id: '57c4802f-2d34-4d89-969e-a21f9ef397db', re: /SSE.*All Programmes/,
    code: 'duplicate',
    note: 'A front-door index row with no deadline and no amount, standing in front of the eight programmes SSE\'s own index lists ("Programmes (8)"). We already carry the real ones separately, including two live and correct: Social Investment Gateway (deadline 6 November 2026) and DPS Social Commitment: Activate (16 November 2026). The index row adds nothing a fundraiser can apply to.',
  },
  {
    id: 'd33aa458-0eb8-473a-8b28-547cd8557a71', re: /Fredericks Foundation.*Community Business Loans/,
    code: 'duplicate',
    note: 'Duplicate of the live row 011655cc, Revenue Share for Social Enterprises. Fredericks describes ONE funding product on its own pages: "We offer funding between £20,000 – £50,000 through a flexible revenue share model". This row carries the identical £20,000 to £50,000 under a "loans" name and points at the homepage. The only loan on the site is Fredericks acting as delivery partner for the Community Builders Fund, which is Social Investment Business\'s fund and is held live separately as 0adbc570.',
  },
  {
    id: '18627ca4-7544-4719-93d8-1d7c80a10489', re: /Community Enterprise Fund/,
    code: 'closed_for_good',
    note: 'Listed by Social Investment Business under its own "Previous funds" page: "Community Enterprise Fund Type: Grant, Loan View fund". Not among the three funds SIB currently runs (Community Builders Fund, Energy Resilience Fund, Reach Fund), all three of which we hold live. This row was also pointing at a third-party directory (fundingforall.org.uk) rather than SIB\'s own site.',
  },
  {
    id: 'b06af7a3-a1be-4572-a259-70260f20d8b6', re: /Hull Community Fund/,
    code: 'duplicate',
    note: 'Duplicate of 49d410cd, same funder, same URL, same £10,000 cap and same 7 September 2026 deadline. 49d410cd is the keeper because it carries admin pins on deadline, is_rolling, location_tag and eligible_structures, and this row carries none. Merged so that Two Ridings\' most locally relevant fund for Hull does not reappear twice when it next opens.',
  },
]

// ── Rows to correct and enrich in place ──────────────────────────────────────
const KF = 'https://thekeyfund.co.uk/funding/flexible-finance/'
const BGV_APPLY = 'https://www.bethnalgreenventures.com/apply'
const BGV_OFFER = 'https://www.bethnalgreenventures.com/our-offer'
const PHT_MEN = 'https://www.peopleshealthtrust.org.uk/partner-with-us/business-partners/mens-health'
const PHT_NEWS = 'https://www.peopleshealthtrust.org.uk/news/stories/trust-partners-with-government-and-movember-on-major-new-mens-health-fund'

type Fix = {
  id: string; re: RegExp; label: string
  fields: Record<string, unknown>
  cits: Cit
  brief: Record<string, string>
  briefCits: Cit
  url: string
  /** Set only where a state change was approved. */
  state?: { is_active?: boolean; pipeline_state?: string; rejection_reason?: string | null }
}

const FIXES: Fix[] = [
  {
    id: 'b818a116-3579-4eb3-8808-b40abc38e393', re: /Key Fund Flexible Finance/, label: 'Key Fund Flexible Finance',
    url: KF,
    // amount_min left as it stands: the fund's own page states no floor, and
    // nulling a plausible one would lose information rather than correct it.
    // amount_max was £300,000, which is Key Fund's overall ceiling and not this
    // fund's; its own page caps it at £150,000.
    fields: { apply_url: KF, amount_max: 150000 },
    cits: {
      apply_url: { snippet: 'The Flexible Finance Fund is for established community and social enterprises, to complement our existing blended funds.', confidence: 'high', source_url: KF },
      amount_max: { snippet: 'This is a revolving facility, available up to £150,000 that can be drawn and repaid flexibly as needed, for an initial period of up to 2 years.', confidence: 'high', source_url: KF },
    },
    brief: {
      who_can_apply: 'Incorporated businesses with clear social aims that are not for private profit, asset locked, or have clear restrictions around profit distribution such as a BenCom. You must be an SME with fewer than 250 employees, turnover under €50m and net worth under €43m, have been substantially trading for over three years, and be based in or operating substantially within Key Fund\'s area, the North of England and the Midlands.',
      what_they_fund: 'A revolving facility to keep cash flow smooth, covering cashflow gaps and giving flexibility to take opportunities. Drawn and repaid flexibly for up to two years, after which any balance converts to a standard loan repayable over five years.',
      how_to_apply: 'Apply through the link on the fund page, or call Key Fund on 0330 202 0559 to talk it through first.',
      exclusions: 'Not for unincorporated groups, for organisations distributing profit privately, or for those trading less than three years. Outside the North of England and the Midlands is out of area.',
      typical_award: 'Up to £150,000. Arrangement fee of 2% on acceptance, interest at 4% a year payable monthly on the amount drawn, and a standby fee of 2% a year on the undrawn balance charged six monthly in arrears.',
      decision_timeline: 'The page states no decision timeline. Key Fund\'s investment team works with applicants through the application and afterwards.',
      open_status: 'open',
    },
    briefCits: {
      who_can_apply: { snippet: 'Eligibility: Must be an incorporated business. Must have clear social aims and objectives, and fit one of the following descriptions: Not for private profit Asset locked Have clear policies or restrictions around profit distribution (e.g. BenCom)', confidence: 'high', source_url: KF },
      what_they_fund: { snippet: 'It is intended to help you keep your cash flow smooth by covering cashflow gaps and provide flexibility to maximise opportunities.', confidence: 'high', source_url: KF },
      how_to_apply: { snippet: 'Tel: 0330 202 0559', confidence: 'med', source_url: KF },
      exclusions: { snippet: 'Must be an SME – less than 250 employees, t/o less than E50m, net worth less than E43m. Must have been substantially trading for over 3 years (over 50%).', confidence: 'high', source_url: KF },
      typical_award: { snippet: 'Fund Offer: Investments up to £150k ... Arrangement fee of 2% payable on acceptance of offer Interest rate payable monthly, based on amount drawn, at 4% per annum', confidence: 'high', source_url: KF },
      decision_timeline: { snippet: 'Our experienced investment team will work with you to identify the right type of funding for your needs, support you through the application process and provide dedicated aftercare', confidence: 'med', source_url: 'https://www.thekeyfund.co.uk/funding/' },
      open_status: { snippet: 'The Flexible Finance Fund is for established community and social enterprises', confidence: 'med', source_url: KF },
    },
  },
  {
    id: '0ce8470d-9557-40a3-a8d2-ef01daba3f09', re: /Tech for Good Programme/, label: 'Bethnal Green Ventures',
    url: BGV_APPLY,
    // eligible_structures is PINNED to ltd_shares + cooperative and is NOT
    // touched: that pin is the correct answer to the equity question.
    // The stored deadline of 2027-05-01 appears on neither page; the pages say
    // the Autumn 2026 round is closed and the next opens in November.
    fields: {
      apply_url: BGV_APPLY,
      amount_min: 60000, amount_max: 60000,
      deadline: null, is_rolling: false,
      next_open_date: 'Applications for Autumn 2026 are closed; the next programme opens for applications in November',
    },
    cits: {
      apply_url: { snippet: 'Twice a year we select 10-15 companies investing £60,000 upfront and take them through our six-week programme.', confidence: 'high', source_url: BGV_APPLY },
      amount_max: { snippet: 'The journey of every portfolio company we work with starts on our Tech For Good Programme and our initial investment of £60,000 for 7% equity.', confidence: 'high', source_url: BGV_OFFER },
      amount_min: { snippet: 'We offer £60,000 investment and six weeks of intensive learning for prototype stage ventures.', confidence: 'high', source_url: BGV_APPLY },
      deadline: { snippet: 'Applications for our Autumn 2026 are now closed. Sign up to get notified for when we open applications for our next programme in November.', confidence: 'high', source_url: BGV_APPLY },
      next_open_date: { snippet: 'Applications for our Autumn 2026 are now closed. Sign up to get notified for when we open applications for our next programme in November.', confidence: 'high', source_url: BGV_APPLY },
    },
    brief: {
      who_can_apply: 'Early-stage tech for good ventures at prototype stage. BGV is a venture capital investor and takes 7% equity for its £60,000, so the applicant has to be able to issue shares: a registered charity, a CIO or a company limited by guarantee cannot take this investment. Ten to fifteen companies are selected twice a year.',
      what_they_fund: 'Technology tackling social and environmental problems. The award is £60,000 of investment for 7% equity, plus six weeks of intensive learning followed by six weeks of coaching, and continued support afterwards, with further investment into the most promising portfolio companies.',
      how_to_apply: 'Apply through the programme page when applications are open. If unsure, BGV offers a conversation with its team first to check fit.',
      exclusions: 'Not open to organisations that cannot issue equity, which rules out charities, CIOs and companies limited by guarantee. Applications for the Autumn 2026 cohort are closed.',
      typical_award: '£60,000 for 7% equity, plus six weeks of intensive learning and six weeks of coaching.',
      decision_timeline: 'Two cohorts a year. The Autumn 2026 round is closed and the next opens for applications in November.',
      open_status: 'between_rounds',
    },
    briefCits: {
      who_can_apply: { snippet: 'The journey of every portfolio company we work with starts on our Tech For Good Programme and our initial investment of £60,000 for 7% equity.', confidence: 'high', source_url: BGV_OFFER },
      what_they_fund: { snippet: 'Helps you launch your early-stage venture with £60,000 of investment (for 7% equity) plus 6 weeks of intensive learning followed by 6 weeks of coaching tailored to your needs.', confidence: 'high', source_url: BGV_OFFER },
      how_to_apply: { snippet: 'If you\'re unsure about applying, request to talk to our team to see if it\'s a fit with BGV and a fit for you.', confidence: 'high', source_url: BGV_APPLY },
      exclusions: { snippet: 'our initial investment of £60,000 for 7% equity', confidence: 'high', source_url: BGV_OFFER },
      typical_award: { snippet: 'Twice a year we select 10-15 companies investing £60,000 upfront and take them through our six-week programme.', confidence: 'high', source_url: BGV_APPLY },
      decision_timeline: { snippet: 'Applications for our Autumn 2026 are now closed. Sign up to get notified for when we open applications for our next programme in November.', confidence: 'high', source_url: BGV_APPLY },
      open_status: { snippet: 'Applications for our Autumn 2026 are now closed.', confidence: 'high', source_url: BGV_APPLY },
    },
  },
  {
    id: '9605bf45-9c22-467f-92fc-a3a5ba04b6fe', re: /Men.s Health Community Fund/, label: "Men's Health Community Fund (un-reject)",
    url: PHT_MEN,
    // Pinned on this row and NOT touched: deadline, amount_min, amount_max,
    // is_rolling, location_tag, eligible_structures.
    fields: { apply_url: PHT_MEN },
    cits: {
      apply_url: { snippet: 'The Men\'s Health Community Fund will invest at least £6.3 million in community and grassroots organisations that work in the country\'s most deprived areas where men face the worst health outcomes.', confidence: 'high', source_url: PHT_MEN },
    },
    brief: {
      who_can_apply: 'Community and grassroots organisations in England working in the most deprived areas, where men face the worst health outcomes. The fund is a partnership between the Department of Health and Social Care, Movember and People\'s Health Trust, and it invests in community-led approaches to men\'s health rather than in research.',
      what_they_fund: 'Projects addressing the social and economic pressures behind poor health for men and older boys, at key moments such as the transition to fatherhood, job loss or retirement, including mental health, debt, housing, family relationships and income. At least £6.3 million in total.',
      how_to_apply: 'Through People\'s Health Trust. The previous route via the Find a Grant government listing has been withdrawn and that page now returns 404, which is why this row was wrongly rejected as a dead link on 7 September.',
      exclusions: 'England only. The fund is aimed at community and grassroots organisations in the most deprived areas, so it is not a general men\'s health fund and not a research fund.',
      typical_award: 'The page states no per-applicant figure. £6.3 million is the total the fund will invest across all grantees, not an award.',
      decision_timeline: 'The fund opened for applications in summer 2026 with grants to be awarded later in the year. The round recorded on this row closed on 15 July 2026. No date is given for a further round.',
      open_status: 'between_rounds',
    },
    briefCits: {
      who_can_apply: { snippet: 'The Men\'s Health Community Fund will invest at least £6.3 million in community and grassroots organisations that work in the country\'s most deprived areas where men face the worst health outcomes.', confidence: 'high', source_url: PHT_MEN },
      what_they_fund: { snippet: 'The Men\'s Health Community Fund will support projects that help address the social and economic pressures driving poor health for men and older boys, during key moments of their lives such as the transition to fatherhood, job loss, or retirement, including challenges related to mental health, debt, housing, family relationships and income.', confidence: 'high', source_url: PHT_NEWS },
      how_to_apply: { snippet: 'We have partnered with the UK Government and leading men\'s charity Movember on a major new collaboration aiming to improve the health of underserved men and older boys in England.', confidence: 'high', source_url: PHT_MEN },
      exclusions: { snippet: 'aiming to improve the health of underserved men and older boys in England', confidence: 'high', source_url: PHT_NEWS },
      typical_award: { snippet: 'will invest at least £6.3 million in community and grassroots organisations', confidence: 'high', source_url: PHT_NEWS },
      decision_timeline: { snippet: 'The Fund will open for applications in summer 2026 with grants to be awarded later in the year.', confidence: 'high', source_url: PHT_NEWS },
      open_status: { snippet: 'The Fund will open for applications in summer 2026 with grants to be awarded later in the year.', confidence: 'high', source_url: PHT_NEWS },
    },
    state: { is_active: false, pipeline_state: 'between_rounds_scheduled', rejection_reason: null },
  },
]

const STATE_COLS = 'id, title, is_active, pipeline_state, rejection_reason'

async function main() {
  const db = getAdminDb()
  console.log(`waitlist fixes — ${APPLY ? 'APPLY' : 'DRY RUN'}\n`)

  console.log('── rejects ──────────────────────────────────────────────')
  for (const r of REJECTS) {
    const { data } = await db.from('scraped_grants').select(`${STATE_COLS}, apply_url`).eq('id', r.id).single()
    if (!data) throw new Error(`${r.id}: no row`)
    if (!r.re.test(String(data.title))) throw new Error(`${r.id}: title "${data.title}" does not match ${r.re}`)
    console.log(`  ${data.is_active ? 'LIVE  ' : 'hidden'} ${String(data.title).slice(0, 46).padEnd(46)} -> reject (${r.code})`)
    if (!APPLY) continue
    const { error } = await db.from('scraped_grants').update({
      is_active: false,
      pipeline_state: 'rejected',
      rejection_reason: formatRejectReason(r.code, r.note),
    }).eq('id', r.id)
    if (error) throw new Error(`${data.title}: ${error.message}`)
    console.log(`         rejected`)
  }

  console.log('\n── corrections and enrichment ───────────────────────────')
  for (const f of FIXES) {
    const before = await db.from('scraped_grants')
      .select(`${STATE_COLS}, apply_url, amount_min, amount_max, deadline, funder_brief, field_provenance`).eq('id', f.id).single()
    if (before.error || !before.data) throw new Error(`${f.id}: ${before.error?.message ?? 'no row'}`)
    const d = before.data as unknown as Record<string, unknown>
    if (!f.re.test(String(d.title))) throw new Error(`${f.id}: title "${d.title}" does not match ${f.re}`)

    const fp = (d.field_provenance ?? {}) as Record<string, { pinned?: boolean }>
    const pinnedTargets = Object.keys(f.fields).filter(k => fp[k]?.pinned)
    console.log(`  ${f.label}`)
    console.log(`      ${d.apply_url}`)
    console.log(`   -> ${f.fields.apply_url ?? '(url unchanged)'}   fields: ${Object.keys(f.fields).join(', ')}`)
    if (pinnedTargets.length) {
      // Rule 6: an admin-held field is reported, never overwritten.
      throw new Error(`${f.label}: would write PINNED field(s) ${pinnedTargets.join(', ')}. Stop and report instead.`)
    }
    if (f.state) console.log(`      state -> is_active=${f.state.is_active} pipeline_state=${f.state.pipeline_state} rejection_reason=${f.state.rejection_reason}`)
    if (!APPLY) continue

    const res = await mergeGrantUpdate({ id: f.id, fields: f.fields, source: SRC, db, citations: f.cits })
    const refused = res.rejected.filter(x => x.reason !== 'idempotent')
    console.log(`      applied [${res.applied.join(', ') || 'nothing'}]${refused.length ? `  REFUSED ${JSON.stringify(refused)}` : ''}`)
    if (refused.length) throw new Error(`${f.label}: refused — ${JSON.stringify(refused)}`)

    const existing = (d.funder_brief as Record<string, unknown> | null) ?? {}
    const priorCits = (existing._citations ?? {}) as Record<string, unknown>
    const fresh = {
      ...existing, ...f.brief,
      source: 'live_fetch', last_enriched: '2026-09-08',
      _citations: { ...priorCits, ...Object.fromEntries(Object.entries(f.briefCits).map(([k, v]) => [k, { ...v, source_url: v.source_url ?? f.url }])) },
    }
    const first = Object.values(f.briefCits)[0]
    const res2 = await mergeGrantUpdate({ id: f.id, fields: { funder_brief: fresh }, source: SRC, db, citations: first ? { funder_brief: first } : undefined })
    const refused2 = res2.rejected.filter(x => x.reason !== 'idempotent')
    console.log(`      brief [${res2.applied.join(', ') || 'nothing'}]${refused2.length ? `  REFUSED ${JSON.stringify(refused2)}` : ''}`)

    if (f.state) {
      const { error } = await db.from('scraped_grants').update(f.state).eq('id', f.id)
      if (error) throw new Error(`${f.label}: state update failed — ${error.message}`)
      console.log(`      state set`)
    }
  }

  console.log('\n── after ────────────────────────────────────────────────')
  const ids = [...REJECTS.map(r => r.id), ...FIXES.map(f => f.id), '49d410cd-2107-421e-b35b-158793a21c0e', '011655cc-3391-43d4-8fdb-bbdfda4479ab']
  const { data: after } = await db.from('scraped_grants')
    .select('id,title,is_active,pipeline_state,apply_url,amount_min,amount_max').in('id', ids)
  for (const r of (after ?? []) as Record<string, unknown>[]) {
    console.log(`  ${r.is_active ? 'LIVE  ' : 'hidden'} ${String(r.pipeline_state).padEnd(24)} ${String(r.title).slice(0, 44).padEnd(44)} ${r.amount_min}-${r.amount_max}`)
  }
}
main().catch(e => { console.error('\nFAILED:', e.message); process.exit(1) })
