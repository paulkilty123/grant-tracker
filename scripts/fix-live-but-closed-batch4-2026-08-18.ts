// Last of the 27, and two of them are not "closed" at all.
//
// Greggs Community Action Fund is OPEN until 28 August, and our deadline was
// right. What was wrong is who can apply: the row is tagged UK-wide, and this
// round accepts only Glasgow (Nitshill G53) and South Tyneside. A charity
// anywhere else matches the row, reads a real deadline ten days out, and wastes
// an application. That is a worse outcome than a closed fund, because the row
// looks perfect right up until the rejection.
//
//   npx tsx --env-file=.env.local scripts/fix-live-but-closed-batch4-2026-08-18.ts --dry
//   npx tsx --env-file=.env.local scripts/fix-live-but-closed-batch4-2026-08-18.ts
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const DRY = process.argv.includes('--dry')
const SOURCE = 'user_verified:live-but-closed-2026-08-18'

const GREGGS = 'cfb56fe7-0ddb-4ac4-ab6f-c04102b8009d'
const SIMPSON = '3e4a8e53-aac0-4a78-9d87-dd90600bdedf'
const EECF = '0d90187a-15da-4625-8739-34ae7134aecd'
const SSE_TFG = '8b5c4025-318d-4354-a766-228b361ffba3'

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  let applied = 0
  let refused = 0
  const run = async (id8: string, label: string, fields: Record<string, unknown>, snippet: string) => {
    // NOT `ilike` — `id` is a uuid column and a pattern match against it returns
    // nothing rather than erroring, so the first run of this script reported four
    // NOT FOUNDs for rows that all exist. Equality on the full id.
    const { data } = await db.from('scraped_grants').select('id, funder_brief').eq('id', id8).limit(1)
    const row = data?.[0]
    console.log(`\n── ${label}`)
    if (!row?.id) { console.log('   NOT FOUND'); return }
    if (DRY) { console.log(`   ${JSON.stringify(fields).slice(0, 150)} (dry)`); return }
    const citations = Object.fromEntries(
      Object.keys(fields).map(k => [k, { snippet, confidence: 'high' as const }]),
    )
    const r = await mergeGrantUpdate({ id: row.id, fields, source: SOURCE, db, citations })
    console.log(`   applied:  ${JSON.stringify(r.applied)}`)
    applied += r.applied.length
    if (r.rejected?.length) { console.log(`   REFUSED:  ${JSON.stringify(r.rejected)}`); refused += r.rejected.length }
  }

  // Greggs: open, and the eligibility is the thing that was wrong.
  const { data: gr } = await db.from('scraped_grants').select('funder_brief').eq('id', GREGGS).limit(1)
  const gBrief = { ...((gr?.[0]?.funder_brief ?? {}) as Record<string, unknown>) }
  gBrief.geographic_focus =
    'Restricted to areas that change every round, not UK-wide in practice. The round open until 28 August 2026 '
    + 'accepts applications ONLY from organisations based in Glasgow (Nitshill, G53) and South Tyneside. '
    + 'Check the current round\'s areas before applying; a fit on everything else does not make an organisation eligible.'
  await run(
    GREGGS,
    'Greggs Community Action Fund — open, but only two areas qualify this round',
    { location_tag: 'UK', is_local: true, funder_brief: gBrief },
    'The Community Action Fund is currently open for applications until 28th August at 12 noon. Applications are only accepted from organisations based in the two currently eligible locations: Glasgow (Nitshill G53) and South Tyneside.',
  )

  await run(
    SIMPSON,
    'Suffolk David & Jill Simpson Fund — opens Spring 2027',
    {
      is_active: false,
      pipeline_state: 'between_rounds_scheduled',
      next_open_date: 'Grant opens Spring 2027',
      next_open_date_parsed: '2027-03-01',
    },
    'Grant opens: Spring 2027. Apply here (now closed). Maximum grant available £5,000.',
  )

  await run(
    SSE_TFG,
    'SSE Trading for Good: Community Business — applications reopen Spring 2027',
    {
      is_active: false,
      pipeline_state: 'between_rounds_scheduled',
      next_open_date: 'Applications open again Spring 2027',
      next_open_date_parsed: '2027-03-01',
    },
    'Applications closed — Applications will open again in Spring 2027. The programme runs 1 October 2027 to 31 October 2028; register interest to be notified when recruitment opens.',
  )

  await run(
    EECF,
    'East End Community Foundation — a borough hub, not a named fund',
    { title: 'East End Community Foundation — Grants' },
    'We distribute grants to voluntary and community sector organisations across the East End. As we run different grants programmes in different boroughs, please click below on the borough where you operate to find out which programmes are available. No programme called Well-being Grants for Young People appears on the page.',
  )

  if (!DRY) console.log(`\nfields applied: ${applied}   fields refused: ${refused}`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
