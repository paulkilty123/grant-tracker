// Research agent v1 build spec §8 step 2 smoke — capability flag + steering +
// cost levers, on a throwaway org. No model calls (costs nothing): server
// tool defs, entitlement, authorship, surface gating, thread creation (038),
// and checkResearchBudget are all provable without hitting Anthropic. The
// researched_funder_cache happy path (039) self-gates SKIPPED if unapplied.
//
//   npx tsx --env-file=.env.local scripts/agent-eval/research-smoke.ts

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
} catch { /* ambient env */ }

const rule = (t: string) => console.log(`\n${'─'.repeat(78)}\n${t}\n${'─'.repeat(78)}`)
let failures = 0
function check(label: string, ok: boolean, detail?: string) {
  console.log(`  ${ok ? '✅' : '❌'} ${label}${!ok && detail ? ` — ${detail}` : ''}`)
  if (!ok) failures += 1
}

async function main() {
  const { createClient } = await import('@supabase/supabase-js')
  const tools = await import('../../src/lib/agent/tools')
  const { toolDefsForTier } = await import('../../src/lib/agent/orchestrator/dispatch')
  const { RESEARCH_SERVER_TOOLS, researchSteering } = await import('../../src/lib/agent/orchestrator/research')
  const { checkResearchBudget } = await import('../../src/lib/agent/orchestrator/budget')
  const threads = await import('../../src/lib/agent/orchestrator/threads')
  const { CONTRACT } = await import('../../src/lib/agent/contract')
  type Ctx = import('../../src/lib/agent/tools/types').ToolContext

  // ── contract + server tool defs (pure) ─────────────────────────────────────
  rule('contract + server tool defs')
  check('CONTRACT carries the three research rules', [CONTRACT.catalogueFirstResearch, CONTRACT.researchProvenance, CONTRACT.discrepancyFlagging].every(s => s.length > 0))
  check('RESEARCH_SERVER_TOOLS has web_search + web_fetch', RESEARCH_SERVER_TOOLS.length === 2 && RESEARCH_SERVER_TOOLS.every(t => 'name' in t && (t.name === 'web_search' || t.name === 'web_fetch')))
  const steerOn = researchSteering(true)
  const steerOff = researchSteering(false)
  check('researchSteering(true) says the tools are available', steerOn.includes('you also have web_search'))
  check('researchSteering(false) says NOT available + still allows the cache read', steerOff.includes('NOT available this turn') && steerOff.includes('check_researched_funder still works'))
  check('both variants carry the provenance/discrepancy steering', steerOn.includes(CONTRACT.researchProvenance) && steerOff.includes(CONTRACT.discrepancyFlagging))

  // ── entitlement (pure) ──────────────────────────────────────────────────────
  rule('entitlement — companion-only, research-only')
  check('free tier NOT entitled to check_researched_funder', !tools.isEntitled('free', 'check_researched_funder'))
  check('apply tier NOT entitled to cache_researched_funder', !tools.isEntitled('apply', 'cache_researched_funder'))
  check('companion tier entitled to both', tools.isEntitled('companion', 'check_researched_funder') && tools.isEntitled('companion', 'cache_researched_funder'))

  // ── toolDefsForTier research gating (pure) ──────────────────────────────────
  rule('toolDefsForTier — researchOnly gate')
  const namesNoResearch = toolDefsForTier('companion').map(t => t.name)
  const namesResearch = toolDefsForTier('companion', { research: true }).map(t => t.name)
  check('research tools absent without the research flag', !namesNoResearch.includes('check_researched_funder') && !namesNoResearch.includes('cache_researched_funder'))
  check('research tools present WITH the research flag', namesResearch.includes('check_researched_funder') && namesResearch.includes('cache_researched_funder'))
  check('research flag does not hide ordinary companion tools', namesResearch.includes('get_briefing') && namesResearch.includes('set_funding_goal'))
  check('apply tier never gets research tools regardless of the flag', !toolDefsForTier('apply', { research: true }).map(t => t.name).includes('check_researched_funder'))

  // ── surface gate (pure — throws before any DB call) ─────────────────────────
  rule('surface gate — app-only, defence in depth')
  const mcpCtx: Ctx = { orgId: '00000000-0000-0000-0000-00000000dead', surface: 'mcp', tier: 'companion' }
  let mcpBlockedCheck = false, mcpBlockedCache = false
  try { await tools.checkResearchedFunder(mcpCtx, { funder_name: 'Test Trust' }) } catch (e) { mcpBlockedCheck = e instanceof tools.EntitlementError }
  try { await tools.cacheResearchedFunder(mcpCtx, { funder_name: 'Test Trust', summary: 'x', source_urls: ['https://example.org'] }) } catch (e) { mcpBlockedCache = e instanceof tools.EntitlementError }
  check('check_researched_funder refuses mcp surface', mcpBlockedCheck)
  check('cache_researched_funder refuses mcp surface', mcpBlockedCache)

  // ── authorship guard on cache_researched_funder params (pure) ───────────────
  rule('authorship guard — scaffold-only params')
  const appCtxStub: Ctx = { orgId: '00000000-0000-0000-0000-00000000dead', surface: 'app', tier: 'companion' }
  let bodyFieldRejected = false, longSummaryRejected = false
  try { await tools.cacheResearchedFunder(appCtxStub, { funder_name: 'X', summary: 'ok', body: 'smuggled prose', source_urls: ['https://x.org'] } as never) } catch (e) { bodyFieldRejected = e instanceof tools.AuthorshipError }
  try { await tools.cacheResearchedFunder(appCtxStub, { funder_name: 'X', summary: 'x'.repeat(700), source_urls: ['https://x.org'] }) } catch (e) { longSummaryRejected = e instanceof tools.AuthorshipError }
  check('content-shaped field name (body) rejected', bodyFieldRejected)
  check('over-long summary (>600 chars) rejected', longSummaryRejected)

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

  const applied = {
    threadKindFocus: !(await sb.from('agent_threads').select('kind, focus_purpose_id, focus_label').limit(1)).error,
    pins: !(await sb.from('agent_thread_pins').select('id').limit(1)).error,
    funderCache: !(await sb.from('researched_funder_cache').select('id').limit(1)).error,
    briefs: !(await sb.from('agent_thread_briefs').select('id').limit(1)).error,
  }

  const { data: anyOrg } = await sb.from('organisations').select('owner_id').limit(1).single()
  if (!anyOrg) throw new Error('could not read an owner_id')
  const ownerId = (anyOrg as { owner_id: string }).owner_id
  const { data: created, error: orgErr } = await sb.from('organisations').insert({
    name: 'ZZ Research Smoke (delete me)', owner_id: ownerId,
    org_type: 'registered_charity', legal_structure: 'registered_charity',
    annual_income_band: '£100,000–£250,000', primary_location: 'UK-wide',
    geographic_reach: 'regional', impact_sectors: ['mental_health'],
    beneficiary_groups: ['young_people'], funding_type_preferences: ['grant'],
  }).select('id').single()
  if (orgErr || !created) throw new Error(`test org insert failed: ${orgErr?.message}`)
  const orgId = (created as { id: string }).id

  try {
    // ── 038: research threads (kind + focus, re-scoped active constraint) ─────
    rule('038 — research threads')
    if (!applied.threadKindFocus) {
      console.log('  ⏭  SKIPPED — apply supabase/migrations/038_research_threads_pins.sql first')
      failures += 1
    } else {
      const briefing1 = await threads.getOrCreateActiveThread(orgId)
      const briefing2 = await threads.getOrCreateActiveThread(orgId)
      check('briefing thread still singular + stable (kind unchanged)', !!briefing1 && briefing1 === briefing2)

      const r1 = await threads.createResearchThread(orgId, { focusLabel: 'Schools programme · £110k' })
      const r2 = await threads.createResearchThread(orgId, { focusLabel: 'A second, concurrent research thread' })
      check('research threads are independently created (not the same row)', !!r1 && !!r2 && r1 !== r2)
      check('research thread id differs from the briefing thread', r1 !== briefing1 && r2 !== briefing1)

      const meta1 = await threads.getThread(r1!, orgId)
      check('getThread reads back kind=research + focus_label', meta1?.kind === 'research' && meta1?.focusLabel === 'Schools programme · £110k')

      const wrongOrg = await threads.getThread(r1!, '00000000-0000-0000-0000-00000000dead')
      check('getThread refuses a thread_id under the wrong org', wrongOrg === null)

      const briefingMeta = await threads.getThread(briefing1!, orgId)
      check('getThread on the briefing thread reports kind=briefing', briefingMeta?.kind === 'briefing')

      // ── ship-gate: cards reconstruct on reload, not just live (spec §8 step 3/4) ──
      rule('ship-gate — card reload reconstruction')
      const fakeCandidate = {
        opportunity_id: '11111111-1111-1111-1111-111111111111',
        title: 'ZZ Smoke Test Fund', funder: 'ZZ Smoke Funder', funding_type: 'grant',
        amount_min: 5000, amount_max: 20000, amount_undisclosed: false,
        deadline: null, is_rolling: true, next_open_date: null, open_status: null,
        eligibility_status: 'eligible', warning_codes: [], match_reasons: ['Matches your sector.'],
        record_check: { status: 'unverified', checked_at: null }, size_note: null,
      }
      await threads.appendTurn(r1!, orgId, [
        { role: 'user', content: 'Find me some funders.' },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Here is one candidate.' },
            { type: 'tool_use', id: 'tu_ship_gate_1', name: 'get_briefing', input: {} },
          ],
        },
        {
          role: 'user',
          content: [{
            type: 'tool_result', tool_use_id: 'tu_ship_gate_1',
            content: JSON.stringify({ data: { has_goal: false, top_candidates: [fakeCandidate] }, provenance: {} }),
          }],
        },
      ], { turnKind: 'chat', usage: { model: 'smoke', input_tokens: 1, output_tokens: 1, cost_estimate_microgbp: 0, duration_ms: 1, tool_names: ['get_briefing'], loop_iterations: 1 } })

      const reloaded = await threads.loadThreadView(r1!)
      const assistantTurn = reloaded.find(m => m.role === 'assistant' && m.tool_names.includes('get_briefing'))
      check('reload reconstructs a card for the stored get_briefing tool_result', (assistantTurn?.cards.length ?? 0) === 1, `got ${JSON.stringify(assistantTurn?.cards)}`)
      const cardData = assistantTurn?.cards[0]?.data as { candidates?: Array<{ opportunity_id: string }> } | undefined
      check('reconstructed card carries the SAME candidate data a live turn would show', cardData?.candidates?.[0]?.opportunity_id === fakeCandidate.opportunity_id)
    }

    // ── 039: researched_funder_cache (self-gated) ──────────────────────────────
    rule('039 — researched_funder_cache')
    if (!applied.funderCache) {
      console.log('  ⏭  SKIPPED — apply supabase/migrations/039_research_cost_levers.sql first')
      failures += 1
    } else {
      const appCtx: Ctx = { orgId, surface: 'app', tier: 'companion', userId: ownerId }
      const miss = await tools.checkResearchedFunder(appCtx, { funder_name: 'ZZ Nonexistent Funder Smoke Test' })
      check('cache miss on an unresearched funder', miss.data.found === false)

      const cached = await tools.cacheResearchedFunder(appCtx, {
        funder_name: 'ZZ Smoke Test Trust',
        summary: 'Funds small UK charities working with young people; rolling deadline.',
        focus_notes: ['rolling deadline', 'UK-registered only'],
        source_urls: ['https://example.org/zz-smoke-test-trust'],
      })
      check('cache write succeeds', cached.data.cached === true)

      const hit = await tools.checkResearchedFunder(appCtx, { funder_name: 'zz smoke test trust' }) // case/whitespace-insensitive key
      check('cache hit, normalised key is case/whitespace-insensitive', hit.data.found === true && hit.data.stale === false)
      check('cache hit carries the summary + source back', hit.data.summary?.includes('rolling deadline') === true && hit.data.source_urls.includes('https://example.org/zz-smoke-test-trust'))

      // Re-cache same funder → upsert, not a duplicate row.
      await tools.cacheResearchedFunder(appCtx, { funder_name: 'ZZ Smoke Test Trust', summary: 'Updated summary.', source_urls: ['https://example.org/zz-smoke-test-trust-2'] })
      const { data: rows } = await sb.from('researched_funder_cache').select('id').eq('funder_key', 'zz smoke test trust')
      check('re-caching the same funder upserts, not duplicates', (rows ?? []).length === 1, `got ${(rows ?? []).length} rows`)
    }

    // ── 040: agent_thread_briefs (self-gated) ──────────────────────────────────
    rule('040 — agent_thread_briefs')
    if (!applied.briefs) {
      console.log('  ⏭  SKIPPED — apply supabase/migrations/040_research_briefs.sql first')
      failures += 1
    } else if (!applied.threadKindFocus) {
      console.log('  ⏭  SKIPPED — needs a research thread (038) to attach to')
      failures += 1
    } else {
      const briefThreadId = await threads.createResearchThread(orgId, { focusLabel: 'ZZ brief smoke thread' })
      if (!briefThreadId) {
        check('could create a thread to attach a brief to', false)
      } else {
        // No LLM call here (this suite costs nothing) — write the row
        // directly, the exact shape api/agent/research/brief's route writes,
        // proving the schema + RLS select policy end to end. Real generation
        // (brief.ts's provenance lint) is a paid Anthropic call, not exercised
        // by this free suite — same convention as schema-smoke.ts.
        const sections = {
          what_they_fund: [{ text: 'Funds youth programmes across the UK.', provenance: 'catalogue' }],
          fit_against_purpose: [{ text: 'Matches the schools programme purpose.', provenance: 'adviser_judgment' }],
          how_to_approach: [{ text: 'Apply via their online portal.', provenance: 'catalogue' }],
          watch_outs: [] as Array<{ text: string; provenance: string }>,
        }
        const { data: savedBrief, error: briefErr } = await sb.from('agent_thread_briefs').insert({
          thread_id: briefThreadId, org_id: orgId, opportunity_ref: '11111111-1111-1111-1111-111111111111',
          title: 'ZZ Smoke Test Brief', sections, model: 'smoke', prompt_version: 'smoke-v0',
        }).select('id, title, sections, created_at').single()
        check('brief row inserts', !briefErr && !!savedBrief, briefErr?.message)

        const { data: readBack } = await sb.from('agent_thread_briefs')
          .select('id, thread_id, title, sections').eq('thread_id', briefThreadId).maybeSingle()
        const rb = readBack as { title?: string; sections?: typeof sections } | null
        check('brief reads back with title + provenance-tagged sections intact',
          rb?.title === 'ZZ Smoke Test Brief' && rb?.sections?.what_they_fund?.[0]?.provenance === 'catalogue')

        // No separate cleanup: agent_thread_briefs.thread_id cascades from
        // agent_threads on delete, covered by the finally block below.
      }
    }

    // ── cost lever 1 — monthly research budget (live, no migration needed) ────
    rule('cost lever 1 — checkResearchBudget')
    const budget = await checkResearchBudget('00000000-0000-0000-0000-00000000dead') // no events for this id → fresh
    check('unused org reports allowed=true with 0 used', budget.allowed === true && budget.usedThisMonth === 0, `got ${JSON.stringify(budget)}`)
    check('cap matches config default (or env override)', budget.cap > 0)
  } finally {
    rule('CLEANUP')
    if (applied.funderCache) await sb.from('researched_funder_cache').delete().in('funder_key', ['zz smoke test trust'])
    await sb.from('events').delete().eq('org_id', orgId)
    if (applied.threadKindFocus) await sb.from('agent_threads').delete().eq('org_id', orgId) // cascades messages + pins
    const { error: delErr } = await sb.from('organisations').delete().eq('id', orgId)
    console.log(`org delete err: ${delErr?.message ?? 'none'}`)
  }

  rule('RESULT')
  console.log(failures === 0 ? '✓ research smoke clean' : `✗ ${failures} failure(s)/skip(s)`)
  process.exit(failures === 0 ? 0 : 2)
}

main().catch(e => { console.error('\nFATAL:', e); process.exit(1) })
