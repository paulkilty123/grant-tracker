// "38 wrong links" turned out to be mostly right links.
//
// The queue's biggest blocker is `fixable_link: wrong_fund` on 38 rows, and the
// obvious reading — 38 URLs pointing at the wrong page — is wrong. Two checks
// settled it:
//
//   Greggs Foundation  greggsfoundation.org.uk/grants/ IS the Foundation's own
//                      grants page. It lists a Relief Grant and a Community
//                      Action Fund, so the verifier cannot match our single row
//                      to one of them and reports "different fund". The link is
//                      correct; the ROW is funder-level.
//
//   Arts Council       403. Eight rows behind the same bot wall, already on
//                      record. Nothing to do with the URL.
//
// So the verdict has three causes and only one of them is a bad link:
//
//   FRONT DOOR   the row is a funder-level record and the URL is that funder's
//                own funding index. `funding_index_url` is what says so, and
//                `describesADiscreteFund()` in review-reasons already suppresses
//                the wrong-fund reason when apply_url equals it. These rows were
//                simply never told what they are.
//
//   BOT WALL     Arts Council, eight rows. A reader-proxy or read_exhausted
//                question, not a link question.
//
//   NAMED FUND   the row names one specific fund and the URL points at it. Co-op
//                Local Community Fund, Tesco Stronger Starts. Left alone: the
//                verdict is the gate failing to match our title to the funder's
//                wording, which is a prompt problem.
//
// This marks the front doors. It does NOT clear the stored `_page_read` outcome —
// that is a fact about a past read and only a re-read changes it, which costs
// money. What it changes is the reason the queue shows and the gate's view.
//
//   npx tsx --env-file=.env.local scripts/fix-wrong-fund-links-2026-08-20.ts --dry
//   npx tsx --env-file=.env.local scripts/fix-wrong-fund-links-2026-08-20.ts
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const DRY = process.argv.includes('--dry')
const SOURCE = 'user_verified:front-door-2026-08-20'

/** Funder-level rows whose apply_url is that funder's own funding index. */
const FRONT_DOORS = [
  ['c34e18fb-a668-4e45-bb8f-8c7896f03104', 'Barrow Cadbury — Open Grants', 'barrowcadbury.org.uk/what-we-fund/ is the trust\'s funding index across its Justice and Migration programmes'],
  ['b12c394d-346d-4246-a254-06ca5bbadd08', 'Calouste Gulbenkian UK Branch', 'gulbenkian.pt/uk-branch/our-work/our-grant-making/ is the branch\'s grant-making index'],
  ['aec5dee3-6c6b-43b4-abe7-92ece9c390c0', 'Comic Relief — International Development', 'comicrelief.com/funding is the funding index across all Comic Relief programmes'],
  ['c1ca1f42-98fa-471c-ad65-b078bf97c20c', 'Ffilm Cymru Wales — Film Funding', 'ffilmcymruwales.com/funding-and-training lists every Ffilm Cymru scheme'],
  ['d33aa458-0eb8-473a-8b28-547cd8557a71', 'Fredericks Foundation', 'the row covers the foundation\'s lending generally and the URL is its homepage'],
  ['0d4ec360-0e88-4ac8-aa6f-524339515e4b', 'Google.org — Nonprofit Tech', 'google.com/nonprofits/ is the index for Ad Grants, Workspace and the rest'],
  ['6481c4e6-975d-4da1-bbd7-e5d6a2c40ef3', 'Greggs Foundation Grants', 'greggsfoundation.org.uk/grants/ lists the Relief Grant and the Community Action Fund; read 2026-08-20'],
  ['a5da4678-2d9e-49ce-9c9a-599c155046ef', 'LawWorks', 'lawworks.org.uk homepage; the row is LawWorks\' pro bono offer generally'],
  ['45d5140a-8536-4331-b4d3-57462e108a9f', 'Nationwide Foundation Grants Programme', 'nationwidefoundation.org.uk homepage; the row is the programme as a whole'],
  ['957a8b0a-3983-4f66-bc52-58b66f58faf2', 'Resonance — Community Investment Fund', 'resonance.ltd.uk/get-investment/ is Resonance\'s index across its funds'],
  ['ebe92869-c346-408b-a466-1c28861986e6', 'Resonance — National Homelessness Property Fund', 'resonance.ltd.uk/impact-property-funds lists the property funds'],
  ['ce83058b-740b-479c-9848-b97e9e2ef383', 'Smallwood Trust', 'smallwoodtrust.org.uk/grants/ is the trust\'s grants index'],
  ['f1cd5881-e810-4928-875c-17071197523f', 'Sported — Funding Programmes', 'sported.org.uk/sported-programmes/ lists every Sported programme'],
  ['bb47ce9c-29f2-449b-afda-cadc51c12e9d', 'Football Foundation — Grassroots Grants', 'footballfoundation.org.uk/looking-for-funding is the index across its schemes'],
  ['5f18b678-a15a-48a8-b798-8322a9816b61', 'Westminster City Council — Community Grants', 'the council\'s grant-funding-opportunities page indexes its schemes'],
  ['ed047490-107e-4805-8ea2-6cd85520b3ae', 'Clore Social Leadership', 'cloresocialleadership.org.uk homepage; the row is the programme generally'],
  ['7aeaa6a0-d7d7-42c6-9ed0-1d68c94ceb4c', 'ChangemakerXchange Fellowship', 'changemakerxchange.org homepage; the row is the fellowship generally'],
] as const

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  let applied = 0, refused = 0, already = 0

  for (const [id, label, why] of FRONT_DOORS) {
    const { data } = await db.from('scraped_grants').select('apply_url, funding_index_url').eq('id', id).limit(1)
    const row = data?.[0] as { apply_url: string | null; funding_index_url: string | null } | undefined
    if (!row) { console.log(`   NOT FOUND ${label}`); continue }
    if (row.funding_index_url === row.apply_url) { already++; continue }
    console.log(`   ${label.slice(0, 44).padEnd(46)} ${row.apply_url}`)
    if (DRY) continue
    const r = await mergeGrantUpdate({
      id, fields: { funding_index_url: row.apply_url }, source: SOURCE, db,
      citations: { funding_index_url: { snippet: `This row is funder-level and its apply_url is the funder's own funding index: ${why}. Recording it stops the wrong-fund check asking a front door which single fund it is.`, confidence: 'high' } },
    })
    if (r.applied.includes('funding_index_url')) applied++
    if (r.rejected?.length) refused++
  }

  console.log(`\nalready marked: ${already}`)
  if (DRY) { console.log('DRY RUN — nothing written.\n'); return }
  console.log(`marked as front doors: ${applied}   refused: ${refused}`)

  const { data: after } = await db.from('scraped_grants')
    .select('id').in('id', FRONT_DOORS.map(f => f[0])).not('funding_index_url', 'is', null)
  console.log(`rows now carrying a funding_index_url: ${(after ?? []).length}/${FRONT_DOORS.length}`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
