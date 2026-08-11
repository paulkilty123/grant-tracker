// Run the verification engine over specific rows and report evidence with quotes.
//
//   npx tsx scripts/verify-open-status.ts <uuid> [<uuid> ...]
//
// Read-only: prints a VerifyResult per row and writes nothing to the database.
// Used to answer "is this fund actually open?" with a quote rather than an
// inference, for rows whose enrichment returned open_status = 'unknown'.

import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { verifyRow, type VerifyRow } from '../src/lib/verification/verify-row'

async function main() {
  const ids = process.argv.slice(2)
  if (ids.length === 0) {
    console.error('usage: npx tsx scripts/verify-open-status.ts <uuid> [<uuid> ...]')
    process.exit(1)
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const { data, error } = await db
    .from('scraped_grants')
    .select('id, title, funder, funding_type, apply_url, deadline, is_rolling, max_org_income, is_invite_only')
    .in('id', ids)
  if (error) throw new Error(`fetch rows: ${error.message}`)
  if (!data?.length) throw new Error('no rows returned for those ids')

  const out: unknown[] = []
  for (const row of data as VerifyRow[]) {
    process.stderr.write(`\n── ${row.title}\n   ${row.apply_url ?? '(no url)'}\n`)
    const r = await verifyRow(row, anthropic)
    const gate = r.gate.pass ? 'pass' : `FAIL ${(r.gate as { failure: string }).failure}`
    process.stderr.write(`   outcome: ${r.outcome}   gate: ${gate}\n`)
    out.push(r)
  }
  console.log(JSON.stringify(out, null, 2))
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
