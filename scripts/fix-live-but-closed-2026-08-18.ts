// Live rows whose OWN brief says a fundraiser cannot apply.
//
// Found by query rather than by luck: 27 live rows carry `open_status: closed`
// or a brief that says the funder takes no unsolicited applications, while the
// row itself is live and carries no such flag. Same failure as the Sport Wales
// and Leeds CF rows earlier tonight, but findable in the data we already hold.
//
// EVERY ONE IS CHECKED AGAINST ITS PAGE FIRST. A `closed` status recorded in a
// July enrichment is a snapshot, and the ledger already records a January brief
// that told users a live fund was shut. Two of the 27 are false positives on the
// word "unsolicited" alone: Mohn Westlake's brief says "Submit an unsolicited
// application", which is the opposite of what the query was looking for.
//
//   npx tsx --env-file=.env.local scripts/fix-live-but-closed-2026-08-18.ts --dry
//   npx tsx --env-file=.env.local scripts/fix-live-but-closed-2026-08-18.ts
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const DRY = process.argv.includes('--dry')
const SOURCE = 'user_verified:live-but-closed-2026-08-18'

const CHANGES = [
  {
    id: '497400aa-0000-0000-0000-000000000000', // resolved by URL below — placeholder
    skip: true,
  },
]

type Change = { id: string; title: string; snippet: string; fields: Record<string, unknown> }

const EDITS: Change[] = [
  {
    id: 'be855b08-0000-0000-0000-000000000000',
    title: 'Southwark Common Purpose Grants — closed, no reopening date',
    snippet: 'Common Purpose is currently closed for applications. We are working on making improvements to the programme.',
    fields: { is_active: false, pipeline_state: 'between_rounds_scheduled' },
  },
  {
    id: '5aeceacf-0000-0000-0000-000000000000',
    title: 'Green Hall Foundation — cycle capped at 150 applications and closed',
    snippet: 'We are so sorry but the limit of 150 applications has already been reached and we have closed this cycle. Please refer to the application cycle for your next opportunity to apply. Posted 2 March 2026.',
    fields: { is_active: false, pipeline_state: 'between_rounds_scheduled', next_open_date: 'Next cycle per the funder\'s published application cycle; no date stated' },
  },
  {
    id: 'ca27a805-0000-0000-0000-000000000000',
    title: 'Glasspool — reaches people only through frontline partners',
    snippet: 'It enables frontline organisations that provide whole-person support to access and distribute grant funds to their service users and clients. During 2023 we undertook a comprehensive recruitment process to select our frontline partners for this fund. This recruitment process is now closed. We do not anticipate entering into a new recruitment round before 2027.',
    fields: { is_invite_only: true },
  },
  {
    id: '71a96f39-0000-0000-0000-000000000000',
    title: 'Wiltshire & Swindon Heritage and Nature — not open to unsolicited applications',
    snippet: 'The programme is not open to unsolicited applications. When we are not running a formal EOI you can still register an interest via this webpage.',
    fields: { is_invite_only: true },
  },
  {
    id: 'e9a5df1f-0000-0000-0000-000000000000',
    title: 'Morrisons "Grant Funding Programme" — 404, and a duplicate of the row fixed today',
    snippet: 'morrisonsfoundation.com/grant-funding-request/ returns 404 while url_status still records ok. The Morrisons Foundation row corrected on 2026-08-18 points at /connecting-communities-grant-request, which returns 200.',
    fields: {
      is_active: false,
      pipeline_state: 'rejected',
      rejection_reason:
        'duplicate: same funder as the Morrisons Foundation row corrected on 2026-08-18, which carries the working /connecting-communities-grant-request link and the £20,000 ceiling. This row 404s and its url_status of ok is stale. Both were live, so users saw Morrisons twice and one link was dead. Withdrawn 2026-08-18.',
    },
  },
]

// Real ids resolved by apply_url so a truncated id cannot target the wrong row.
const BY_URL: Record<string, string> = {
  'be855b08': 'https://www.southwark.gov.uk/community-engagement/grants-and-funding/common-purpose-grants',
  '5aeceacf': 'https://greenhallfoundation.org/how-to-apply/',
  'ca27a805': 'https://www.glasspool.org.uk/',
  '71a96f39': 'https://www.wscf.org.uk/grants-and-support/groups/heritage-and-nature-grants/',
  'e9a5df1f': 'https://www.morrisonsfoundation.com/grant-funding-request/',
}

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  void CHANGES

  let applied = 0
  let refused = 0
  for (const e of EDITS) {
    const prefix = e.id.slice(0, 8)
    const url = BY_URL[prefix]
    const { data } = await db.from('scraped_grants').select('id, title').eq('apply_url', url).maybeSingle()
    if (!data?.id) { console.log(`\n── ${e.title}\n   NOT FOUND for ${url} — skipped`); continue }

    console.log(`\n── ${e.title}`)
    if (DRY) { console.log(`   ${JSON.stringify(e.fields).slice(0, 150)} (dry)`); continue }
    const citations = Object.fromEntries(
      Object.keys(e.fields).map(k => [k, { snippet: e.snippet, confidence: 'high' as const }]),
    )
    const r = await mergeGrantUpdate({ id: data.id, fields: e.fields, source: SOURCE, db, citations })
    console.log(`   applied:  ${JSON.stringify(r.applied)}`)
    applied += r.applied.length
    if (r.rejected?.length) { console.log(`   REFUSED:  ${JSON.stringify(r.rejected)}`); refused += r.rejected.length }
  }
  if (!DRY) console.log(`\nfields applied: ${applied}   fields refused: ${refused}`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
