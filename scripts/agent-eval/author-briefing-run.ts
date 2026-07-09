// One-off: generate the briefing v2 guidance layer (author.ts) over a REAL
// org's current state, so the authored "My read" + agenda can be reviewed and
// wordsmithed before it becomes the default voice (Paul's quality gate).
//
//   npx tsx --env-file=.env.local scripts/agent-eval/author-briefing-run.ts "Common Ground"
//
// Loads the pack through the SAME repository loaders get_briefing uses, builds
// the SAME deterministic moves BriefingView shows, then runs authorBriefing.
// Read-only: no writes, no flag changes. Prints usage + number-lint status.

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

const rule = (t: string) => console.log(`\n${'─'.repeat(78)}\n${t}\n${'─'.repeat(78)}`)

async function main() {
  const nameQuery = process.argv[2] ?? 'Common Ground'
  const { createClient } = await import('@supabase/supabase-js')
  const repo = await import('../../src/lib/agent/tools/repository')
  const { assembleBriefingPack } = await import('../../src/lib/agent/context')
  const { buildConsiderations } = await import('../../src/lib/agent/considerations')
  const { authorBriefing, availableMoves, lintNumbers } = await import('../../src/lib/agent/author')
  const { estimateCostMicroGbp } = await import('../../src/lib/agent/llm')

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: orgRow, error } = await sb.from('organisations').select('id, name').ilike('name', `%${nameQuery}%`).limit(1).maybeSingle()
  if (error || !orgRow) throw new Error(`org not found for "${nameQuery}": ${error?.message ?? 'no match'}`)
  const orgId = (orgRow as { id: string; name: string }).id
  console.log(`Org: ${(orgRow as { name: string }).name}  (${orgId})`)

  const [goal, pipeline, org] = await Promise.all([repo.getGoal(orgId), repo.getPipeline(orgId), repo.getOrg(orgId)])
  if (!goal) throw new Error('org has no active goal — nothing to author')
  if (!org) throw new Error('org not found')
  const [orgFacts, catalogue, recentWin] = await Promise.all([repo.getOrgFacts(orgId), repo.getActiveCatalogue(), repo.hasRecentWin(orgId)])

  const asOf = new Date().toISOString().slice(0, 10)
  const pack = assembleBriefingPack({ org, goal, pipeline, orgFacts, catalogue, asOf, userTurn: null })
  const a = pack.arithmetic

  const considerations = buildConsiderations({
    asOf,
    goalEndDate: goal.end_date,
    mixTarget: a.mixTarget,
    arithmetic: { gap: a.gap, inPipelineWeighted: a.inPipelineWeighted, target: a.target || 1 },
    pipelineItems: pipeline.map((p, i) => ({ pipeline_item_id: String(i), grant_name: p.grant_name, stage: p.stage, amount_requested: p.amount_requested, deadline: p.deadline })),
    recentWin,
  })
  const moves = availableMoves(pack.candidates, considerations)

  rule('DETERMINISTIC INPUTS (what the reasoner is given)')
  console.log(`goal: ${goal.title} — target £${goal.target_amount.toLocaleString('en-GB')} by ${goal.end_date}`)
  console.log(`gap £${a.gap.toLocaleString('en-GB')} · secured £${a.secured.toLocaleString('en-GB')} · weighted £${a.inPipelineWeighted.toLocaleString('en-GB')} · needed £${a.requiredRunRateMonthly.toLocaleString('en-GB')}/mo · ${a.monthsRemaining} months`)
  console.log(`mix target: ${a.mixTarget ? Object.entries(a.mixTarget).map(([k, v]) => `${k} ${v}%`).join(', ') : 'none'}`)
  console.log(`coverage: ${pack.coverage.thin ? 'THIN — ' + pack.coverage.note : 'adequate'}`)
  console.log(`available moves (${moves.length}):`)
  for (const m of moves) console.log(`  • ${m.ref}: ${m.headline} — ${m.detail}`)

  rule('GENERATING (author.ts → Sonnet 4.6)…')
  const t0 = Date.now()
  const out = await authorBriefing(pack, moves)
  const ms = Date.now() - t0

  rule('MY READ')
  console.log(out.my_read)

  rule('THIS WEEK, IN ORDER')
  out.agenda.forEach((item, i) => {
    console.log(`${i + 1}. ${item.title}   [${item.ref}]`)
    console.log(`   ${item.reason}`)
  })

  rule('GENERATION FACTS')
  const u = out.usage
  console.log(`model: ${out.model}`)
  console.log(`tokens: ${u.inputTokens} in / ${u.outputTokens} out`)
  console.log(`cost (uncached est): £${(estimateCostMicroGbp(u.model, u.inputTokens, u.outputTokens) / 1e6).toFixed(4)}`)
  console.log(`latency: ${(ms / 1000).toFixed(1)}s`)
  console.log(`number lint: ${out.numberLintPassed ? 'PASS' : 'FAIL (would fall back to deterministic templates)'}`)
  const offenders = lintNumbers([out.my_read, ...out.agenda.map(x => x.reason)].join('\n'), pack)
  if (offenders.length) console.log(`  offending figures: ${offenders.join(', ')}`)
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
