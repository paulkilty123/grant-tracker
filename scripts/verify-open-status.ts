// Run the verification engine over specific rows and report evidence with quotes.
//
//   npx tsx scripts/verify-open-status.ts <uuid> [<uuid> ...]
//   npx tsx scripts/verify-open-status.ts --stamp <uuid> [<uuid> ...]
//
// Without --stamp this is read-only: it prints a VerifyResult per row and
// writes nothing. Used to answer "is this fund actually open?" with a quote
// rather than an inference.
//
// With --stamp it also writes field_evidence — the record of what the page said
// about each field, including the cases where the page said nothing. It writes
// NO VALUES: a proposal is still a proposal and still needs a human or the
// engine route to apply it. Stamping is safe to run on a live row because it
// cannot change anything a user sees.

import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyRow, type VerifyRow } from '../src/lib/verification/verify-row'
import { buildEvidencePatch, recordFieldEvidence } from '../src/lib/field-evidence'

const HERE = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(resolve(HERE, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '')
}

/** Bump when the engine's extraction changes in a way that invalidates old stamps. */
const VERIFIER = 'verify:v1'

async function main() {
  const args  = process.argv.slice(2)
  const stamp = args.includes('--stamp')
  const ids   = args.filter(a => !a.startsWith('--'))
  if (ids.length === 0) {
    console.error('usage: npx tsx scripts/verify-open-status.ts [--stamp] <uuid> [<uuid> ...]')
    process.exit(1)
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const { data, error } = await db
    .from('scraped_grants')
    .select('id, title, funder, funding_type, apply_url, deadline, deadline_cycle, is_rolling, max_org_income, min_org_income, is_invite_only, eligible_structures, location_tag, funder_brief')
    .in('id', ids)
  if (error) throw new Error(`fetch rows: ${error.message}`)
  if (!data?.length) throw new Error('no rows returned for those ids')

  const out: unknown[] = []
  for (const row of data as VerifyRow[]) {
    process.stderr.write(`\n── ${row.title}\n   ${row.apply_url ?? '(no url)'}\n`)
    const r = await verifyRow(row, anthropic)
    const gate = r.gate.pass ? 'pass' : `FAIL ${(r.gate as { failure: string }).failure}`
    process.stderr.write(`   outcome: ${r.outcome}   gate: ${gate}\n`)

    if (stamp) {
      const { patch, unquoted } = buildEvidencePatch(r.evidence, { by: VERIFIER })
      if (unquoted.length > 0) {
        // Reported, never silent: a verdict offered without a quote is a bug in
        // the extractor, and it is downgraded to "page said nothing" rather than
        // stored as a finding.
        process.stderr.write(`   downgraded, no quote found on the page: ${unquoted.join(', ')}\n`)
      }
      if (Object.keys(patch).length === 0) {
        process.stderr.write('   no evidence to stamp (the gate never reached the facts)\n')
      } else {
        const { stamped } = await recordFieldEvidence({ id: row.id, patch, db })
        const shape = stamped
          .map(f => `${f}=${patch[f].agrees === null ? 'silent' : patch[f].agrees ? 'agrees' : 'CONTRADICTS'}`)
          .join(' ')
        process.stderr.write(`   stamped: ${shape}\n`)
      }
    }

    out.push(r)
  }
  console.log(JSON.stringify(out, null, 2))
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
