// The 18 rows the sub-tagging found in the wrong tab. Paul: "yes move them."
//
// Twelve surfaced while tagging Programmes and six while tagging In-Kind. That
// was the argument for the taxonomy in the first place: forcing every row to
// answer "which of these are you" makes the ones that are none of them obvious.
//
// THREE DISPOSITIONS, and the difference matters:
//
//   MOVED TO GRANT (11) — a plain grant with "programme" or "fund" in its name.
//   Nothing about them is wrong except the tab, so they keep everything else and
//   simply appear where a fundraiser would look.
//
//   MOVED AND MARKED INVITATION-ONLY (1) — Gatsby makes grants but does not take
//   applications, and moving it to Grants without saying so would send people to
//   a door that does not open.
//
//   WITHDRAWN (6) — not a funding opportunity this catalogue covers, or a
//   duplicate. Each keeps a rejection_reason quoting what made the call.
//
// SUB-TYPES ARE CLEARED ON EVERY MOVE. `includes_grant` is a programme code and
// means nothing on a grant row, and the grant codes describe spend restriction,
// which none of these rows state. Leaving the old value would put a wrong label
// on the card; inventing a new one would be worse. Untagged is the honest state.
//
//   npx tsx --env-file=.env.local scripts/move-mistyped-rows-2026-08-19.ts --dry
//   npx tsx --env-file=.env.local scripts/move-mistyped-rows-2026-08-19.ts
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const DRY = process.argv.includes('--dry')
const SOURCE = 'user_verified:mistyped-move-2026-08-19'

type Move = { id: string; title: string; fields: Record<string, unknown>; why: string }

const TO_GRANT: Move[] = [
  { id: 'c40dc901-c460-4358-9a86-bd5a13878966', title: 'AI For All',
    why: 'provides targeted grants up to £2,500. A grant, not a programme.', fields: {} },
  { id: '8888f9ed-6ea5-49dd-9c96-b4fe632d4bf9', title: 'Co-op Foundation — Belong',
    why: 'funds projects up to £20,000 tackling youth loneliness. A grant.', fields: {} },
  { id: 'b3dac130-3d54-4bb6-8714-034016f18611', title: 'Doc Society — Documentary Fund',
    why: 'a documentary fund awarding up to £200,000 to director-led films. A grant.', fields: {} },
  { id: '68d71ccf-5285-491c-ac31-290801ff7665', title: 'Dormant Assets for All',
    why: 'funds capacity-building projects up to £20,000 in Northern Ireland. A grant.', fields: {} },
  { id: 'a7b1e535-b639-471c-9231-1d87cff07489', title: 'DWF Foundation',
    why: 'grants up to £5,000 to registered charities. A grant.', fields: {} },
  { id: '550e7273-d37c-4307-8afe-dcf45b2ec5ba', title: 'Horizon Europe — Cluster 3',
    why: 'research and innovation funding up to £2m. A grant, albeit a consortium one.', fields: {} },
  { id: '2d515d44-595b-421a-8d7d-90b2b32b50e8', title: "Skinners' Company Charity Programme",
    why: 'funds NEET employment programmes up to £10,000. A grant.', fields: {} },
  { id: '5e04c94c-345e-45b0-80c9-ffdfe1969b59', title: 'Strengthening Organisations',
    why: 'funding up to £50,000 for organisational development. A grant.', fields: {} },
  { id: '3a7ce03a-4fc8-49d4-b87e-f1a904e22e54', title: 'The Climate Change Collaboration',
    why: 'funds work to catalyse change, up to £200,000. A grant.', fields: {} },
  { id: 'ac17f2a9-ae1c-44bc-b6ba-a2398bf957fd', title: 'Youth Matters Fund',
    why: 'DCMS funding for youth facilities, equipment and services. A grant.', fields: {} },
  { id: '31f56c84-447a-478b-a15a-fcb19469c1aa', title: 'UK & Ireland Community Tree Planting',
    why: 'cash at up to £2.15 per tree. A grant, filed as in-kind.', fields: {} },
]

const TO_GRANT_INVITE_ONLY: Move[] = [
  { id: '3b836a87-fd0e-4d5c-bfdc-b44f7c793eb1', title: 'Gatsby Charitable Foundation',
    why: 'a grant-maker, but "typically commissions research and designs interventions in partnership with sector and industry experts" — it does not take applications. Moved to Grants AND marked invitation-only, because moving it without that would send people to a door that does not open.',
    fields: { is_invite_only: true } },
]

