// Paul: "there is not much enrichment info on the grant" — LNER Customer &
// Community Investment Fund.
//
// ─────────────────────────────────────────────────────────────────────────────
// IT IS NOT A THIN BRIEF, IT IS AN EMPTY ONE
//
// The row carries all 16 funder_brief keys and every single one is null except
// `source: live_fetch`, `open_status: unknown` and `last_enriched: 2026-07-31`.
// A shell with the shape of a brief and none of the content. It is LIVE, with a
// deadline six days away, and no who_can_apply and no exclusions — and
// eligibility is never a paid feature and is supposed to be complete on every
// surface.
//
// WHY IT IS EMPTY: lner.co.uk returns HTTP 403 to a plain fetch. The enricher's
// `live_fetch` got the 5,872-byte block page whose entire visible text is
// "Access to this page has been denied", and dutifully wrote nulls. Read through
// the reader proxy the page is 39kB and fine — which is exactly what
// READER_PROXY_URL exists for, and what `check-reader-proxy` proves works every
// morning against a bot-walled canary.
//
// THE CONTENT WAS NEVER ON THAT PAGE ANYWAY. The fund page describes the fund
// and links out to "CCIF guidance document". Every hard fact below — the amount
// range, who may apply, the exclusions, the timeline — is in that PDF, read
// 2026-08-25. This is the multi-page sourcing problem in miniature: a
// single-page read of the front door cannot certify this row no matter how well
// the fetch works.
//
// NO API SPEND. Reader proxy for the page, curl + pdftotext for the guidance,
// and the brief written by hand from the funder's own words.
//
//   npx tsx --env-file=.env.local scripts/fix-lner-and-audit-empty-briefs-2026-08-25.ts --dry
//   npx tsx --env-file=.env.local scripts/fix-lner-and-audit-empty-briefs-2026-08-25.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const DRY = process.argv.includes('--dry')
const ID  = 'a14b6359-b0c8-45f6-a41d-8f4a0160017c'
const GUIDANCE = 'https://assets.ctfassets.net/mxack5k9p2sw/7lOSOfwM1SWPwpFWyT2RPi/ba39d064516a907121d5426c1aa002a4/CCIF_Guidance_and_Applicantion_From_Template_-_13th_May_2026.pdf'

// Trust 70 — above ai_enrich (60) deliberately. A generator already produced an
// all-null brief for this row once; it should not be able to replace a brief
// read out of the funder's own guidance document with another one.
const SOURCE = 'user_verified:lner-guidance-2026-08-25'

const BRIEF = {
  source: 'guidance_pdf',
  last_enriched: '2026-08-25',
  open_status: 'open',
  what_they_fund:
    'Three named priorities, and a project must clearly align with one of them. BETTER FOR PEOPLE: diverse and inclusive community projects creating opportunities for learning and social mobility, and a culture of positive mental health. BETTER FOR PLACES: building skills, employability and education among marginalised groups. BETTER FOR PLANET: biodiversity (rewilding, new or extended wildlife corridors, regeneration of urban spaces), sustainable travel to and from LNER stations, and waste reduction and the circular economy.',
  who_can_apply:
    'Registered charities, community groups, Community Interest Companies, co-operative societies, limited companies, Community Rail Partnerships, business partnerships, and schools for extracurricular projects only. The project must be based within 15 miles of the LNER route in England or Scotland. LNER states a preference, not a rule, for organisations with income between £10,000 and £1 million.',
  exclusions:
    'Capital projects, including new buildings and major refurbishments. Core costs such as salaries and general running costs. Staff costs above 25% of the amount requested. Requests above £10,000, which will not be considered. Projects with more than two funders, as LNER prefers to be the sole funder or one of two. Applications without a cost breakdown will not be considered.',
  typical_award: '£1,000 to £10,000',
  geographic_focus:
    'Within 15 miles of the LNER route in England or Scotland. That corridor runs from London up the East Coast Main Line through the East of England, Yorkshire and the North East to Edinburgh and beyond; funded projects have included work in Inverness, Edinburgh, Berwick-upon-Tweed, Newcastle, Durham, Leeds, Bradford and York.',
  decision_timeline:
    'The window opens July or August and closes August or September. Review and shortlisting September to October, community and customer voting in November, final approvals December to March, award notifications April or May. LNER warns it may take up to four months to hear an outcome. Funding must be spent or committed by March, and all activity delivered within one financial year (April to March).',
  how_to_apply:
    'Online through the LNER website while the window is open. One supporting document only: a two-page Word or PDF file, or a two-worksheet Excel file. Additional pages will not be considered. The form does not auto-save, so complete it in one sitting, and there is no email confirmation — only an on-screen message. Questions to CCIF@lner.co.uk.',
  strong_application:
    'Name which of the three priorities the project addresses and why. State the need factually and say how it was identified. Give beneficiary numbers, not just beneficiary groups. Provide a month-by-month timeline running March to April of the following year, matching the financial year. Include a full budget breakdown: total project cost, what CCIF funding will pay for, and any match or in-kind funding. Set targets and KPIs and say how impact will be measured.',
  funder_tips:
    "LNER lists the mistakes that sink applications: missing or unclear beneficiary numbers, vague timelines, staff costs over 25% of the request, no budget breakdown, unspecified activities, and asking for more than £10,000. It also asks about funding secured in the last two years and what was delivered with it. If the project needs LNER staff involvement — station access, volunteering, training — contact them before applying to confirm it is feasible.",
  priorities: 'Better for People, Better for Places, Better for Planet',
  is_local: false,
  location_tag: null,
}

