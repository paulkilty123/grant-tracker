/**
 * Paul's spot check of the Asian community concern match list, 17 August 2026.
 *
 * Nine live rows, nine defects, found by one person reading one match list. Four
 * of them the verification engine had ALREADY flagged as `wrong_fund` or
 * `no_funding_detail` and they were still live and published, which is the real
 * finding: the engine has been measuring this since 11 August and nothing has
 * ever converted its verdicts into corrections.
 *
 * Every URL below that Paul supplied is written with an `admin:` source, because
 * he read the page and decided it. Everything derived from a page read here is
 * `system:` at trust 50, so a later enrichment pass can still improve it.
 *
 * Run:  npx tsx scripts/spot-check-fixes-2026-08-17.ts [--apply]
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const HERE = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(resolve(HERE, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

const APPLY = process.argv.includes('--apply')
const PAUL  = 'admin:paulkilty1@gmail.com'
const SPOT  = 'system:spot_check_2026-08-17'

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type Fix = {
  id: string; title: string; source: string
  fields: Record<string, unknown>
  why: string
}

const FIXES: Fix[] = [
  // ── URLs Paul supplied, having read the pages himself ────────────────────
  {
    id: '06a3f5a0-e90d-451b-a829-0d3b895aac72', title: 'LEF — Strengthening Justice Fund',
    source: PAUL,
    fields: { apply_url: 'https://lef.org.uk/funding/grants/strengthening-justice-fund' },
    why: 'pointed at the generic /funding/our-funds listing, not the fund',
  },
  {
    id: '1ffe7161-587d-48ce-86a2-39a94a9120ad', title: "The Weavers' Company Charitable Funds",
    source: PAUL,
    fields: { apply_url: 'https://www.weavers.org.uk/charity/charitable-grants/guidelines/' },
    why: 'pointed at /charity/, which carries no funding detail — the engine said so and nothing acted',
  },
  {
    id: '6d512c2b-f3b9-43d2-9b9d-83399dc49d0c', title: 'SSE Match Trading Grant',
    source: PAUL,
    fields: { apply_url: 'https://www.matchtrading.com/' },
    why: 'pointed at the-sse.org programme page rather than the fund’s own site',
  },

  // ── Timing, quoted off the funder's page today ───────────────────────────
  {
    id: '8f8bc717-1cbb-44de-abc1-fe04e0efcce2', title: 'JRCT — Rights & Justice Programme',
    source: SPOT,
    // "Application deadline: Wednesday, September 2, 2026, 10am" — jrct.org.uk/when-to-apply
    fields: { deadline: '2026-09-02', is_rolling: false },
    why: 'said "Rolling, apply any time" with a hard deadline sixteen days away',
  },
  {
    id: '87775eeb-4be9-4068-be85-66587cc45af3', title: 'Woodward Charitable Trust — General Grants',
    source: SPOT,
    // "The general grant round is currently closed. The next general grant round
    //  is expected to open later in 2026."
    fields: {
      is_active: false, pipeline_state: 'between_rounds_scheduled',
      next_open_date: 'Later in 2026',
    },
    why: 'closed, and showing "Check website" — my renderer fix this morning swapped one wrong label for another',
  },

  // ── Rows that should not be in front of anyone ───────────────────────────
  // is_active:false ALONE, so transitionPipelineState sends them to `captured`
  // — withdrawn for review, not archived. Paul decides what each becomes.
  {
    id: '6492a3f7-ab34-4109-8d1a-89b00749b173', title: 'Runnymede Trust — Race Equality Grants',
    source: SPOT, fields: { is_active: false },
    why: 'apply_url is the Runnymede homepage and no such fund is evident; engine said wrong_fund on 11 August',
  },
  {
    id: '33d176a7-0f56-4489-9276-eb74eef826c8', title: 'Fix the Digital Divide Fund',
    source: SPOT, fields: { is_active: false, url_status: 'dead' },
    why: 'URL returns 403 and url_status still read "ok"; engine said wrong_fund on 11 August',
  },
  {
    id: '37a8f875-7834-495f-8e14-a0fade147ebf', title: 'Ufi VocTech Trust',
    source: SPOT, fields: { is_active: false },
    why: 'a front door listing four programmes, carried as one fund; engine said multiple_funds',
  },
  {
    id: 'd29103be-5800-4beb-920f-205b48a78e78', title: 'City Bridge Foundation — Grants for London',
    source: SPOT, fields: { is_active: false },
    why: 'one generic row claiming "rolling" over five real funds with different states; engine said wrong_fund',
  },
]

async function main() {
  const record: unknown[] = []
  let changed = 0
  const refused: string[] = []

  for (const f of FIXES) {
    const { data } = await db.from('scraped_grants')
      .select('title, apply_url, is_active, pipeline_state, deadline, is_rolling, url_status')
      .eq('id', f.id).single()
    console.log(`\n${f.title}`)
    console.log(`   why: ${f.why}`)
    console.log(`   now: ${JSON.stringify(data)}`)
    console.log(`   ->   ${JSON.stringify(f.fields)}   [${f.source}]`)
    if (!APPLY) continue

    let applied: string[] = []
    let rejected: unknown[] = []
    let err: string | null = null
    try {
      const res = await mergeGrantUpdate({
        id: f.id, fields: f.fields, source: f.source,
        pinned: f.source.startsWith('admin:'), db,
      })
      applied = res.applied; rejected = res.rejected
    } catch (e) { err = e instanceof Error ? e.message : String(e) }

    // Untracked fields (is_active, pipeline_state, url_status) are not reported
    // in `applied`, so only assert on the tracked ones we asked for.
    const TRACKED = new Set(['apply_url', 'deadline', 'is_rolling', 'next_open_date'])
    const wanted  = Object.keys(f.fields).filter(k => TRACKED.has(k))
    const missed  = wanted.filter(k => !applied.includes(k))
    const ok = !err && missed.length === 0
    if (ok) changed++
    else refused.push(`${f.title}: ${err ?? `refused ${missed.join(', ')}`}`)
    record.push({ ...f, before: data, applied, rejected, error: err, ok })
  }

  if (!APPLY) { console.log('\n\nNothing written. Re-run with --apply.'); return }

  writeFileSync(
    resolve(HERE, '..', 'reports', 'spot-check-fixes-2026-08-17.json'),
    JSON.stringify({ ranAt: new Date().toISOString(), changed, record }, null, 2),
  )
  console.log(`\n\nROWS FIXED: ${changed} of ${FIXES.length}`)
  if (refused.length) for (const r of refused) console.log(`   REFUSED ${r}`)
}

main().catch(e => { console.error(e); process.exit(1) })
