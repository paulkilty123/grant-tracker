// Does rebalancing the sector coverage split agree with real users?
//
//   npx tsx scripts/eval-sector-coverage-weights.ts
//
// The themes dimension blends two questions:
//   grantCoverage — what fraction of the GRANT's remit does the org cover?
//   orgCoverage   — does the grant match what the ORG most cares about?
// Today the split is 0.7 / 0.3 in favour of the first, which penalises a broad
// funder for being broad. A B Charitable Trust funds five areas, Mustard Tree
// does one of them, and it scores 44% despite naming homeless people as a
// target group.
//
// Whether that is wrong is not a matter of opinion — there are 451 real
// judgements in match_feedback from 9 organisations. A better weighting should
// SEPARATE them: push the grants users called good up, and the ones they
// rejected down.
//
// Reported metrics, all computed on the same feedback set:
//   sep      mean(up) - mean(down). Bigger is better. This is the headline.
//   up>=55   how many liked grants clear the dashboard threshold (recall)
//   down>=55 how many rejected grants clear it (false positives — lower better)
//   auc      P(a random liked grant outranks a random rejected one), 0.5 = chance
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import path from 'path'
import { computeMatchScore, DEFAULT_MATCH_WEIGHTS } from '../src/lib/matching'
import { normaliseScrapedGrant } from '../src/lib/grants-normalise'
import type { Organisation } from '../src/types'

for (const line of readFileSync(path.resolve(__dirname, '../.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const SHARES = [0.7]
/** Capacity ceiling: grant's smallest award as a multiple of org income. 0 = off (today). */
const RATIOS = [0, 3, 2, 1.5, 1.0, 0.75, 0.5, 0.35, 0.25]

async function main() {
  const { data: fb, error } = await db
    .from('match_feedback')
    .select('user_id, grant_id, direction, match_score_at_time')
  if (error) throw new Error(error.message)

  const { data: orgs } = await db.from('organisations').select('*')
  const orgByOwner = new Map<string, Organisation>()
  for (const o of (orgs ?? []) as Organisation[]) {
    const owner = (o as unknown as { owner_id?: string }).owner_id
    // A user may own more than one org; the oldest is the one the app binds to.
    if (owner && !orgByOwner.has(owner)) orgByOwner.set(owner, o)
  }

  // grant_id is stored as EITHER a uuid or an external_id, so index both.
  const grants: Record<string, unknown>[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from('grants_with_funder').select('*').range(from, from + 999)
    grants.push(...(data ?? []) as Record<string, unknown>[])
    if (!data || data.length < 1000) break
  }
  const byId = new Map<string, Record<string, unknown>>()
  for (const g of grants) {
    if (g.id) byId.set(String(g.id), g)
    if (g.external_id) byId.set(String(g.external_id), g)
  }

  type Case = { org: Organisation; grant: Record<string, unknown>; liked: boolean }
  const cases: Case[] = []
  let unmatched = 0
  for (const f of fb ?? []) {
    const org = orgByOwner.get(String(f.user_id))
    const grant = byId.get(String(f.grant_id))
    if (!org || !grant) { unmatched++; continue }
    cases.push({ org, grant, liked: f.direction === 'up' })
  }

  const ups = cases.filter(c => c.liked).length
  console.log(`\nfeedback rows: ${(fb ?? []).length}  usable: ${cases.length}  (unresolved org/grant: ${unmatched})`)
  console.log(`liked: ${ups}   rejected: ${cases.length - ups}   orgs: ${new Set(cases.map(c => (c.org as unknown as {id:string}).id)).size}\n`)

  console.log(`ceiling      mean(up)  mean(down)   sep    up>=55   down>=55    auc`)
  console.log('─'.repeat(74))

  for (const share of SHARES) for (const ratio of RATIOS) {
    const w = { ...DEFAULT_MATCH_WEIGHTS, sectorGrantShare: share, sizeCeilingRatio: ratio }
    const up: number[] = [], down: number[] = []
    for (const c of cases) {
      const s = computeMatchScore(normaliseScrapedGrant(c.grant), c.org, undefined, w).score
      ;(c.liked ? up : down).push(s)
    }
    const mean = (a: number[]) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0
    const pct = (a: number[]) => a.length ? (100 * a.filter(x => x >= 55).length / a.length) : 0
    // AUC via pairwise comparison — ties count a half.
    let wins = 0, pairs = 0
    for (const u of up) for (const d of down) { pairs++; if (u > d) wins++; else if (u === d) wins += 0.5 }
    const auc = pairs ? wins / pairs : 0
    const sep = mean(up) - mean(down)
    const marker = ratio === 0 ? '  <- current (off)' : ''
    console.log(
      `${(ratio === 0 ? 'off' : ratio + 'x').padStart(7)}   ${mean(up).toFixed(1).padStart(7)}   ${mean(down).toFixed(1).padStart(8)}` +
      `${sep.toFixed(1).padStart(8)}   ${pct(up).toFixed(0).padStart(5)}%   ${pct(down).toFixed(0).padStart(6)}%   ${auc.toFixed(3)}${marker}`)
  }
  console.log(`\nsep = mean(liked) - mean(rejected); auc = P(liked outranks rejected). Higher is better for both.`)
}

main().catch(e => { console.error(e); process.exit(1) })
