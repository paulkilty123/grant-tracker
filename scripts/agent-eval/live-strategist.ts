// Live strategist end-to-end — the first real strategist opening.
//
// Drives the tool layer against the REAL goals table + REAL catalogue
// (grants_with_funder → computeMatchScore + runEligibilityChecks), on a
// dedicated throwaway "cohort-shaped" org that is cascade-deleted in `finally`.
// No real cohort member's data is touched.
//
//   npx tsx --env-file=.env.local scripts/agent-eval/live-strategist.ts
//
// Sequence: create test org → get_briefing (no goal → onboarding) →
// add_to_pipeline ×3 (incl. one 'won') → set_funding_goal (secured derives from
// 'won') → get_funding_goal → get_plan_state → get_briefing (full pack) → CLEANUP.

import { readFileSync } from 'fs'
import { resolve } from 'path'

// Load .env.local into process.env for keys not already set (belt-and-braces
// alongside --env-file). The tool layer reads env lazily inside svc(), so this
// running before the dynamic import below is sufficient.
try {
  for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!(m[1] in process.env)) process.env[m[1]] = v
  }
} catch { /* no .env.local — rely on --env-file / ambient env */ }

const j = (x: unknown) => JSON.stringify(x, null, 2)
const rule = (t: string) => console.log(`\n${'─'.repeat(78)}\n${t}\n${'─'.repeat(78)}`)

