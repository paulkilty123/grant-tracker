// Read-only audit of the Institute of Imagination test org before the
// ground-truth run: the matching-gating profile fields + goal/pipeline state.
//   npx tsx --env-file=.env.local scripts/agent-eval/ioi-profile-audit.ts

import { readFileSync } from 'fs'
import { resolve } from 'path'
try {
  for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/); if (!m) continue
    let v = m[2].trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!(m[1] in process.env)) process.env[m[1]] = v
  }
} catch { /* rely on --env-file */ }

const ORG_ID = 'f1f9c904-ef5a-4591-8c6d-e7d9a1535133'

async function main() {
  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

  const { data: org } = await sb.from('organisations').select('*').eq('id', ORG_ID).maybeSingle()
  if (!org) { console.log('org not found'); return }
  const o = org as Record<string, unknown>

  const FIELDS = [
    'name', 'legal_structure', 'org_type', 'annual_income_band', 'primary_location', 'geographic_reach',
    'impact_sectors', 'beneficiary_groups', 'themes', 'niche_tags', 'excluded_niche_tags',
    'funding_type_preferences', 'years_trading', 'years_operating', 'org_stage',
    'min_grant_target', 'max_grant_target', 'company_number', 'charity_number', 'website', 'mission',
  ]
  console.log('=== Institute of Imagination — profile ===')
  for (const f of FIELDS) {
    const v = o[f]
    const show = v == null ? '⟨NULL⟩' : Array.isArray(v) ? `[${(v as unknown[]).join(', ')}]` : String(v)
    console.log(`  ${f.padEnd(26)} ${show}`)
  }

  const { data: goals } = await sb.from('goals').select('id, status, title, target_amount, created_at').eq('org_id', ORG_ID)
  const { count: pipeCount } = await sb.from('pipeline_items').select('id', { count: 'exact', head: true }).eq('org_id', ORG_ID)
  const { count: interCount } = await sb.from('grant_interactions').select('id', { count: 'exact', head: true }).eq('org_id', ORG_ID)
  const { count: threadCount } = await sb.from('agent_threads').select('id', { count: 'exact', head: true }).eq('org_id', ORG_ID)
  const { count: runCount } = await sb.from('agent_runs').select('id', { count: 'exact', head: true }).eq('org_id', ORG_ID)

  console.log('\n=== state (expect profile-only) ===')
  console.log(`  goals: ${(goals ?? []).length}  ${(goals ?? []).map(g => `[${(g as Record<string,unknown>).status} ${(g as Record<string,unknown>).title}]`).join(' ')}`)
  console.log(`  pipeline_items: ${pipeCount ?? 0}`)
  console.log(`  grant_interactions: ${interCount ?? 0}`)
  console.log(`  agent_threads: ${threadCount ?? 0}`)
  console.log(`  agent_runs: ${runCount ?? 0}`)
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
