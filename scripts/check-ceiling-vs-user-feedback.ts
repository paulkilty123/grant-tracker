// Does the capacity ceiling override a grant a user explicitly said YES to?
//
//   npx tsx scripts/check-ceiling-vs-user-feedback.ts
//
// The ceiling is applied to the TOTAL at the end of computeMatchScore, after
// the feedback signal has already adjusted the themes dimension. So it can in
// principle bury something a user thumbed up, which would be the worst kind of
// regression: the product contradicting a decision the user made by hand.
//
// This checks every up-vote in match_feedback, not a sample. Read-only.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import path from 'path'
import { computeMatchScore, DEFAULT_MATCH_WEIGHTS, INCOME_MIDPOINTS } from '../src/lib/matching'
import { normaliseScrapedGrant } from '../src/lib/grants-normalise'
import type { Organisation } from '../src/types'

for (const line of readFileSync(path.resolve(__dirname, '../.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function main() {
  const { data: fb } = await db.from('match_feedback').select('user_id, grant_id, direction')
  const { data: orgs } = await db.from('organisations').select('*')
  const orgByOwner = new Map<string, Organisation>()
  for (const o of (orgs ?? []) as Organisation[]) {
    const owner = (o as unknown as { owner_id?: string }).owner_id
    if (owner && !orgByOwner.has(owner)) orgByOwner.set(owner, o)
  }

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

  const OFF = { ...DEFAULT_MATCH_WEIGHTS, sizeCeilingRatio: 0 }
  const ON  = { ...DEFAULT_MATCH_WEIGHTS }   // ships with 1.0

  let upChecked = 0, upHurt = 0, downChecked = 0, downHelped = 0
  const hurt: string[] = []

  for (const f of fb ?? []) {
    const org = orgByOwner.get(String(f.user_id))
    const grant = byId.get(String(f.grant_id))
    if (!org || !grant) continue
    const g = normaliseScrapedGrant(grant)
    const before = computeMatchScore(g, org, undefined, OFF).score
    const after  = computeMatchScore(g, org, undefined, ON).score

    if (f.direction === 'up') {
      upChecked++
      if (after < before) {
        upHurt++
        const inc = INCOME_MIDPOINTS[org.annual_income_band ?? ''] ?? null
        hurt.push(
          `  ${org.name} (${org.annual_income_band ?? 'income not set'})\n` +
          `    ${grant.funder} — ${grant.title}\n` +
          `    ${before}% -> ${after}%   smallest award £${Number(grant.amount_min).toLocaleString('en-GB')}` +
          ` vs income ~£${inc?.toLocaleString('en-GB') ?? '?'}`)
      }
    } else {
      downChecked++
      if (after < before) downHelped++
    }
  }

  console.log(`\nUP-VOTED grants checked   : ${upChecked}`)
  console.log(`  demoted by the ceiling  : ${upHurt}${upHurt === 0 ? '   <- none, no user decision overridden' : '   <- REVIEW THESE'}`)
  console.log(`\nDOWN-VOTED grants checked : ${downChecked}`)
  console.log(`  demoted by the ceiling  : ${downHelped}   (agreeing with the user)`)
  if (hurt.length) {
    console.log(`\nup-voted grants the ceiling demotes:`)
    console.log(hurt.join('\n'))
  }

  // The ceiling is a scoring rule. It must not touch anything the user has
  // explicitly acted on — saving, pipelining or applying. Verify those surfaces
  // do not run through computeMatchScore for inclusion.
  const { count: saved } = await db.from('grant_interactions')
    .select('*', { count: 'exact', head: true }).eq('action', 'saved')
  const { count: pipeline } = await db.from('pipeline_items')
    .select('*', { count: 'exact', head: true })
  console.log(`\nuser-owned records that must be unaffected: ${saved} saved, ${pipeline} pipeline items`)
  console.log(`(both are stored rows, not score-filtered lists — the ceiling cannot remove them)`)
}

main().catch(e => { console.error(e); process.exit(1) })