const WITHDRAW: Move[] = [
  { id: 'bdcda65e-0236-4ac2-9939-9389b990e108', title: 'Social Enterprise NI — Financial Support',
    why: 'non_funder: "curates and signposts funding opportunities for social enterprises". A directory of other people\'s funds, not a fund. Withdrawn 2026-08-19.', fields: {} },
  { id: '1f5efb49-9e91-4857-8f7a-f00969787504', title: 'Theatre Tax Relief',
    why: 'out_of_scope: a Corporation Tax relief claimed from HMRC by companies producing theatre. A real financial benefit, but not a funding opportunity anyone applies to a funder for, and not in-kind support. Withdrawn 2026-08-19.', fields: {} },
  { id: '4f507ab2-bda9-41a9-a26d-2a590b30f73d', title: 'TheGivingMachine — GivingLottery',
    why: 'out_of_scope: its own page says "This is not a grant scheme — it\'s a fundraising platform." A way to raise money from your own supporters, not a way to receive it. Withdrawn 2026-08-19.', fields: {} },
  { id: '2b7a0bd8-edbd-4467-8951-24dc99296d84', title: 'Buy Social Corporate Challenge',
    why: 'out_of_scope: its own page says "This is not a grant scheme." A corporate procurement partnership; the benefit is contracts won, not support received. Withdrawn 2026-08-19.', fields: {} },
  { id: '5438550b-eec4-48a6-8452-f64ebcb32d35', title: 'Yorkshire Universities',
    why: 'non_funder: its own entry records "not a grant-making funder. It does not appear to offer grants to external charities or community organisations." Withdrawn 2026-08-19.', fields: {} },
  { id: 'fc653e05-73e5-4a48-90b8-a8b8de429211', title: 'Superhighways — London Charities (duplicate)',
    why: 'duplicate of 895556e0, the same Superhighways service entered twice. The surviving row links the service page rather than the homepage, carries a longer description and a fuller brief, and was enriched in July against this one\'s April. Withdrawn 2026-08-19.', fields: {} },
]

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const all = [
    ...TO_GRANT.map(m => ({ ...m, fields: { ...m.fields, funding_type: 'grant', funding_subtypes: null }, kind: 'to grant' })),
    ...TO_GRANT_INVITE_ONLY.map(m => ({ ...m, fields: { ...m.fields, funding_type: 'grant', funding_subtypes: null }, kind: 'to grant, invite-only' })),
    ...WITHDRAW.map(m => ({ ...m, fields: { ...m.fields, is_active: false, pipeline_state: 'rejected', rejection_reason: m.why, funding_subtypes: null }, kind: 'withdrawn' })),
  ]
  console.log(`moves: ${TO_GRANT.length + TO_GRANT_INVITE_ONLY.length}   withdrawals: ${WITHDRAW.length}   total: ${all.length}\n`)

  let applied = 0, refused = 0
  for (const m of all) {
    if (DRY) { console.log(`  [${m.kind}] ${m.title}`); continue }
    const citations = Object.fromEntries(
      Object.keys(m.fields).map(k => [k, { snippet: m.why, confidence: 'high' as const }]),
    )
    const r = await mergeGrantUpdate({ id: m.id, fields: m.fields, source: SOURCE, db, citations })
    applied += r.applied.length
    const stillWrong = r.rejected?.filter(x => x.field === 'funding_type') ?? []
    console.log(`  [${m.kind}] ${m.title.slice(0, 46).padEnd(46)} ${r.applied.join(', ') || '(nothing)'}`)
    if (r.rejected?.length) {
      refused += r.rejected.length
      console.log(`      REFUSED: ${r.rejected.map(x => `${x.field} (${x.reason}, held by ${x.blockedBy?.source})`).join('; ')}`)
    }
    if (stillWrong.length) console.log('      ^ STILL IN THE WRONG TAB')
  }
  if (DRY) return
  console.log(`\nfields applied: ${applied}   refused: ${refused}`)

  // Verify against the real thing rather than trusting the write.
  const { data } = await db.from('scraped_grants')
    .select('id, title, funding_type, is_active, pipeline_state, funding_subtypes')
    .in('id', all.map(m => m.id))
  const rows = (data ?? []) as { id: string; title: string; funding_type: string; is_active: boolean; pipeline_state: string; funding_subtypes: string[] | null }[]
  const moveIds = new Set([...TO_GRANT, ...TO_GRANT_INVITE_ONLY].map(m => m.id))
  const badMove = rows.filter(r => moveIds.has(r.id) && (r.funding_type !== 'grant' || !r.is_active))
  const badKill = rows.filter(r => !moveIds.has(r.id) && (r.is_active || r.pipeline_state !== 'rejected'))
  const staleTags = rows.filter(r => (r.funding_subtypes?.length ?? 0) > 0)
  console.log(`\nverified: ${rows.length} rows read back`)
  console.log(`  moves not in Grants or not live : ${badMove.length}${badMove.length ? ' ← ' + badMove.map(r => r.title).join(', ') : ''}`)
  console.log(`  withdrawals still live          : ${badKill.length}${badKill.length ? ' ← ' + badKill.map(r => r.title).join(', ') : ''}`)
  console.log(`  rows left carrying a stale tag  : ${staleTags.length}${staleTags.length ? ' ← ' + staleTags.map(r => r.title).join(', ') : ''}`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