async function fetchAll(db: any) {
  const out: any[] = []
  for (let f = 0; ; f += 900) {
    const { data, error } = await db.from('scraped_grants').select('id,title,is_active,funder_brief,apply_url,url_status').range(f, f + 899)
    if (error) throw new Error(error.message); out.push(...(data ?? [])); if (!data || data.length < 900) break
  }
  return out
}

/** The five fields a fundraiser actually needs off a brief. */
const CORE = ['who_can_apply', 'what_they_fund', 'exclusions', 'typical_award', 'how_to_apply']

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // ── how common is the empty shell? ────────────────────────────────────────
  const live = (await fetchAll(db)).filter(r => r.is_active === true)
  const scored = live.map(r => {
    const b = (r.funder_brief ?? {}) as Record<string, unknown>
    const filled = CORE.filter(k => b[k] != null && String(b[k]).trim() !== '').length
    return { ...r, filled, hasBrief: Object.keys(b).length > 0 }
  })
  const empty  = scored.filter(r => r.hasBrief && r.filled === 0)
  const thin   = scored.filter(r => r.hasBrief && r.filled > 0 && r.filled <= 2)
  const noElig = scored.filter(r => { const b = (r.funder_brief ?? {}) as any; return !b.who_can_apply })

  console.log(`live rows: ${live.length}`)
  console.log(`   brief present but ALL FIVE core fields empty : ${empty.length}`)
  console.log(`   one or two of the five                       : ${thin.length}`)
  console.log(`   no who_can_apply at all                      : ${noElig.length}   <- eligibility is meant to be on every surface`)
  console.log('\n   the empty ones:')
  for (const r of empty.slice(0, 20)) console.log(`      ${String(r.title).slice(0, 46).padEnd(48)} ${r.url_status}  ${String(r.apply_url).slice(0, 46)}`)
  if (empty.length > 20) console.log(`      ... and ${empty.length - 20} more`)

  // ── fix the one Paul asked about ──────────────────────────────────────────
  console.log('\n── LNER: writing a brief from the CCIF guidance document')
  console.log(`   amount    : £1,000 – £10,000 ("You may request between £1,000 and £10,000. Requests above £10,000 will not be considered.")`)
  console.log(`   structures: charities, CIOs/SCIOs, community groups, both CIC forms, co-ops, limited companies, LLPs`)
  console.log(`   income    : left NULL — "we PREFER to support" is a preference, and a soft signal used as a hard filter hides funds`)
  console.log(`   location  : left NULL — "within 15 miles of the LNER route" is not expressible as a tag, and guessing one would hide it from half the corridor`)

  if (DRY) { console.log('\nDRY RUN — nothing written.\n'); return }

  const res = await mergeGrantUpdate({
    id: ID,
    fields: {
      funder_brief: BRIEF,
      amount_min: 1000,
      amount_max: 10000,
      funder_type: 'corporate',
      funding_index_url: GUIDANCE,
      eligible_structures: [
        'registered_charity', 'cio', 'scio', 'unincorporated',
        'cic_guarantee', 'cic_shares', 'cooperative',
        'ltd_guarantee', 'ltd_shares', 'llp',
      ],
    },
    source: SOURCE, db,
    citations: {
      funder_brief: { snippet: `Written from the CCIF Guidance & Application Form Template (13 May 2026), read 2026-08-25 at ${GUIDANCE}. The fund page itself carries no criteria and 403s to a plain fetch, which is why the previous brief was empty.`, confidence: 'high' },
      amount_min:   { snippet: '"You may request between £1,000 and £10,000. Requests above £10,000 will not be considered." — CCIF guidance, Eligibility Criteria', confidence: 'high' },
      amount_max:   { snippet: '"You may request between £1,000 and £10,000. Requests above £10,000 will not be considered." — CCIF guidance, Eligibility Criteria', confidence: 'high' },
      eligible_structures: { snippet: '"We welcome applications from: Registered charities, Community groups, Community Interest Companies (CICs), Co-operative societies, Limited companies, Community Rail Partnerships, Business partnerships, Schools (extracurricular projects only)." Sole traders and unregistered bodies are NOT named and are not included.', confidence: 'high' },
    },
  })
  console.log(`\n   applied : ${res.applied.join(', ') || '(nothing)'}`)
  if (res.rejected?.length) console.log(`   REFUSED : ${JSON.stringify(res.rejected)}`)

  const { data } = await db.from('scraped_grants').select('title,amount_min,amount_max,eligible_structures,funder_brief').eq('id', ID).single()
  const b = (data as any)?.funder_brief ?? {}
  console.log(`\n   verified: £${(data as any)?.amount_min}–£${(data as any)?.amount_max}, ${((data as any)?.eligible_structures ?? []).length} structures, ${CORE.filter(k => b[k]).length}/5 core brief fields present`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
