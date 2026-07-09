// Faithful profile mirror for the IoI ground-truth run: copy the matching +
// descriptive profile from Devi's real IoI (SOURCE) onto the test IoI (TARGET),
// nulls included. Copies ONLY the allowlisted profile fields — never pipeline,
// goals, interactions, identity (id/owner/name), entitlement flags, or
// registration numbers. The target stays profile-only (0 goals, 0 pipeline).
//   npx tsx --env-file=.env.local scripts/agent-eval/mirror-ioi-profile.ts

import { readFileSync } from 'fs'
import { resolve } from 'path'
try {
  for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/); if (!m) continue
    let v = m[2].trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!(m[1] in process.env)) process.env[m[1]] = v
  }
} catch { /* rely on --env-file */ }

const SOURCE = '7c89f4ff' // Devi's real IoI (matched by prefix below)
const TARGET = 'f1f9c904-ef5a-4591-8c6d-e7d9a1535133' // test IoI (TEST_OWNER)

// Matching + descriptive profile only. Deliberately excludes id, owner_id, name,
// created_at, entitlement flags, and registration/identity metadata.
const MIRROR_FIELDS = [
  'legal_structure', 'org_type', 'annual_income_band', 'primary_location', 'geographic_reach',
  'impact_sectors', 'beneficiary_groups', 'themes', 'niche_tags', 'excluded_niche_tags',
  'funding_type_preferences', 'years_trading', 'years_operating', 'org_stage',
  'min_grant_target', 'max_grant_target', 'mission',
]

async function main() {
  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

  const { data: srcRows } = await sb.from('organisations').select('*').ilike('name', '%institute of imagination%')
  const src = (srcRows ?? []).find(r => (r as { id: string }).id !== TARGET && String((r as { id: string }).id).startsWith(SOURCE)) as Record<string, unknown> | undefined
  if (!src) { console.log('source org not found'); return }
  console.log(`SOURCE: ${src.name} [${String(src.id).slice(0, 8)}] owner ${String(src.owner_id).slice(0, 8)}`)

  // Safety: never proceed if the target already has a goal or pipeline (would
  // mean the mirror is corrupting an in-progress run).
  const { count: gc } = await sb.from('goals').select('id', { count: 'exact', head: true }).eq('org_id', TARGET)
  const { count: pc } = await sb.from('pipeline_items').select('id', { count: 'exact', head: true }).eq('org_id', TARGET)
  if ((gc ?? 0) > 0 || (pc ?? 0) > 0) { console.log(`ABORT: target has ${gc} goals / ${pc} pipeline items — not profile-only.`); return }

  const update: Record<string, unknown> = {}
  for (const f of MIRROR_FIELDS) update[f] = src[f] ?? null
  console.log('\nApplying to TARGET (test IoI):')
  for (const f of MIRROR_FIELDS) console.log(`  ${f.padEnd(26)} ${update[f] == null ? '⟨NULL⟩' : JSON.stringify(update[f])}`)

  const { error } = await sb.from('organisations').update(update).eq('id', TARGET)
  if (error) { console.log('UPDATE FAILED:', error.message); return }

  // Re-audit
  const { data: after } = await sb.from('organisations').select('*').eq('id', TARGET).maybeSingle()
  const a = after as Record<string, unknown>
  const { count: gc2 } = await sb.from('goals').select('id', { count: 'exact', head: true }).eq('org_id', TARGET)
  const { count: pc2 } = await sb.from('pipeline_items').select('id', { count: 'exact', head: true }).eq('org_id', TARGET)
  console.log('\n=== TARGET after mirror ===')
  console.log(`  name: ${a.name} | legal: ${a.legal_structure} | income: ${a.annual_income_band} | loc: ${a.primary_location} | reach: ${a.geographic_reach}`)
  console.log(`  sectors: ${JSON.stringify(a.impact_sectors)} | beneficiaries: ${JSON.stringify(a.beneficiary_groups)} | niche: ${JSON.stringify(a.niche_tags)}`)
  console.log(`  years_trading: ${a.years_trading} | years_operating: ${a.years_operating} | org_stage: ${a.org_stage} | grant: ${a.min_grant_target}-${a.max_grant_target}`)
  console.log(`  state: goals ${gc2} | pipeline ${pc2}  (must be 0 / 0)`)
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
