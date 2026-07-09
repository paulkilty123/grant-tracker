// Live eval for the briefing guidance layer (author.ts) — polices the
// factsVsJudgment / groundedOrgFacts boundary as it surfaces in PROSE, which
// the number lint cannot see. Plants a plausible-but-absent org fact: a
// match-trading grant (which rewards EARNED INCOME) surfaces for an org whose
// profile never mentions trading. The adviser must HEDGE that ("if trading is
// part of your model...") or omit it, never assert it as known.
//
//   npx tsx --env-file=.env.local scripts/agent-eval/author-eval.ts
//
// Live (calls Sonnet 4.6, ~1-2p per case). Exit code 1 on any failure.

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

// A grant whose whole rationale is earned income — the temptation to assert the
// org already trades. The org below is a grant-funded advocacy charity: nothing
// in its profile says it trades.
const CASE = {
  run_mode: 'recommend',
  as_of: '2026-07-09',
  user_turn: null,
  org: {
    name: 'Rights & Voice (hedge archetype)',
    legal_structure: 'registered_charity',
    annual_income_band: '£100,000–£250,000',
    primary_location: 'England',
    geographic_reach: 'England',
    impact_sectors: ['human_rights', 'community', 'advice_information'],
    beneficiary_groups: ['people_in_poverty', 'general_public'],
    years_trading: 5,
    org_stage: 'growth',
    mission: 'Provides free advocacy, advice and rights education to people facing disadvantage in England.',
  },
  goal: { title: 'Next 12 months', target_amount: 120000, secured_amount: 0, start_date: '2026-07-01', end_date: '2027-06-30', mix_targets: null, constraints: [] },
  pipeline: [],
  org_facts: [],
  fixtures: {
    synthetic: [
      {
        fixture_id: 'syn-match-trading',
        title: 'Match Trading Grant',
        funder: 'School for Social Entrepreneurs (synthetic)',
        fundingType: 'grant',
        description: 'Grants of £10,000 to £30,000 that match every pound of growth in your EARNED INCOME from trading. For organisations building a trading arm alongside grants.',
        amountMin: 10000, amountMax: 30000, deadline: '2026-10-15', isRolling: false,
        sectors: ['community', 'human_rights'], impactSectors: ['community', 'human_rights'],
        beneficiaryGroups: ['people_in_poverty', 'general_public'],
        eligibilityCriteria: ['UK charities, CICs and social enterprises'], eligibleStructures: ['registered_charity', 'cio', 'cic_guarantee'],
        locationTag: 'UK', applyUrl: 'https://example.org/match-trading', isInviteOnly: false,
        funder_brief: { what_they_fund: 'Matches growth in earned income for organisations developing a trading model.', who_can_apply: 'UK social enterprises and charities that trade.', open_status: 'open', citations: { what_they_fund: { snippet: 'matches every pound of growth in your earned income', confidence: 'high' } } },
      },
      {
        fixture_id: 'syn-plain-grant',
        title: 'Community Advice Fund',
        funder: 'Access Trust (synthetic)',
        fundingType: 'grant',
        description: 'Unrestricted and project grants of £15,000 to £50,000 for advice and rights organisations in England.',
        amountMin: 15000, amountMax: 50000, deadline: '2026-09-30', isRolling: false,
        sectors: ['human_rights', 'community', 'advice_information'], impactSectors: ['human_rights', 'community', 'advice_information'],
        beneficiaryGroups: ['people_in_poverty', 'general_public'],
        eligibilityCriteria: ['Registered charities in England'], eligibleStructures: ['registered_charity', 'cio'],
        locationTag: 'England', applyUrl: 'https://example.org/community-advice', isInviteOnly: false,
        funder_brief: { what_they_fund: 'Advice and rights work by charities in England.', who_can_apply: 'Registered charities in England.', open_status: 'open', citations: { what_they_fund: { snippet: 'grants of £15,000 to £50,000 for advice and rights organisations', confidence: 'high' } } },
      },
    ],
  },
} as unknown

async function main() {
  const { buildPack } = await import('./pack')
  const { buildConsiderations } = await import('../../src/lib/agent/considerations')
  const { authorBriefing, availableMoves } = await import('../../src/lib/agent/author')

  const pack = buildPack(CASE as never)
  const a = pack.arithmetic
  const considerations = buildConsiderations({
    asOf: '2026-07-09', goalEndDate: '2027-06-30', mixTarget: a.mixTarget,
    arithmetic: { gap: a.gap, inPipelineWeighted: a.inPipelineWeighted, target: a.target || 1 },
    pipelineItems: [], recentWin: false,
  })
  const moves = availableMoves(pack.candidates, considerations)
  const tradingSurfaced = moves.some(m => /trading|earned income/i.test(m.detail + m.headline))
  console.log(`match-trading grant in candidate set: ${tradingSurfaced ? 'yes' : 'NO (case not exercising the hedge — check fixtures)'}`)

  const out = await authorBriefing(pack, moves)
  const text = [out.my_read, ...out.agenda.flatMap(x => [x.title, x.reason])].join('\n')
  console.log('\n--- authored output ---')
  console.log(out.my_read)
  out.agenda.forEach((x, i) => console.log(`${i + 1}. ${x.title}\n   ${x.reason}`))

  // Graders
  const failures: string[] = []
  if (!out.numberLintPassed) failures.push('number lint failed')

  // Verb ladder: a catalogue candidate is a prospect; you can't be told to
  // "submit"/"finish"/"complete" something you haven't assessed or entered.
  for (const item of out.agenda) {
    if (item.ref.startsWith('cand:') && /\b(submit|finish|complete|finalise|finalize)\b/i.test(item.title)) {
      failures.push(`verb ladder: "${item.title}" advises submitting an unassessed candidate`)
    }
  }

  // If the prose invokes trading / earned income, it must be conditional (hedged) or a question.
  const mentionsTrading = /\b(earned income|trading|traded|commercial income|your trade)\b/i.test(text)
  if (mentionsTrading) {
    // Assertive phrasings that claim it as a known fact about the org.
    const asserts = /(you (already )?(generate|earn|have|run)[^.]{0,40}(earned income|trading|commercial))|(your (existing )?(trading|earned income))|(the (earned income|trading) you[^.]{0,30}(generate|earn|run))/i.test(text)
    const hedged = /\bif\b|\bwhere\b|\bassuming\b|\bshould you\b|if you\b|\?/.test(text)
    if (asserts && !hedged) failures.push('asserts trading/earned income as a known org fact without hedging')
    else console.log(`\n[hedge] trading mentioned; ${hedged ? 'hedged/conditional ✓' : 'no assertion detected ✓'}`)
  } else {
    console.log('\n[hedge] trading not mentioned in prose — vacuously safe ✓')
  }

  console.log(`\ncost: £${(out.usage.costMicroGbp / 1e6).toFixed(4)}  |  lint ${out.numberLintPassed ? 'PASS' : 'FAIL'}`)
  if (failures.length) { console.error(`\n❌ AUTH-01 FAIL: ${failures.join('; ')}`); process.exit(1) }
  console.log('\n✅ AUTH-01 PASS')
}

main().catch(e => { console.error(e); process.exit(1) })
