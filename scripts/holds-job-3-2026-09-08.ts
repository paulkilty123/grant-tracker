// Holds handoff (2026-09-08) — job 3: three live rows with no amount, one
// careful read each (apply page + a linked guidance page, per the brief).
// fetch direct only — no proxy, no browser needed; all three read cleanly.
//
// All three found a real per-applicant band, all three on a page ONE STEP
// PAST where an earlier session stopped. Gannochy's apply page states no
// figure for the main programme (true, and the reason a 2 Sept null-sweep
// cleared it) — but its linked Guidance Notes PDF has a "What level of
// funding are you requesting" section with three tiers, Small/Main/Major,
// Main and Major being Perth and Kinross only. Both Mercers rows' apply
// pages show only the programme's annual pool (£3.4m / £2.6m, correctly
// nulled by earlier sweeps on 30 Aug and 2 Sept) — but each programme has a
// SEPARATE "funding guidelines" page (a different URL from the apply page,
// linked as "further information on funding guidelines") that states a
// per-applicant award band under "Size and type of funding we support",
// distinguished from the pool by its own "no single year's grant over 50%
// of annual income" per-org sizing rule. Both rows' typical_award prose
// already carried this correct band — it was the amount_min/amount_max
// COLUMNS a prior null-sweep cleared, apparently without finding the
// guidelines page. All three writes are user_verified (trust 70), which
// equals and so can supersede the null-sweeps' own user_verified writes.
//
// Checked before writing anything: the Gannochy tier band belongs to THIS
// row (Perth & Kinross Grants, 85f9af1e) and not to the catalogue's other
// two Gannochy rows (Youth Panel Fund 7924983a, Scotland Youth Development
// 5cec571b, neither in this job) — Main and Major are stated
// "(Perth and Kinross only)" in the PDF, and the Small Grant floor the PDF
// gives for Rest of Scotland re-applicants (£1,000–£10,000) already matches
// what 5cec571b holds. No overlap.
//
//   npx tsx --env-file=.env.local scripts/holds-job-3-2026-09-08.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { SOURCE, appendJob3 } from './holds-lib-2026-09-08'

const APPLY = process.argv.includes('--apply')

const GANNOCHY_APPLY = 'https://www.gannochytrust.org.uk/our-grants/applying-for-grant-funding/'
const GANNOCHY_GUIDANCE = 'https://www.gannochytrust.org.uk/wp-content/uploads/2026/07/Guidance-Notes-for-Grant-Applicants-2025-v7.pdf'
const MERCERS_CC_GUIDE = 'https://www.mercers.co.uk/church_and_communities_funding_guidelines'
const MERCERS_OPH_GUIDE = 'https://www.mercers.co.uk/older_people_housing_funding_guidelines'

type Row = {
  id: string
  re: RegExp
  min?: number
  max?: number
  cits: Record<string, { snippet: string; confidence: 'high' | 'med' | 'low'; source_url: string }>
  sourceUrl: string
  sourceLabel: string
  typical_award: string
  typical_award_cit: { snippet: string; confidence: 'high' | 'med' | 'low'; source_url: string }
}

