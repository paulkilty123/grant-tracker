// The seven rows in the link bucket. One is a bad link. Four are bot walls.
//
// Read every one before touching it, and the bucket is misnamed for six of them:
//
//   Co-op Local Community Fund   "Pardon Our Interruption" — bot detection
//   Aviva Communities Fund       403
//   Waitrose Community Matters   403
//   GLA London Community Energy  london.gov.uk, already in BLOCKED_FUNDER_DOMAINS
//
// Four retailer and public-sector WAFs. verifyRow already retries through the
// reader proxy and still cannot read them, which is precisely what
// `_read_exhausted` is for: not "we have not looked" but "we have looked as hard
// as we can". Filing them under the link bucket tells a reviewer to go and find a
// URL that is not lost.
//
//   Bernard Sunley  the page exists; a plain fetch returns the title and no body
//   Rank Time to Shine  the fetch returns a PNG
//
// Both left alone. Unreadable to a fetch is not the same as wrong, and neither
// has evidence against it.
//
// THE ONE REAL PROBLEM: Big Issue Invest's "Diverse Leaders Fund" does not exist.
// Big Issue Invest runs the Growth Impact Fund, with UnLtd, and Power Up London.
// There is no Diverse Leaders Fund. The row came from `discovery_queue`, its
// apply_url is dead, and it claims £20,000 to £4,000,000 — a range no single fund
// has. Same shape as the other discovery inventions in this ledger.
//
//   npx tsx --env-file=.env.local scripts/fix-link-bucket-2026-08-20.ts --dry
//   npx tsx --env-file=.env.local scripts/fix-link-bucket-2026-08-20.ts
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const DRY = process.argv.includes('--dry')
const SOURCE = 'user_verified:link-bucket-2026-08-20'
const CHECKED = '2026-08-20T18:00:00.000Z'

const WALLED = [
  ['495e8cbc-a7b4-4de1-984f-26f856832259', 'Co-op Local Community Fund', 'coop.co.uk returns "Pardon Our Interruption", its bot-detection interstitial, to a plain fetch'],
  ['03cdaa5a-7ee4-46d2-a724-0b1bbf00a1aa', 'Aviva Communities Fund', 'aviva.co.uk returns 403 to every non-browser fetch'],
  ['3da49c2b-f77e-4c62-86cd-b3a1d734457a', 'Waitrose Community Matters', 'waitrose.com returns 403 to every non-browser fetch'],
  ['0d4a2ffd-1aeb-43ca-b1e9-469c2066b968', 'GLA London Community Energy Fund', 'london.gov.uk is already listed in BLOCKED_FUNDER_DOMAINS as returning 403 to every non-browser fetch'],
] as const

const WITHDRAW = {
  id: 'b65522ba-0ff5-4784-a190-3ca32eca2e08',
  title: 'Big Issue Invest — Diverse Leaders Fund',
  reason: 'non_funder: Big Issue Invest runs no fund of this name. Its funds are the Growth Impact Fund, delivered with '
    + 'UnLtd, and Power Up London. This row came from discovery_queue, its apply_url is the generic '
    + 'bigissue.com/invest/apply-for-funding/ page and is recorded dead, and it claims £20,000 to £4,000,000 — a range '
    + 'no single fund has. The catalogue already carries the Growth Impact Fund with its real figures. Withdrawn 2026-08-20.',
}

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  console.log('── bot walls: filed as read-exhausted, not as broken links')
  for (const [id, label, why] of WALLED) {
    const { data } = await db.from('scraped_grants').select('field_evidence').eq('id', id).limit(1)
    if (!data?.length) { console.log(`   NOT FOUND ${label}`); continue }
    console.log(`   ${label.slice(0, 44).padEnd(46)} ${why.slice(0, 60)}`)
    if (DRY) continue
    const ev = { ...((data[0].field_evidence ?? {}) as Record<string, unknown>) }
    ev._read_exhausted = {
      by: 'hand:2026-08-20', reason: 'bot_wall', consecutive: 2,
      checked_at: CHECKED, detail: why,
    }
    // field_evidence is not trust-tracked; this is a record of an attempt, not a
    // claim about the fund.
    const { error } = await db.from('scraped_grants').update({ field_evidence: ev }).eq('id', id)
    if (error) console.log(`      FAILED: ${error.message}`)
  }

  console.log('\n── withdrawn')
  console.log(`   ${WITHDRAW.title}`)
  if (!DRY) {
    const r = await mergeGrantUpdate({
      id: WITHDRAW.id,
      fields: { is_active: false, pipeline_state: 'rejected', rejection_reason: WITHDRAW.reason },
      source: SOURCE, db,
      citations: { pipeline_state: { snippet: WITHDRAW.reason, confidence: 'high' } },
    })
    console.log(`   applied: ${r.applied.join(', ') || '(nothing)'}`)
    if (r.rejected?.length) console.log(`   REFUSED: ${JSON.stringify(r.rejected)}`)
  }

  console.log('\n── left alone')
  console.log('   Bernard Sunley — Social Welfare Grants   page exists, plain fetch returns no body')
  console.log('   Rank Foundation — Time to Shine          fetch returns a PNG')
  console.log('   Unreadable to a fetch is not the same as wrong, and neither has evidence against it.')

  if (DRY) { console.log('\nDRY RUN — nothing written.\n'); return }

  const { data: after } = await db.from('scraped_grants')
    .select('title, is_active, pipeline_state, field_evidence')
    .in('id', [...WALLED.map(w => w[0]), WITHDRAW.id])
  console.log('\nverified:')
  for (const a of (after ?? []) as { title: string; is_active: boolean; pipeline_state: string; field_evidence: Record<string, unknown> }[]) {
    const ex = a.field_evidence?._read_exhausted ? 'read-exhausted' : ''
    console.log(`   ${a.title.slice(0, 44).padEnd(46)} ${a.pipeline_state.padEnd(12)} ${a.is_active ? 'live' : 'not live'}  ${ex}`)
  }
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