async function main() {
  const { createClient } = await import('@supabase/supabase-js')
  const tools = await import('../../src/lib/agent/tools')
  const repo = await import('../../src/lib/agent/tools/repository')
  const { assembleBriefingPack } = await import('../../src/lib/agent/context')
  const { setFundingGoal, getFundingGoal, addToPipeline, getPlanState, getBriefing } = tools
  type Ctx = import('../../src/lib/agent/tools/types').ToolContext

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

  // Reuse an existing auth user just to satisfy owner_id's NOT NULL FK; the row
  // is deleted at the end, so this owner never actually sees the org.
  const { data: anyOrg, error: ownerErr } = await sb.from('organisations').select('owner_id').limit(1).single()
  if (ownerErr || !anyOrg) throw new Error(`could not read an owner_id: ${ownerErr?.message}`)
  const ownerId = (anyOrg as { owner_id: string }).owner_id

  // A cohort-shaped registered charity (mental-health / youth), modelled on a
  // real cohort profile so it draws genuine catalogue matches.
  const orgRow = {
    name: 'ZZ Goal-Agent E2E (delete me)',
    owner_id: ownerId,
    org_type: 'registered_charity',
    legal_structure: 'registered_charity',
    annual_income_band: '£100,000–£250,000',
    primary_location: 'UK-wide',
    geographic_reach: 'regional',
    impact_sectors: ['mental_health', 'education', 'young_people'],
    beneficiary_groups: ['young_people', 'children', 'families'],
    funding_type_preferences: ['grant', 'investment', 'in_kind'],
    min_grant_target: 5000,
    max_grant_target: 100000,
    years_trading: 5,
  }
  const { data: created, error: orgErr } = await sb.from('organisations').insert(orgRow).select('id').single()
  if (orgErr || !created) throw new Error(`test org insert failed: ${orgErr?.message}`)
  const orgId = (created as { id: string }).id

  const ctx: Ctx = { orgId, surface: 'app', tier: 'companion', userId: ownerId }
  console.log(`Test org: ${orgId}  (owner ${ownerId})  — cohort-shaped, will be deleted`)

  try {
    // ── A. get_briefing with NO goal → live onboarding (degraded, not error) ──
    rule('A. get_briefing — no goal yet (degraded onboarding, live)')
    console.log(j((await getBriefing(ctx, {})).data))

    // ── B. add_to_pipeline ×3 (one 'won' so secured derives) ─────────────────
    rule('B. add_to_pipeline ×3 (via the write tool)')
    const items = [
      { grant_name: 'Youth Mental Health Fund', funder_name: 'Wellbeing Trust', stage: 'won' as const, amount_requested: 40000 },
      { grant_name: 'Community Resilience Grant', funder_name: 'Resilience Foundation', stage: 'applying' as const, amount_requested: 30000 },
      { grant_name: 'Small Grants for Young People', funder_name: 'Youth Futures', stage: 'identified' as const, amount_requested: 10000 },
    ]
    for (const it of items) {
      const r = await addToPipeline(ctx, it)
      console.log(`  + ${it.grant_name}  [${r.data.stage}]  £${it.amount_requested.toLocaleString()}  → ${r.data.id}`)
    }

    // ── C. set_funding_goal (secured derives from the 'won' £40k) ────────────
    rule('C. set_funding_goal — target £250k, 2026, mix 70/20/10')
    const setRes = await setFundingGoal(ctx, {
      title: '2026 income target',
      target_amount: 250000,
      start_date: '2026-01-01',
      end_date: '2026-12-31',
      mix_targets: { grant: 70, contract: 20, corporate: 10 },
      constraints: [{ kind: 'sector', text: 'no gambling, tobacco or arms funding' }],
    })
    console.log(j(setRes))

    // ── D. get_funding_goal — read tool, secured now visible ─────────────────
    rule('D. get_funding_goal (read tool)')
    console.log(j(await getFundingGoal(ctx, {})))

    // ── E. get_plan_state — deterministic arithmetic ─────────────────────────
    rule('E. get_plan_state (arithmetic)')
    console.log(j((await getPlanState(ctx, {})).data))

    // ── F. get_briefing — FULL, goal now set ─────────────────────────────────
    rule('F. get_briefing — full payload (the strategist opening)')
    const briefing = await getBriefing(ctx, {})
    console.log(j(briefing))

    // ── F2. The underlying BriefingPack in full (what the reasoner is given) ──
    rule('F2. Assembled BriefingPack — full world (candidates · rule-outs · digest)')
    const [goal, pipeline, org] = await Promise.all([repo.getGoal(orgId), repo.getPipeline(orgId), repo.getOrg(orgId)])
    const [orgFacts, catalogue] = await Promise.all([repo.getOrgFacts(orgId), repo.getActiveCatalogue()])
    const asOf = new Date().toISOString().slice(0, 10)
    const pack = assembleBriefingPack({ org: org!, goal: goal!, pipeline, orgFacts, catalogue, asOf, userTurn: null })
    console.log(`catalogue scored: ${catalogue.length} active rows`)
    console.log(`candidates (eligible/near): ${pack.candidates.length}   ruled out: ${pack.digest.excluded.count}   coverage.thin: ${pack.coverage.thin}`)
    console.log(`\narithmetic:\n${j(pack.arithmetic)}`)
    console.log(`\ntop candidates:`)
    for (const c of pack.candidates.slice(0, 10)) {
      console.log(`  • ${c.title} — ${c.funder} [${c.fundingType}] elig=${c.eligibility.status}` +
        (c.amountMax ? `  up to £${c.amountMax.toLocaleString()}` : '') +
        (c.matchReasons?.length ? `\n      ${c.matchReasons.slice(0, 3).join(' · ')}` : ''))
    }
    console.log(`\nrule-out annex (excluded by an engine BLOCKER / org_fact):`)
    for (const ro of pack.ruleOutAnnex.slice(0, 8)) console.log(`  ✗ ${ro.title} — ${ro.funder}  [${ro.reason_code} / ${ro.source}]`)
    console.log(`\nexcluded byReason:\n${j(pack.digest.excluded.byReason)}`)
    console.log(`\ncoverage:\n${j(pack.coverage)}`)
  } finally {
    // ── CLEANUP — hard-delete the test org and everything under it ───────────
    rule('CLEANUP')
    await sb.from('events').delete().eq('org_id', orgId)
    await sb.from('pipeline_items').delete().eq('org_id', orgId)
    await sb.from('goals').delete().eq('org_id', orgId)
    const { error: delErr } = await sb.from('organisations').delete().eq('id', orgId)
    const left = await Promise.all([
      sb.from('goals').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
      sb.from('pipeline_items').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
      sb.from('organisations').select('id', { count: 'exact', head: true }).eq('id', orgId),
    ])
    console.log(`org delete err: ${delErr?.message ?? 'none'}`)
    console.log(`residual — goals:${left[0].count ?? '?'}  pipeline:${left[1].count ?? '?'}  org:${left[2].count ?? '?'}`)
    console.log(left.every(r => (r.count ?? 0) === 0) ? '✓ CLEANUP OK — nothing left behind' : '✗ CLEANUP INCOMPLETE — inspect manually')
  }
}

main().then(() => process.exit(0)).catch(e => { console.error('\nFATAL:', e); process.exit(1) })