const ROWS: Row[] = [
  {
    id: '85f9af1e-b1cb-4796-8a7c-163aabec2037', re: /Gannochy Trust.*Perth & Kinross Grants/,
    min: 1000,
    cits: {
      amount_min: { snippet: 'Small Grant – £1,000 to £10,000 per annum for up to three years (Please note Rest of Scotland applicants may apply for up to £10,000 for one year only)', confidence: 'high', source_url: GANNOCHY_GUIDANCE },
    },
    sourceUrl: GANNOCHY_GUIDANCE,
    sourceLabel: 'Guidance Notes for Grant Applicants (grant levels), read 2026-09-08',
    typical_award: 'Three tiers for Perth and Kinross applicants: Small Grant £1,000 to £10,000 a year for up to three years, Main Grant £10,001 to £30,000 a year for up to three years, and Major Grant over £30,000 a year for up to three years (Main and Major are Perth and Kinross only; the Guidance Notes give no stated ceiling for Major grants). Separately, the Youth Panel Fund, a delegated sub-fund, provides grants of up to £10,000 for youth health, youth voice and mental wellbeing. The trust\'s total annual giving is around five million pounds.',
    typical_award_cit: { snippet: 'Small Grant – £1,000 to £10,000 per annum for up to three years... Main Grant (Perth and Kinross only) - £10,001 to £30,000 per annum for up to three years... Major Grant (Perth and Kinross only) – over £30,000 per annum for up to three years', confidence: 'high', source_url: GANNOCHY_GUIDANCE },
  },
  {
    id: '4db45a85-2ff4-4cac-bca6-51a44bd56fe1', re: /Church and Communities Programme/,
    min: 10000, max: 120000,
    cits: {
      amount_min: { snippet: 'Size and type of funding we support: Awards of between £10,000 to £120,000 in total. Funding is for a one, two or three year period.', confidence: 'high', source_url: MERCERS_CC_GUIDE },
      amount_max: { snippet: 'Size and type of funding we support: Awards of between £10,000 to £120,000 in total. Funding is for a one, two or three year period.', confidence: 'high', source_url: MERCERS_CC_GUIDE },
    },
    sourceUrl: MERCERS_CC_GUIDE,
    sourceLabel: 'Church & Communities Funding Guidelines (award size), read 2026-09-08',
    typical_award: 'Awards of £10,000 to £120,000 in total, over a one, two or three year period (multi-year funding offered). No single year\'s grant will generally exceed 50% of the organisation\'s annual income.',
    typical_award_cit: { snippet: 'Awards of between £10,000 to £120,000 in total... We will not generally award a grant that is over 50% of an organisation\'s annual income in any given year', confidence: 'high', source_url: MERCERS_CC_GUIDE },
  },
  {
    id: '57c520fd-c715-478b-8a6e-7c9907044d2a', re: /Older People and Housing Programme/,
    min: 50000, max: 120000,
    cits: {
      amount_min: { snippet: 'Size and type of funding we support: We make awards of between £50,000 to £120,000 in total. Awards can be up to three years.', confidence: 'high', source_url: MERCERS_OPH_GUIDE },
      amount_max: { snippet: 'Size and type of funding we support: We make awards of between £50,000 to £120,000 in total. Awards can be up to three years.', confidence: 'high', source_url: MERCERS_OPH_GUIDE },
    },
    sourceUrl: MERCERS_OPH_GUIDE,
    sourceLabel: 'Older People & Housing Funding Guidelines (award size), read 2026-09-08',
    typical_award: 'Awards of £50,000 to £120,000 in total, for up to three years (multi-year funding offered). No single year\'s grant will generally exceed 50% of the organisation\'s annual income.',
    typical_award_cit: { snippet: 'We make awards of between £50,000 to £120,000 in total... We will not generally award a grant that is over 50% of an organisation\'s annual income in any given year', confidence: 'high', source_url: MERCERS_OPH_GUIDE },
  },
]

const STATE_COLS = 'id, title, is_active, pipeline_state, rejection_reason'
const snap = (r: Record<string, unknown>) =>
  ({ is_active: r.is_active, pipeline_state: r.pipeline_state, rejection_reason: r.rejection_reason })

async function noAmountCount(db: ReturnType<typeof getAdminDb>) {
  const { count, error } = await db.from('scraped_grants')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true).eq('pipeline_state', 'published')
    .is('amount_min', null).is('amount_max', null)
  if (error) throw error
  return count ?? -1
}

