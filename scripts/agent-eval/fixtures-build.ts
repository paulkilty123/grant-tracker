// Resolve the golden set's `pinned_refs` into committed snapshot files via a
// READ-ONLY Supabase SELECT (build-spec: pinned snapshots are refreshed
// deliberately, never implicitly). Best-effort: a ref that doesn't resolve is
// logged and skipped — cases still run on synthetics + pool (GS-01 note).
//
// Usage: npx tsx scripts/agent-eval/fixtures-build.ts
//
// Output: docs/goal-agent/golden-set/fixtures/pinned/<funder>__<title>.json

import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '../..')
const CASES_DIR = path.join(ROOT, 'docs/goal-agent/golden-set/cases')
const PINNED_DIR = path.join(ROOT, 'docs/goal-agent/golden-set/fixtures/pinned')

for (const line of readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

function normalise(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    title: row.title,
    funder: row.funder,
    fundingType: row.funding_type ?? 'grant',
    amountMin: row.amount_min ?? null,
    amountMax: row.amount_max ?? null,
    amountUndisclosed: row.amount_undisclosed ?? false,
    deadline: row.deadline ?? null,
    isRolling: row.is_rolling ?? (row.deadline == null),
    nextOpenDate: row.next_open_date_parsed ?? null,
    openStatus: (row.funder_brief as { open_status?: string } | null)?.open_status ?? null,
    eligibleStructures: row.eligible_structures ?? [],
    minOrgIncome: row.min_org_income ?? null,
    maxOrgIncome: row.max_org_income ?? null,
    locationTag: row.location_tag ?? null,
    isInviteOnly: row.is_invite_only ?? false,
    sectors: row.sectors ?? [],
    impactSectors: row.impact_sectors ?? [],
    beneficiaryGroups: row.target_beneficiaries ?? [],
    funder_brief: row.funder_brief ?? null,
    _snapshot_at: new Date().toISOString().slice(0, 10),
  }
}

async function main() {
  const refs = new Map<string, { title: string; funder: string }>()
  for (const f of readdirSync(CASES_DIR).filter(x => x.endsWith('.json'))) {
    const c = JSON.parse(readFileSync(path.join(CASES_DIR, f), 'utf8'))
    for (const r of (c.fixtures?.pinned_refs ?? [])) refs.set(`${r.funder}::${r.title}`, r)
  }
  mkdirSync(PINNED_DIR, { recursive: true })
  console.log(`Resolving ${refs.size} pinned refs (read-only)…\n`)

  let ok = 0, miss = 0
  for (const r of Array.from(refs.values())) {
    const { data } = await supabase
      .from('grants_with_funder')
      .select('*')
      .ilike('title', `%${r.title}%`)
      .ilike('funder', `%${r.funder}%`)
      .limit(1)
    const row = data?.[0]
    const file = path.join(PINNED_DIR, `${slug(r.funder)}__${slug(r.title)}.json`)
    if (row) {
      writeFileSync(file, JSON.stringify(normalise(row as Record<string, unknown>), null, 2))
      console.log(`  ✓ ${r.funder} :: ${r.title}`)
      ok++
    } else {
      console.log(`  · MISS ${r.funder} :: ${r.title}  (case runs on synthetics + pool)`)
      miss++
    }
  }
  console.log(`\nResolved ${ok}/${refs.size} pinned refs → ${path.relative(ROOT, PINNED_DIR)} (${miss} missing, non-fatal).`)
}

main().catch(e => { console.error('fixtures-build failed:', e.message); process.exit(1) })
