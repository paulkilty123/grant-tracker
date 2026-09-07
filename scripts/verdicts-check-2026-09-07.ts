// The verdicts job's own check: prove that nothing changed state.
//
// The brief's closing check is "the count of rows whose state changed during
// the job, which must be zero". A count of zero is indistinguishable from a
// check that never looked — the lesson from CLAUDE.md's "an alarm is not proved
// until it has fired" — so this compares against a baseline taken before any
// write and names every row that moved.
//
//   --snapshot   write the baseline (once, before batch 1)
//   (no flag)    compare live state against the baseline and tally the verdicts
//
//   npx tsx --env-file=.env.local scripts/verdicts-check-2026-09-07.ts [--snapshot]

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { getAdminDb } from '../src/lib/admin/admin-db'
import { RESULTS, type Verdict } from './verdicts-lib-2026-09-07'

const SNAPSHOT = process.argv.includes('--snapshot')

// State changes this job did not make and has acknowledged. The alarm exists to
// catch THIS job moving a row; another session acting on a verdict is a correct
// outcome, and silencing it wholesale would retire the alarm. So each one is
// named here with who did it and why, and anything not on the list still fails.
const ACKNOWLEDGED: Record<string, string> = {
  // The 30 entries below are Paul's own actions, not another session's: he
  // worked through pile A's paul_list in the review queue on 7 Sept and the
  // review UI stamped every rejection_reason with "applied at Paul's word".
  // First seen when pile B batch 1's check ran — the pile A verdicts job had
  // finished and the review queue had already been acted on by the time this
  // job started reading pages.
  '83f700c0-0081-4609-bb1f-cb35b5346fa1': 'Pile A verdict actioned by Paul from the review queue (Apply for Investment / Fund Manager Route), stamped by the review UI itself',
  '1e50dd77-8cd0-46dc-9c53-04065ff01f2a': 'Pile A verdict actioned by Paul from the review queue (B&Q Foundation Community Grants), stamped by the review UI itself',
  'a71a1786-dc06-4e11-b04d-def0b9538f96': 'Pile A verdict actioned by Paul from the review queue (Barclays 100x100 UK Community Relief Programme), stamped by the review UI itself',
  '5d883343-70fd-4f10-b28b-5b21324cbca5': 'Pile A verdict actioned by Paul from the review queue (Baring Foundation International Development Programme), stamped by the review UI itself',
  '324b95d5-650f-4350-88d0-45f517d15692': 'Pile A verdict actioned by Paul from the review queue (Big Society Capital Social Investment Wholesale Funding), stamped by the review UI itself',
  'f57c3373-26f6-4f44-a766-761aec387dcd': 'Pile A verdict actioned by Paul from the review queue (Charities and Social Enterprises Lending), stamped by the review UI itself',
  'be85b0fc-7d63-4741-97ce-1ce6f37113b5': 'Pile A verdict actioned by Paul from the review queue (Charity Bank Green Loans, published), stamped by the review UI itself',
  'fdcc973a-c87c-48cf-819c-e921c23fbc73': 'Pile A verdict actioned by Paul from the review queue (Charity Bank Loans), stamped by the review UI itself',
  '085f3c7e-9021-41cb-a66b-1342830ed886': 'Pile A verdict actioned by Paul from the review queue (Community Investment Enterprise Facility), stamped by the review UI itself',
  'cbe84427-1a04-4fbc-8f8c-b09f7af4385d': 'Pile A verdict actioned by Paul from the review queue (CPCA Social Impact Investment Fund), stamped by the review UI itself',
  '0a9e6108-c367-4a93-8df5-d5268d03b7b2': 'Pile A verdict actioned by Paul from the review queue (Desk Space and Meeting Room Hire for Charities), stamped by the review UI itself',
  '9de97466-69b9-4c0e-a182-83c821b109b8': 'Pile A verdict actioned by Paul from the review queue (Edward Gostling Foundation Grants), stamped by the review UI itself',
  'ba76fee4-7d8e-48e5-acac-f9df576c320c': 'Pile A verdict actioned by Paul from the review queue (Energy Resilience Fund), stamped by the review UI itself',
  '6f3892eb-3e7f-4976-b60b-8d46ca476573': 'Pile A verdict actioned by Paul from the review queue (Key Fund Social Investment Loans), stamped by the review UI itself',
  '27f913f2-d5d1-4773-a410-35ceb8eeba18': 'Pile A verdict actioned by Paul from the review queue (LawWorks Clinics Network), stamped by the review UI itself',
  'f44a6141-5b8f-43b8-81b0-f1d5ba0930da': 'Pile A verdict actioned by Paul from the review queue (LawWorks Not-for-Profits Programme), stamped by the review UI itself',
  '56a8cc5f-a0a2-4d6b-af11-fa60b7f0e453': 'Pile A verdict actioned by Paul from the review queue (Microsoft 365 Nonprofit Cloud Subscription via Charity Digital), stamped by the review UI itself',
  'f6b2ac5d-3004-452c-81e6-2d2fa32ccae3': 'Pile A verdict actioned by Paul from the review queue (Microsoft Nonprofit Software Donations Programme), stamped by the review UI itself',
  '5afd77c4-190b-4387-9be1-46a05d8bfe7d': 'Pile A verdict actioned by Paul from the review queue (National Grid Community Grants), stamped by the review UI itself',
  '08819057-94cd-4b9c-879f-af3652675886': 'Pile A verdict actioned by Paul from the review queue (Salesforce Nonprofit Cloud Power of Us Programme), stamped by the review UI itself',
  '8e5f63e4-85d9-47db-b278-56263c8ab4f7': 'Pile A verdict actioned by Paul from the review queue (Severn Trent Community Fund), stamped by the review UI itself',
  '26029120-6cfa-4346-8834-36f77b0af3b2': 'Pile A verdict actioned by Paul from the review queue (Social Investment Business Loan and Grant Funds), stamped by the review UI itself',
  '01aa47c7-4db6-4f51-a129-66ab25e3b548': 'Pile A verdict actioned by Paul from the review queue (St Giles and St George Education Charity, published), stamped by the review UI itself',
  'f5c454d7-728e-4f11-b7f1-1dc139393d3e': 'Pile A verdict actioned by Paul from the review queue (Green Rigg Wind Farm fund, published), stamped by the review UI itself',
  'db97dbb6-63b5-4604-8ccb-10a4722ea2b1': 'Pile A verdict actioned by Paul from the review queue (Shotley Low Quarter fund, published), stamped by the review UI itself',
  'a91f58e0-5572-4d9b-85ad-d67df0e72e0d': 'Pile A verdict actioned by Paul from the review queue (Time to Shine Fellowship), stamped by the review UI itself',
  'ec70ac6e-bd4e-4891-b54a-f4cff376b797': 'Pile A verdict actioned by Paul from the review queue (Triodos Bank Business Banking and Loans), stamped by the review UI itself',
  '6ce1fac3-9818-4f0c-bfde-7186f74320ae': 'Pile A verdict actioned by Paul from the review queue (Ufi VocTech Trust VocTech Ignite), stamped by the review UI itself',
  '7b924e63-a2a6-42f2-9968-4786de21cb47': 'Pile A verdict actioned by Paul from the review queue (Virgin Media O2 Apprenticeship Talent Fund, published), stamped by the review UI itself',
  'cfdaf194-6b06-4aab-81fd-2310d31197ba': 'Pile A verdict actioned by Paul from the review queue (Zoom for Nonprofits Discount Programme), stamped by the review UI itself',
  '29d000d3-e3fa-439e-89f8-e03109af0f44': 'Foundation East: rejected by grant-tracker-be on 7 Sept after batch 2 reported the domain takeover',
  'e31c28ad-10a0-4d7c-9076-33c8f8cf91e9': 'FSI: rejected by grant-tracker-be on 7 Sept after batch 2 reported the dead host',
  // Not in either pile — it was live when the baseline was taken, so this entry
  // can never fire. It is here as the record of a state change made during the
  // job, not as a silenced alarm: grant-tracker-be rejected it closed_for_good
  // on 7 Sept after batch 2, because SIB's funding page lists only its three
  // successor funds and all three are live rows. Batch 4 rejected the row that
  // points at SIB's homepage on the same reasoning.
  '583f0378-26e6-4abe-886c-0686bd8b9d2b': 'Social Investment Business Resilience Fund: rejected closed_for_good by grant-tracker-be on 7 Sept, outside this job\'s row set',
  // Paul's own action again, this time on two of this job's own pin-outlived
  // holds from batch 1 (Alec Dickson Trust Grant, Andrew Wainwright Reform
  // Trust): grant-tracker-be reported these published with new deadlines (4
  // October and 14 September) written over the admin pins at admin source.
  'b1a9dbcd-dce0-45d7-bcd9-9dcaa6a55023': 'Alec Dickson Trust Grant: reopened and published at Paul\'s word on 7 Sept, new deadline written over the pin at admin source (reported by grant-tracker-be)',
  '9f87e023-012b-4b82-9b36-629d76fd816e': 'Andrew Wainwright Reform Trust: reopened and published at Paul\'s word on 7 Sept, new deadline written over the pin at admin source (reported by grant-tracker-be)',
  // grant-tracker-be re-verified this batch\'s two Severn Trent rows and
  // rejected the one this job held (f4225849) as a duplicate of the one this
  // job published (1ef69197-b551-4da9-860c-645c97acfb09) — exactly the merge
  // this job\'s own hold note recommended.
  'f4225849-0663-4532-b73e-b8720dd67fb2': 'Severn Trent Community Fund New Project Funding: rejected duplicate by grant-tracker-be on 7 Sept, of the row this job published in batch 6 (1ef69197)',
  // Five batch 7 publishes went live on Paul's explicit word the same day,
  // per the 7 Sept launch freeze (nothing user-visible goes live without his
  // go, each time) — reported by grant-tracker-be, who also filled
  // sportscotland's brief from its guidelines PDF before publishing it.
  'be7faf98-fdd3-48ad-ac98-bf05fafe26c3': 'Souter Charitable Trust: published at Paul\'s word on 7 Sept (reported by grant-tracker-be)',
  'f1fdcd6e-152a-403f-a1ac-f7838fbe9ebc': 'sportscotland Facilities Investment: brief filled from its guidelines PDF by grant-tracker-be, then published at Paul\'s word on 7 Sept',
  'a3107c21-e079-4291-95f4-fd4c45c77108': 'The Awesome Foundation Glasgow Chapter: published at Paul\'s word on 7 Sept (reported by grant-tracker-be)',
  'f47db5b5-af42-49c5-b807-ce993c3bd9fc': 'The Homity Trust: published at Paul\'s word on 7 Sept (reported by grant-tracker-be)',
  '8599b462-b313-468f-b2c6-72fc0f6c144b': 'The Maypole Fund: published at Paul\'s word on 7 Sept (reported by grant-tracker-be)',
}
const LIST = join(__dirname, '..', 'docs', 'handoffs', 'verdict-rows-2026-09-07.json')
const BASELINE = join(__dirname, '..', 'docs', 'handoffs', 'verdict-state-baseline-2026-09-07.json')