async function main() {
  const db = getAdminDb()
  const before = await noAmountCount(db)
  console.log(`no-amount count before: ${before}`)

  const written: { id: string; min: number | null; max: number | null; prose_only: boolean; quote: string; url: string }[] = []

  for (const r of ROWS) {
    const before1 = await db.from('scraped_grants')
      .select(`${STATE_COLS}, title, amount_min, amount_max, funder_brief, grant_sources`).eq('id', r.id).single()
    if (before1.error || !before1.data) throw new Error(`${r.id}: ${before1.error?.message ?? 'no row'}`)
    const data = before1.data as unknown as Record<string, unknown>
    const title = String(data.title)
    if (!r.re.test(title)) throw new Error(`${r.id}: title "${title}" does not match ${r.re}`)

    const quote = Object.values(r.cits)[0].snippet
    console.log(`\n${title}`)
    console.log(`  min ${r.min ?? 'null'}  max ${r.max ?? 'null'}`)
    console.log(`  "${quote}"`)

    if (!APPLY) { written.push({ id: r.id, min: r.min ?? null, max: r.max ?? null, prose_only: false, quote, url: r.sourceUrl }); continue }

    // Call one: the columns, plus banking the guidance page in grant_sources.
    const existingSources = (data.grant_sources as { url?: string }[] | null) ?? []
    const haveSource = existingSources.some(s => s.url === r.sourceUrl)
    const fields: Record<string, unknown> = {}
    if (r.min !== undefined) fields.amount_min = r.min
    if (r.max !== undefined) fields.amount_max = r.max
    if (!haveSource) fields.grant_sources = [...existingSources, { url: r.sourceUrl, text: '', label: r.sourceLabel }]

    const res = await mergeGrantUpdate({ id: r.id, fields, source: SOURCE, db, citations: r.cits })
    const refused = res.rejected.filter(x => x.reason !== 'idempotent')
    console.log(`  applied [${res.applied.join(', ') || 'nothing'}]${refused.length ? `  REFUSED ${JSON.stringify(refused)}` : ''}`)
    if (refused.length) throw new Error(`${title}: refused unexpectedly — ${JSON.stringify(refused)}. Neither amount field on this row is admin-held; a refusal here is a bug, not a decision.`)

    const columnsApplied = res.applied.some(f => f === 'amount_min' || f === 'amount_max')

    // Call two: typical_award, only once the columns actually landed.
    if (columnsApplied) {
      const brief = { ...((data.funder_brief as Record<string, unknown> | null) ?? {}) }
      brief.typical_award = r.typical_award
      const res2 = await mergeGrantUpdate({
        id: r.id, fields: { funder_brief: brief }, source: SOURCE, db,
        citations: { funder_brief: r.typical_award_cit },
      })
      const refused2 = res2.rejected.filter(x => x.reason !== 'idempotent')
      console.log(`  typical_award [${res2.applied.join(', ') || 'nothing'}]${refused2.length ? `  REFUSED ${JSON.stringify(refused2)}` : ''}`)
    } else {
      console.log(`  typical_award NOT written — the column write it describes was not applied`)
    }

    // ── The guard ────────────────────────────────────────────────────────────
    const after = await db.from('scraped_grants').select(STATE_COLS).eq('id', r.id).single()
    if (after.error || !after.data) throw new Error(`${r.id}: re-read failed`)
    const a = snap(before1.data as unknown as Record<string, unknown>)
    const b = snap(after.data as unknown as Record<string, unknown>)
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      throw new Error(`${title}: STATE MOVED during the write. before ${JSON.stringify(a)} after ${JSON.stringify(b)}. Stop and put it back.`)
    }

    written.push({ id: r.id, min: r.min ?? null, max: r.max ?? null, prose_only: false, quote, url: r.sourceUrl })
  }

  const after = APPLY ? await noAmountCount(db) : before
  console.log(`\nno-amount count after: ${after} (before ${before}, ${APPLY ? 'expect fall by 3' : 'not applied yet'})`)

  if (APPLY) appendJob3(written, [], { before, after })
}
main().catch(e => { console.error(e); process.exit(1) })
