// Run the production enricher over the desk-research batch.
//
//   npx tsx scripts/enrich-research-batch.ts            # dry run: show the gap
//   npx tsx scripts/enrich-research-batch.ts --apply
//
// The 27 rows staged from desk research carry a hand-written funder_brief with
// THREE fields — who_can_apply, what_they_fund, source. An AI-enriched row
// carries FOURTEEN, including priorities, typical_award, exclusions and
// decision_timeline. The dashboard's "Grant insights" panel reads those, so
// without this the panel is close to empty on every one of them.
//
// This is why the batch was staged at `system:` trust (50) rather than `admin:`
// (100) — deliberately BELOW ai_enrich (60), so the enricher can write over the
// desk research rather than being permanently blocked by it. Staging at admin
// trust would have locked in the thin version forever.
//
// Calls the deployed route rather than re-implementing it: same code path the
// admin UI uses, so the output is identical to a hand-triggered enrich.
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const HERE = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(resolve(HERE, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

// www, not the apex: curl -L strips the Authorization header across an
// apex -> www redirect, so a bearer call to the apex silently arrives anonymous.
const BASE = 'https://www.granttracker.co.uk'

async function main() {
  const apply = process.argv.includes('--apply')
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

  const { data } = await db.from('scraped_grants')
    .select('id, funder, title, apply_url, funder_brief')
    .eq('source', 'research_batch').order('funder')
  const rows = (data ?? []) as { id: string; funder: string | null; title: string; apply_url: string | null; funder_brief: Record<string, unknown> | null }[]

  console.log(`\n${rows.length} rows in the research batch`)
  const fieldCount = (b: Record<string, unknown> | null) => b ? Object.keys(b).length : 0
  console.log(`brief fields now: min ${Math.min(...rows.map(r => fieldCount(r.funder_brief)))}, max ${Math.max(...rows.map(r => fieldCount(r.funder_brief)))}\n`)

  if (!apply) { console.log('DRY RUN — re-run with --apply to enrich.\n'); return }

  let ok = 0, failed = 0, rejected = 0
  for (const r of rows) {
    try {
      const res = await fetch(`${BASE}/api/admin/enrich-grant`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.ADMIN_SECRET}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ grantId: r.id }),
        signal: AbortSignal.timeout(120_000),
      })
      const j = await res.json().catch(() => ({})) as { rejected?: string[]; error?: string }
      if (!res.ok) { failed++; console.log(`  FAIL ${r.funder}: HTTP ${res.status} ${j.error ?? ''}`.slice(0, 120)); continue }
      // A non-empty `rejected` array means the trust ladder refused the write —
      // silently showing enriched content that never saved is the exact failure
      // the urls page had to be fixed for.
      if (j.rejected?.length) { rejected++; console.log(`  REJECTED ${r.funder}: ${j.rejected.join(', ')}`) }
      else { ok++; console.log(`  ok   ${r.funder} — ${r.title.slice(0, 46)}`) }
    } catch (e) { failed++; console.log(`  FAIL ${r.funder}: ${(e as Error).message.slice(0, 70)}`) }
  }
  console.log(`\nenriched ${ok}, rejected by trust ladder ${rejected}, failed ${failed}\n`)
}
main().catch(e => { console.error(e); process.exit(1) })
