// Proves the tool envelope end to end without any DB write: a defineTool'd tool
// with a fake handler + captured event log, exercised for every envelope layer.
//   npx tsx scripts/agent-eval/tools-smoke.ts

import { defineTool } from '../../src/lib/agent/tools/envelope'
import { EntitlementError, AuthorshipError, type ToolContext } from '../../src/lib/agent/tools/types'
import { buildPlanState, buildBriefingOnboarding } from '../../src/lib/agent/tools/plan'
import type { GoalInput, PipelineEntry } from '../../src/lib/agent/types'
import type { Organisation } from '@/types'

const captured: Array<{ surface: string; orgId: string; itemId: string }> = []

// A stand-in for add_to_pipeline: fake handler (org from ctx), fake event log.
const tool = defineTool<Record<string, unknown>, { id: string; org_id: string }>({
  name: 'add_to_pipeline',
  handler: async (ctx, _p) => ({ id: 'item-1', org_id: ctx.orgId }),
  logEvent: async (ctx, _p, r) => { captured.push({ surface: ctx.surface, orgId: ctx.orgId, itemId: r.id }) },
  provenance: (_ctx, r) => ({ id: { value: r.id, source: 'agent', verified_at: null } }),
})

const ctx = (over: Partial<ToolContext>): ToolContext => ({ orgId: 'org-A', surface: 'app', tier: 'apply', ...over })

async function main() {
  let pass = 0, fail = 0
  const check = (name: string, cond: boolean) => { if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}`) } }

  // 1. Entitlement — free tier is denied; the check runs before anything else.
  try { await tool(ctx({ tier: 'free' }), { grant_name: 'X' }); check('free tier denied', false) }
  catch (e) { check('free tier denied (EntitlementError)', e instanceof EntitlementError) }

  // 2. Authorship — a content-shaped field name is rejected.
  try { await tool(ctx({}), { grant_name: 'X', answer: 'ghost-written draft' }); check('content field rejected', false) }
  catch (e) { check('content field rejected (AuthorshipError)', e instanceof AuthorshipError) }

  // 3. Authorship — an over-long string (prose) is rejected.
  try { await tool(ctx({}), { grant_name: 'x'.repeat(700) }); check('long prose rejected', false) }
  catch (e) { check('long prose rejected (AuthorshipError)', e instanceof AuthorshipError) }

  // 4. Happy path — org identity comes from ctx, never from params.
  const r1 = await tool(ctx({ orgId: 'org-A', userId: 'u1' }), { grant_name: 'Fund', org_id: 'org-EVIL' })
  check('orgId from ctx, not params', r1.data.org_id === 'org-A')
  check('provenance envelope present', r1.provenance.id?.source === 'agent')
  check('event logged with surface=app', captured[captured.length - 1]?.surface === 'app')

  // 5. Same tool via the MCP surface — identical call path, different surface tag.
  const r2 = await tool(ctx({ orgId: 'org-B', surface: 'mcp', tier: 'companion' }), { grant_name: 'Fund' })
  check('same tool callable via mcp surface', r2.surface === 'mcp')
  check('event logged with surface=mcp', captured[captured.length - 1]?.surface === 'mcp')
  check('in-app and mcp calls in ONE log, distinguishable by surface',
    captured.some(e => e.surface === 'app') && captured.some(e => e.surface === 'mcp'))

  // 6. Read-tool degraded / onboarding logic (pure, no DB).
  const pipeline: PipelineEntry[] = [
    { grant_name: 'A', funder_name: 'F', stage: 'applying', amount_requested: 50000, deadline: null },
    { grant_name: 'B', funder_name: 'G', stage: 'declined', amount_requested: 99999, deadline: null },
  ]
  const noGoal = buildPlanState(null, pipeline, '2026-07-01')
  check('get_plan_state degrades with no goal', noGoal.has_goal === false)

  const goal: GoalInput = { title: 'Y', target_amount: 1_000_000, secured_amount: 400_000, start_date: '2026-01-01', end_date: '2026-12-31', mix_targets: null, constraints: [] }
  const withGoal = buildPlanState(goal, pipeline, '2026-07-01')
  check('get_plan_state computes the gap with a goal', withGoal.has_goal === true && withGoal.arithmetic.gap === 600_000)

  const onboarding = buildBriefingOnboarding(
    { legal_structure: 'registered_charity', annual_income_band: '£100,000–£250,000', impact_sectors: ['community'] } as unknown as Organisation,
    pipeline,
  )
  check('get_briefing returns onboarding, not an error, with no goal', onboarding.has_goal === false)
  check('onboarding shows pipeline value excluding declined (£50k)',
    onboarding.has_goal === false && onboarding.onboarding.what_i_can_already_see.pipeline_value === 50000)

  console.log(`\n${fail === 0 ? '✓ ENVELOPE + READ TOOLS PROVEN' : '✗ FAILURES'}: ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}
main()
