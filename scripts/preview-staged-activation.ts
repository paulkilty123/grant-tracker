// What would an org actually SEE if the staged batch went live?
//
//   npx tsx scripts/preview-staged-activation.ts <orgId> [source]
//
// Scores the staged rows against a real org using the production matcher,
// WITHOUT activating anything. Answers the only question that matters before
// publishing: do these reach the user, and do they land in a sensible order?
//
// A staged row that scores below 55 is invisible on the dashboard, so
// publishing it changes nothing for that user. Better to know before than after.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import path from 'path'
import { computeMatchScore } from '../src/lib/matching'
import { normaliseScrapedGrant } from '../src/lib/grants-normalise'
import type { Organisation } from '../src/types'

for (const l of readFileSync(path.resolve(__dirname, '../.env.local'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const CANONICAL = new Set(['grant', 'programme', 'investment', 'in_kind'])

async function main() {
  const orgId = process.argv[2]
  const source = process.argv[3] ?? 'research_batch'
  if (!orgId) { console.error('Usage: npx tsx scripts/preview-staged-activation.ts <orgId> [source]'); process.exit(1) }

  const { data: orgRow } = await db.from('organisations').select('*').eq('id', orgId).single()
  const org = orgRow as Organisation
  const sectorSet = new Set((org.impact_sectors ?? []) as string[])

  // grants_with_funder is the matcher's real read surface, but it may filter on
  // is_active. Read the staged rows straight from the table and normalise the
  // same way, so the preview reflects what the scorer would actually get.
  const { data, error } = await db.from('scraped_grants').select('*').eq('source', source).eq('is_active', false)
  if (error) throw new Error(error.message)

  type Scored = { funder: string; title: string; score: number; gate: string; type: string }
  const out: Scored[] = []

  for (const row of data ?? []) {
    const r = row as Record<string, unknown>
    const g = normaliseScrapedGrant(r)
    const ge = g as typeof g & { impactSectors?: string[] }
    let gate = 'scored'
    let score = 0
    if (!CANONICAL.has((g.fundingType ?? 'grant') as string)) gate = 'funding type'
    else if (org.legal_structure && g.eligibleStructures?.length && !g.eligibleStructures.includes(org.legal_structure)) gate = 'STRUCTURE GATE'
    else if (sectorSet.size > 0 && ge.impactSectors?.length && !ge.impactSectors.some(s => sectorSet.has(s))) gate = 'SECTOR GATE'
    else score = computeMatchScore(g, org).score
    out.push({ funder: String(r.funder ?? '?'), title: String(r.title), score, gate, type: String(g.fundingType ?? 'grant') })
  }

  out.sort((a, b) => b.score - a.score)
  console.log(`\n${org.name} — ${org.primary_location}, ${org.annual_income_band}`)
  console.log(`previewing ${out.length} staged rows from source='${source}'\n`)
  console.log(`score  visible  type       funder / title`)
  console.log('─'.repeat(88))
  for (const o of out) {
    const vis = o.gate !== 'scored' ? o.gate : o.score >= 55 ? 'YES' : 'no'
    console.log(`${o.gate !== 'scored' ? '  -- ' : String(o.score).padStart(4) + '%'}  ${vis.padEnd(15)} ${o.type.padEnd(10)} ${o.funder.slice(0, 28).padEnd(28)} ${o.title.slice(0, 34)}`)
  }
  const visible = out.filter(o => o.gate === 'scored' && o.score >= 55).length
  const gated = out.filter(o => o.gate !== 'scored').length
  console.log(`\n${'─'.repeat(88)}`)
  console.log(`would reach this user (>=55%): ${visible} of ${out.length}`)
  console.log(`below the 55% threshold      : ${out.length - visible - gated}`)
  console.log(`dropped by a gate            : ${gated}`)
  console.log(`\nNote: rows below 55% are still findable in Find Funding — they just do not surface on the dashboard.`)
}

main().catch(e => { console.error(e); process.exit(1) })
