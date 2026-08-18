// CAST — three rows for one organisation, none of them named after a real programme.
//
//   22761b70  "CAST Digital Fellowship"                        roadmap-seed,     11 Mar, archived
//   1335abc5  "CAST Fellowship and Digital Support Programmes"  discovery_queue,  26 Jul, hidden
//   86a561b4  "CAST Accelerator Programme"                      discovery_queue,  11 Aug, hidden
//
// Paul added CAST in March. It was archived, and discovery_queue then re-created
// the same organisation twice under invented programme names, both titled by
// `discovery:gemini`. None of "Digital Fellowship", "Fellowship and Digital
// Support Programmes" or "Accelerator Programme" appears anywhere on CAST's site.
//
// What CAST actually runs, from its own programmes page: Coffee Connections,
// Design Hops, GrantAdvisor UK, Digital Leads Network, Open IP for Funders and
// events — all open, all FREE SUPPORT rather than funding. Five more are closed to
// new participants. So the honest shape is one in-kind row pointing at the
// programmes page, which is also the application route I failed to find when I
// held this row back earlier tonight.
//
//   npx tsx --env-file=.env.local scripts/consolidate-cast-2026-08-18.ts --dry
//   npx tsx --env-file=.env.local scripts/consolidate-cast-2026-08-18.ts
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const DRY = process.argv.includes('--dry')
const SOURCE = 'user_verified:cast-consolidate-2026-08-18'

const QUOTE =
  'Coffee Connections: free peer matching, open to anyone who works within a charity or social impact organisation. Design Hops: a free seven-week online training programme. Digital Leads Network: quarterly meetups, an AI Peer Group and AI Learning Hours. GrantAdvisor UK and Open IP for Funders also open. All open programmes offer free support rather than direct funding.'

const CHANGES = [
  {
    id: '86a561b4-8487-44e8-8a20-33f772a5055c',
    title: 'CAST — the surviving row, retitled, retyped and pointed at the programmes page',
    snippet: QUOTE,
    fields: {
      title: 'CAST — Free Digital and AI Support for Charities',
      apply_url: 'https://wearecast.org.uk/our-work/programmes-and-initiatives/',
      funding_type: 'in_kind',
      is_active: true,
      pipeline_state: 'published',
    },
  },
  {
    id: '1335abc5-ad75-43a3-9f29-c500cdf3e06f',
    title: 'CAST Fellowship and Digital Support Programmes — withdrawn',
    snippet:
      'A discovery_queue row whose title names no programme on CAST\'s site. The same organisation is carried by the retitled CAST row pointing at the programmes page.',
    fields: {
      is_active: false,
      pipeline_state: 'rejected',
      rejection_reason:
        'duplicate: third row for CAST, after a roadmap-seed row from 11 March and a discovery_queue row from 11 August. Its title, written by discovery:gemini, names no programme that appears on CAST\'s site. Consolidated into the retitled CAST row. Withdrawn 2026-08-18.',
    },
  },
]

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  let applied = 0
  let refused = 0
  for (const c of CHANGES) {
    console.log(`\n── ${c.title}`)
    if (DRY) { console.log(`   ${JSON.stringify(c.fields)} (dry)`); continue }
    const citations = Object.fromEntries(
      Object.keys(c.fields).map(k => [k, { snippet: c.snippet, confidence: 'high' as const }]),
    )
    const r = await mergeGrantUpdate({ id: c.id, fields: c.fields, source: SOURCE, db, citations })
    console.log(`   applied:  ${JSON.stringify(r.applied)}`)
    applied += r.applied.length
    if (r.rejected?.length) { console.log(`   REJECTED: ${JSON.stringify(r.rejected)}`); refused += r.rejected.length }
  }
  if (!DRY) console.log(`\nfields applied: ${applied}   fields refused: ${refused}`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
