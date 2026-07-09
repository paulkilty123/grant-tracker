// Per-org briefing-guidance cost, from the meter (agent_runs, trigger='briefing').
// This is condition 3: the estimate becomes a measurement. Run after a week of
// real usage to replace the ~£0.30/org/month estimate with the actual number.
//
//   npx tsx --env-file=.env.local scripts/agent-eval/briefing-cost-report.ts [days=7]

import { readFileSync } from 'fs'
import { resolve } from 'path'
try {
  for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!(m[1] in process.env)) process.env[m[1]] = v
  }
} catch { /* rely on --env-file */ }

async function main() {
  const days = Number(process.argv[2] ?? 7)
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

  const { data } = await sb.from('agent_runs')
    .select('org_id, status, input_tokens, output_tokens, cost_estimate_microgbp, created_at')
    .eq('trigger', 'briefing').gte('created_at', since).limit(50000)
  const rows = (data ?? []) as Array<{ org_id: string; status: string; input_tokens: number | null; output_tokens: number | null; cost_estimate_microgbp: number | null }>

  const { data: orgs } = await sb.from('organisations').select('id, name')
  const nameOf = new Map((orgs ?? []).map((o: { id: string; name: string }) => [o.id, o.name]))

  const perOrg = new Map<string, { gens: number; blocked: number; inTok: number; outTok: number; micro: number }>()
  for (const r of rows) {
    const e = perOrg.get(r.org_id) ?? { gens: 0, blocked: 0, inTok: 0, outTok: 0, micro: 0 }
    e.gens += 1
    if (r.status !== 'complete') e.blocked += 1
    e.inTok += r.input_tokens ?? 0
    e.outTok += r.output_tokens ?? 0
    e.micro += r.cost_estimate_microgbp ?? 0
    perOrg.set(r.org_id, e)
  }

  console.log(`Briefing guidance cost — last ${days} days (since ${since.slice(0, 10)})\n`)
  if (perOrg.size === 0) { console.log('No generations yet.'); return }
  let totalMicro = 0, totalGens = 0
  const sorted = Array.from(perOrg.entries()).sort((a, b) => b[1].micro - a[1].micro)
  for (const [orgId, e] of sorted) {
    totalMicro += e.micro; totalGens += e.gens
    const perMonth = (e.micro / 1e6) / days * 30
    console.log(`${(nameOf.get(orgId) ?? orgId).slice(0, 34).padEnd(34)}  ${String(e.gens).padStart(3)} gen${e.blocked ? ` (${e.blocked} blocked)` : ''}  £${(e.micro / 1e6).toFixed(4)}  →  £${perMonth.toFixed(2)}/mo projected`)
  }
  console.log(`\nTotals: ${totalGens} generations across ${perOrg.size} orgs, £${(totalMicro / 1e6).toFixed(4)} over ${days} days`)
  console.log(`Mean per active org: £${((totalMicro / 1e6) / perOrg.size / days * 30).toFixed(2)}/month (estimate was ~£0.30)`)
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
