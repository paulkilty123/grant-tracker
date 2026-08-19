// The eight rows the discovery queue added on 2026-08-19. All eight are funders
// the catalogue already holds. Approved by Paul, 2026-08-19.
//
//   npx tsx --env-file=/Users/paulkilty/dev/grant-tracker/.env.local \
//     scripts/withdraw-discovery-dups-2026-08-19.ts [--dry]
//
// Writes reports/withdraw-discovery-dups-2026-08-19.json first. None of these
// rows was ever live, so nothing changes for a user.
//
// Checked individually rather than withdrawn as a batch, because "arrived in
// the same run" is not a reason. CAF Venturesome was the one that could have
// been genuinely new, and turned out to be the clearest case of all: the fund
// is already published as 1df738d5 under funder "CAF Venturesome", while the
// new row carries funder "Charities Aid Foundation (CAF)". Same fund, same
// site, different funder string — which is precisely why nothing caught it.
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { writeFileSync } from 'node:fs'

const SOURCE = 'user_verified:discovery-dedup-2026-08-19'
const DRY = process.argv.includes('--dry')

const ROWS = [
  {
    id: '5a9464eb',
    reason: 'duplicate_of_archived_5db10efd',
    title: 'Bridges Evergreen & Social Impact Funds',
    why: 'Identical apply_url to 5db10efd "Bridges Fund Management — Social Outcomes Fund", archived since April. The same URL was already looked at and put away.',
  },
  {
    id: 'a9b45831',
    reason: 'duplicate_of_published_72739682',
    title: 'Charity Bank Social Enterprise & Charity Loans',
    why: 'Charity Bank already has three rows including the live 72739682 "Charity Bank Loans for Social Purpose" on /loans. This one points at the bare homepage.',
  },
  {
    id: '81ea7507',
    reason: 'duplicate_of_archived_eb8b4219',
    title: 'Unity Trust Bank Social Enterprise Lending',
    why: 'eb8b4219 "Unity Trust Bank — Social Enterprise Banking" was archived in April and pointed at the specific /business-banking/social- page. This re-adds the funder at the homepage, so it is both a duplicate and a worse link.',
  },
  {
    id: 'b1b546ce',
    reason: 'wrong_audience_investor_facing',
    title: 'Resonance Enterprise Investment Fund',
    why: 'apply_url is /for-investors/investment-opportunities/... — the page for people putting capital INTO the fund, not for organisations seeking investment. A fundraiser landing there cannot apply. Also duplicates 250e4dea.',
  },
  {
    id: 'bca685d5',
    reason: 'duplicate_of_published_1df738d5',
    title: 'CAF Venturesome',
    why: 'Already published as 1df738d5 "CAF Venturesome Impact Fund". The duplicate escaped because the funder string differs: "CAF Venturesome" against "Charities Aid Foundation (CAF)".',
  },
  {
    id: 'd1fa687c',
    reason: 'duplicate_front_door',
    title: 'Big Issue Invest Loan Finance',
    why: 'Big Issue Invest already has seven rows including three named funds. This adds an eighth pointing at /finance/, the funder front door.',
  },
  {
    id: 'd3b226dc',
    reason: 'duplicate_front_door',
    title: 'Key Fund Social Enterprise Loans and Investment',
    why: 'Key Fund already has eleven rows, six of them live. This adds a twelfth pointing at /apply/, the funder front door.',
  },
  {
    id: 'c6f0aeb5',
    reason: 'directory_not_a_fund',
    title: 'Responsible Finance CDFI Loan Finder',
    why: 'A search tool listing other lenders, not a fund anyone applies to. Same class as the fundingforall and goodfinance links already in the queue.',
  },
]

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Resolve the 8-char prefixes to full ids so the script cannot act on the
  // wrong row if a prefix ever collides.
  const { data: all } = await db
    .from('scraped_grants')
    .select('id, title, funder, apply_url, is_active, pipeline_state, rejection_reason, first_seen_at')
    .eq('source', 'discovery_queue')
    .gte('first_seen_at', '2026-08-19')

  const resolved = ROWS.map(r => {
    const hits = (all ?? []).filter(g => String(g.id).startsWith(r.id))
    if (hits.length !== 1) throw new Error(`prefix ${r.id} matched ${hits.length} rows, expected 1`)
    return { ...r, fullId: String(hits[0].id), before: hits[0] }
  })

  if (!DRY) {
    writeFileSync('reports/withdraw-discovery-dups-2026-08-19.json', JSON.stringify({
      written_at_utc: new Date().toISOString(),
      approved_by: 'Paul, 2026-08-19',
      note: 'Reversal: set pipeline_state back to the value in `before` and clear rejection_reason.',
      rows: resolved.map(r => ({ ...r, before: undefined })),
      before: resolved.map(r => r.before),
    }, null, 2))
    console.log('report → reports/withdraw-discovery-dups-2026-08-19.json')
  }

  for (const r of resolved) {
    console.log(`\n── ${r.title}`)
    console.log(`   ${r.reason}`)
    if (DRY) { console.log('   (dry)'); continue }
    const res = await mergeGrantUpdate({
      id: r.fullId,
      fields: { pipeline_state: 'rejected', rejection_reason: r.reason, is_active: false },
      source: SOURCE, db,
    })
    console.log(`   applied:  ${JSON.stringify(res.applied)}`)
    if (res.rejected?.length) console.log(`   REJECTED: ${JSON.stringify(res.rejected)}`)
  }
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