type State = { title: string; is_active: boolean; pipeline_state: string; rejection_reason: string | null }

async function readState(ids: string[]) {
  const db = getAdminDb()
  const out: Record<string, State> = {}
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await db.from('scraped_grants')
      .select('id, title, is_active, pipeline_state, rejection_reason').in('id', ids.slice(i, i + 100))
    if (error) throw new Error(error.message)
    for (const r of (data ?? []) as (State & { id: string })[]) {
      out[r.id] = { title: r.title, is_active: r.is_active, pipeline_state: r.pipeline_state, rejection_reason: r.rejection_reason }
    }
  }
  return out
}

async function main() {
  const piles = JSON.parse(readFileSync(LIST, 'utf8')) as { pile_a_review: { id: string }[]; pile_b_hidden: { id: string }[] }
  const ids = [...piles.pile_a_review.map(r => r.id), ...piles.pile_b_hidden.map(r => r.id)]

  if (SNAPSHOT) {
    if (existsSync(BASELINE)) throw new Error(`${BASELINE} already exists — refusing to overwrite the baseline mid-job`)
    const now = await readState(ids)
    writeFileSync(BASELINE, JSON.stringify(now, null, 1) + '\n')
    console.log(`baseline written for ${Object.keys(now).length} rows -> ${BASELINE}`)
    return
  }

  if (!existsSync(BASELINE)) throw new Error('no baseline: run with --snapshot before the first batch')
  const before = JSON.parse(readFileSync(BASELINE, 'utf8')) as Record<string, State>
  const after = await readState(ids)

  const moved: string[] = []
  const acknowledged: string[] = []
  const gone: string[] = []
  for (const id of ids) {
    const b = before[id], a = after[id]
    if (!b) { moved.push(`${id}: not in the baseline`); continue }
    if (!a) { gone.push(`${b.title} (${id})`); continue }
    if (b.is_active !== a.is_active || b.pipeline_state !== a.pipeline_state || b.rejection_reason !== a.rejection_reason) {
      const line = `${a.title} (${id}): is_active ${b.is_active}->${a.is_active}, state ${b.pipeline_state}->${a.pipeline_state}`
      if (ACKNOWLEDGED[id]) acknowledged.push(`${line}  [${ACKNOWLEDGED[id]}]`)
      else moved.push(`${line}, reject ${JSON.stringify(b.rejection_reason)}->${JSON.stringify(a.rejection_reason)}`)
    }
  }

  console.log(`rows in the job          ${ids.length}`)
  console.log(`state moved              ${moved.length}   <- must be zero, and this check can fail`)
  for (const m of moved) console.log(`   ${m}`)
  console.log(`moved by someone else    ${acknowledged.length}   <- named, not silenced`)
  for (const m of acknowledged) console.log(`   ${m}`)
  console.log(`no longer readable       ${gone.length}`)
  for (const g of gone) console.log(`   ${g}`)

  if (!existsSync(RESULTS)) { console.log('\nno results file yet'); return }
  const file = JSON.parse(readFileSync(RESULTS, 'utf8')) as { batches: { pile: string; verdicts: Verdict[] }[] }
  const all = file.batches.flatMap(b => b.verdicts)
  const tally: Record<string, Record<string, number>> = { A: {}, B: {} }
  for (const v of all) tally[v.pile][v.verdict] = (tally[v.pile][v.verdict] ?? 0) + 1
  const seen = new Set(all.map(v => v.id))

  console.log(`\nverdicts written         ${all.length} of ${ids.length}`)
  for (const pile of ['A', 'B'] as const) {
    const n = Object.values(tally[pile]).reduce((a, b) => a + b, 0)
    const size = pile === 'A' ? piles.pile_a_review.length : piles.pile_b_hidden.length
    console.log(`  pile ${pile}: ${n} of ${size}  ${JSON.stringify(tally[pile])}`)
  }
  const dupes = all.length - seen.size
  console.log(`duplicate verdicts       ${dupes}   <- must be zero`)
  const tidied = all.filter(v => v.tidied.length).length
  console.log(`rows tidied              ${tidied}`)

  if (moved.length) throw new Error('state moved during a job that must not move state')
  if (dupes) throw new Error('the same row has more than one verdict')
}
main().catch(e => { console.error(e); process.exit(1) })
