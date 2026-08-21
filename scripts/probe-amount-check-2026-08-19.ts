// Does the new amount check actually fire, and does it stay quiet when it should?
//
// The unit tests prove the plumbing. They cannot prove the model reads a funder's
// page correctly, which is the part that decides whether this check is useful or
// just noisy. So it is run against four live rows whose truth was established by
// hand on 2026-08-19:
//
//   SHOULD FIRE — the page states no per-applicant figure and the card shows one
//     Allan & Nesta Ferguson   card says up to £50,000; the page offers to match
//                              up to 50% of a budget and names no cash figure
//     Emerton-Christie         card says £1,000-£3,000; the page states no amounts
//     Community Foundation NI  card says £2,000-£5,000; the page's three open
//                              funds are £3,000, £2,000 and £500
//
//   SHOULD NOT FIRE — the page states the figure plainly
//     Free From Fear           card says £100,000-£250,000; the page says
//                              "£100,000 and £250,000"
//
// A check that fires on all four is worthless, and so is one that fires on none.
// READ ONLY: verifyRow writes nothing, and this script does not either.
//
//   npx tsx --env-file=.env.local scripts/probe-amount-check-2026-08-19.ts
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { verifyRow, type VerifyRow } from '../src/lib/verification/verify-row'
import { AMOUNT_UNSUPPORTED_NOTE } from '../src/lib/field-evidence'

const CASES = [
  // Expectation CORRECTED 2026-08-19 by this probe. The hand-check read only the
  // login-walled apply_url and called the £50,000 invented. The verifier hopped
  // to the funder's guidance page and found "Requests up to £50,000 are reviewed
  // monthly", so the figure is the funder's own and must NOT fire.
  { id: '3e70386f-9d11-43cc-824e-54f017aae05f', expect: false, why: 'Ferguson — £50k IS on the guidance page, one hop on' },
  { id: 'a0e69102-abcd-4bb0-a11c-840ad6a3e433', expect: true,  why: 'Emerton-Christie — page states no amounts' },
  // Also corrected: this page carries several funds and ours maps to none of
  // them, so the read stops at the gate with `multiple_funds` and never reaches
  // the facts. That is the right verdict and a different problem from an
  // unsupported amount — the row needs splitting, not a figure checking.
  { id: '12269ada-77e7-4e89-9db0-0d95414bb483', expect: false, why: 'CFNI — gate stops at multiple_funds, before any amount' },
  { id: 'a0b8ede0-9869-4535-91c3-c9b03c15a4d8', expect: false, why: 'Free From Fear — page says £100,000 and £250,000' },
]

const COLS = 'id, title, funder, funding_type, apply_url, deadline, deadline_cycle, is_rolling, '
  + 'amount_min, amount_max, max_org_income, min_org_income, is_invite_only, eligible_structures, '
  + 'location_tag, funder_brief'

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  let right = 0
  for (const c of CASES) {
    const { data } = await db.from('scraped_grants').select(COLS).eq('id', c.id).limit(1)
    const row = data?.[0] as unknown as VerifyRow
    if (!row) { console.log(`\n✗ NOT FOUND ${c.id}`); continue }

    const res = await verifyRow(row, anthropic)
    // Same rule the reader uses: a confirmation anywhere in a multi-page read
    // outranks silence elsewhere in it.
    const amountStamps = res.evidence.filter(e => e.field === 'amount_max' || e.field === 'amount_min')
    const confirmed = amountStamps.some(e => e.agrees === true)
    const noted = amountStamps.some(e => e.note === AMOUNT_UNSUPPORTED_NOTE)
    const fired = noted && !confirmed
    const proposal = res.proposals.find(p => p.field === 'amount_max' || p.field === 'amount_min')

    const ok = fired === c.expect
    if (ok) right++
    console.log(`\n${ok ? '✓' : '✗'} ${c.why}`)
    console.log(`   card shows: ${row.amount_min ?? '—'} to ${row.amount_max ?? '—'}`)
    console.log(`   outcome:    ${res.outcome}`)
    console.log(`   fired:      ${fired}   (expected ${c.expect})`)
    if (proposal) console.log(`   proposed:   ${proposal.field} ${proposal.from} → ${proposal.to} — "${String(proposal.quote).slice(0, 90)}"`)
    const amountNote = res.notes.find(n => n.startsWith('amounts unsupported'))
    if (amountNote) console.log(`   note:       ${amountNote}`)
  }
  console.log(`\n${right} of ${CASES.length} as expected\n`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
