// Two rows Paul spot-checked on 27 August, and what each turned out to be.
//
// JOSEPH ROWNTREE REFORM TRUST — the link is fine, the amount is not.
// The page would not load from Paul's machine (TLS reset at the handshake, in
// curl and in Chrome) while the reader proxy read it from another network, so
// the "dead page" is a reachability problem and not ours. Reading it did show a
// real error: we carried £5,000 to £100,000 where the funder says awards have
// ranged "from a few thousand pounds to around £300k". The floor is not stated
// anywhere, so it goes to null rather than being invented; the brief already
// carries the detail the range cannot (£10k rolling, quarterly rounds above).
//
// TUDOR TRUST — withdrawn. "The Change We Seek" is Tudor's 2025 framework, not a
// grant programme: their site introduces it in a film. There is no application
// process at all ("we do not have a traditional, written application process"),
// grants run £100k to £1m against our £5k to £150k, and the link now redirects
// to a different page. Our verifier said the page did not describe this fund on
// 17 August and a guard threw the finding away; that guard is fixed separately.
//
//   npx tsx --env-file=.env.local scripts/spot-check-fixes-2026-08-27.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { recordFieldEvidence } from '../src/lib/field-evidence'
import { formatRejectReason } from '../src/lib/admin/reject-reasons'

const APPLY = process.argv.includes('--apply')
const JRRT  = 'af3eed37-f766-4e08-8880-541c4c36f28b'
const TUDOR = '2fddeaed-0ad1-4def-aad0-a6edde6a83db'

const JRRT_QUOTE  = 'In the last five years, JRRT has awarded grants ranging from a few thousand pounds to around £300k.'
const JRRT_URL    = 'https://www.jrrt.org.uk/apply-for-a-grant/'
const TUDOR_QUOTE = 'We do not have a traditional, written application process. Instead, we commit to building a relationship through a series of conversations.'

async function main() {
  const db = getAdminDb()
  if (!APPLY) console.log('DRY RUN — nothing written. Pass --apply.\n')

  if (APPLY) {
    const r = await mergeGrantUpdate({
      id: JRRT, db,
      fields: { amount_min: null, amount_max: 300000 },
      source: 'user_verified:spot-check-2026-08-27',
      citations: {
        amount_max: { snippet: JRRT_QUOTE, confidence: 'high' },
        amount_min: { snippet: 'The funder states no floor. "A few thousand pounds" describes past awards, not a minimum request.', confidence: 'high' },
      },
    })
    console.log(`JRRT amount: applied [${r.applied.join(', ') || 'nothing'}]`
      + `${r.rejected.length ? ` REJECTED ${JSON.stringify(r.rejected)}` : ''}`)

    const e = await recordFieldEvidence({
      id: JRRT, db,
      patch: {
        amount_max: { quote: JRRT_QUOTE, source_url: JRRT_URL, checked_at: '2026-08-27T00:00:00.000Z', by: 'admin:spot-check-2026-08-27', agrees: true },
      } as never,
    })
    console.log(`JRRT evidence: stamped [${e.stamped.join(', ')}]`)
  } else {
    console.log('[dry] JRRT amount -> null..300000, with the funder\'s sentence as evidence')
  }

  const reason = formatRejectReason(
    'non_funder',
    '"The Change We Seek" is Tudor\'s 2025 framework, not a grant programme, and the trust runs no application '
    + 'process: "we do not have a traditional, written application process", invitation only after their own '
    + 'ecosystem mapping. Their stated grant size is £100k to £1m against the £5k to £150k we carried, and the '
    + 'stored link now redirects elsewhere. Verified against tudortrust.org.uk on 2026-08-27.',
  )

  if (APPLY) {
    const r = await mergeGrantUpdate({
      id: TUDOR, db,
      fields: { is_active: false, pipeline_state: 'rejected', rejection_reason: reason },
      source: 'system:spot-check-2026-08-27',
    })
    console.log(`Tudor: applied [${r.applied.join(', ') || 'nothing'}]`
      + `${r.rejected.length ? ` REJECTED ${JSON.stringify(r.rejected)}` : ''}`)
  } else {
    console.log(`[dry] Tudor -> rejected (${TUDOR_QUOTE.slice(0, 40)}…)`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
