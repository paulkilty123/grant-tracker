// Are there grants that FIT an org but score badly because of how they're tagged?
//
//   npx tsx scripts/find-mistagged-good-matches.ts <orgId>
//
// Judging that from the tags would be circular — the tags are what's suspected.
// So this scores each grant on its own TEXT against the org's mission words,
// entirely independently of impact_sectors, then compares that to what the
// matcher actually does with it. Grants that read as a strong fit but score
// poorly are the mis-tagged ones.
//
// Text relevance here is deliberately crude and transparent: counts of the
// org's own mission vocabulary in the grant's own prose. It is not trying to be
// a better matcher, only an independent second opinion.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import path from 'path'
import { computeMatchScore } from '../src/lib/matching'
import { normaliseScrapedGrant } from '../src/lib/grants-normalise'
import type { Organisation } from '../src/types'

for (const line of readFileSync(path.resolve(__dirname, '../.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const CANONICAL = new Set(['grant', 'programme', 'investment', 'in_kind'])
const BROAD = new Set(['uk', 'uk-wide', 'england', 'nationwide', 'national', 'uk wide', 'all uk'])

/** Places that ARE the org's area, for the reachability split. */
const REGION_WORDS = ['manchester', 'salford', 'greater manchester', 'north west', 'north of england']

/**
 * Mission vocabulary, weighted. Derived from the org's own mission statement
 * and beneficiary groups rather than its sector tags, so the test does not
 * inherit the thing it is testing.
 */
function missionTerms(org: Organisation): { re: RegExp; weight: number; label: string }[] {
  const terms: { re: RegExp; weight: number; label: string }[] = []
  const mission = (org.mission ?? '').toLowerCase()
  const benefs = (org.beneficiary_groups ?? []) as string[]

  const BY_BENEFICIARY: Record<string, [RegExp, number, string]> = {
    homeless:          [/homeless|rough sleep|temporary accommodation|housing insecur|sofa[- ]surf/i, 3, 'homelessness'],
    people_in_poverty: [/\bpoverty\b|low[- ]income|hardship|destitut|cost of living|deprivation/i, 2, 'poverty'],
    refugees_migrants: [/refugee|asylum|migrant|sanctuary|no recourse to public funds/i, 2, 'refugees'],
    ex_offenders:      [/ex[- ]offend|prison leaver|resettlement/i, 2, 'ex-offenders'],
    disabled_people:   [/disabilit|disabled/i, 2, 'disability'],
    young_people:      [/young people|youth/i, 1, 'young people'],
    older_people:      [/older people|elderly/i, 1, 'older people'],
  }
  for (const b of benefs) {
    const t = BY_BENEFICIARY[b]
    if (t) terms.push({ re: t[0], weight: t[1], label: t[2] })
  }
  // Activity words lifted straight from the mission sentence.
  const ACTIVITY: [RegExp, number, string][] = [
    [/\bfood\b|foodbank|food bank|pantry|meals?/i, 2, 'food'],
    [/furniture|household goods|white goods|starter pack/i, 3, 'furniture'],
    [/\bclothing\b|clothes/i, 2, 'clothing'],
    [/training|work placement|employab|volunteer placement|skills/i, 2, 'training'],
    [/advice|advocacy|casework|support services/i, 1, 'advice'],
    [/destitution|crisis (?:support|grant|fund)/i, 2, 'crisis'],
  ]
  for (const [re, w, label] of ACTIVITY) {
    if (re.test(mission) || label === 'food' || label === 'training') terms.push({ re, weight: w, label })
  }
  return terms
}

async function main() {
  const orgId = process.argv[2]
  if (!orgId) { console.error('Usage: npx tsx scripts/find-mistagged-good-matches.ts <orgId>'); process.exit(1) }

  const { data: orgRow } = await db.from('organisations').select('*').eq('id', orgId).single()
  const org = orgRow as Organisation
  const terms = missionTerms(org)

  const today = new Date().toISOString().split('T')[0]
  const { data: rows } = await db.from('grants_with_funder').select('*')
    .eq('is_active', true).neq('url_status', 'dead')
    .or(`is_rolling.eq.true,deadline.is.null,deadline.gte.${today},next_open_date_parsed.gte.${today}`)
    .limit(1000)

  const orgLocation = (org.primary_location ?? '').toLowerCase().trim()
  const sectorSet = new Set((org.impact_sectors ?? []) as string[])
  const locationPasses = (geo: string[] | undefined) =>
    !orgLocation || !geo || geo.length === 0 ||
    geo.some(s => { const sl = s.toLowerCase(); return BROAD.has(sl) || sl.includes(orgLocation) || orgLocation.includes(sl) })

  type Item = { funder: string; title: string; textFit: number; hits: string[]; score: number | null; gate: string; sectors: string[]; reachable: boolean; amountMax: number | null }

  // Is this fund open to an org in the user's nation/region at all? Uses the
  // matcher's own classifier so the verdict matches what the scorer believes.
  const orgNationWords = orgLocation
  const isReachable = (locationTag: string | null | undefined): boolean => {
    const t = (locationTag ?? '').trim().toLowerCase()
    if (!t) return true
    if (BROAD.has(t) || t === 'united kingdom' || t === 'great britain') return true
    if (/england|wales|britain|\buk\b/.test(t) && !/scotland|northern ireland/.test(t)) return true
    return t.includes(orgNationWords) || orgNationWords.includes(t) ||
      REGION_WORDS.some(w => t.includes(w))
  }
  const items: Item[] = []

  for (const row of rows ?? []) {
    const r = row as Record<string, unknown>
    const g = normaliseScrapedGrant(r)
    const ge = g as typeof g & { impactSectors?: string[]; geoScope?: string[] }
    const brief = (r.funder_brief ?? {}) as Record<string, unknown>
    const text = [
      g.title, g.description,
      typeof brief.what_they_fund === 'string' ? brief.what_they_fund : '',
      typeof brief.priorities === 'string' ? brief.priorities : '',
    ].join('. ')

    let textFit = 0
    const hits: string[] = []
    for (const t of terms) if (t.re.test(text)) { textFit += t.weight; if (!hits.includes(t.label)) hits.push(t.label) }
    if (textFit < 5) continue   // only grants that read as a real fit

    let gate = 'scored'
    let score: number | null = null
    if (!CANONICAL.has((g.fundingType ?? 'grant') as string)) gate = 'funding type'
    else if (org.legal_structure && g.eligibleStructures?.length && !g.eligibleStructures.includes(org.legal_structure)) gate = 'structure'
    else if (!locationPasses(ge.geoScope)) gate = 'location'
    else if (sectorSet.size > 0 && ge.impactSectors?.length && !ge.impactSectors.some(s => sectorSet.has(s))) gate = 'SECTOR GATE'
    else score = computeMatchScore(g, org).score

    // A grant smaller than the org's stated minimum ask is correctly buried by
    // the size-floor cap — that is the matcher working, not a tagging failure.
    // Excluding it here is what separates "we lost a good grant" from "they
    // asked for £10k+ and this fund gives £5k".
    const maxAward = (r.amount_max as number | null) ?? null
    const sizeOk = maxAward === null || !org.min_grant_target || maxAward >= org.min_grant_target
    items.push({ funder: g.funder ?? '', title: g.title, textFit, hits, score, gate, sectors: ge.impactSectors ?? [], reachable: isReachable(r.location_tag as string | null) && sizeOk, amountMax: maxAward })
  }

  items.sort((a, b) => b.textFit - a.textFit)

  console.log(`\n${org.name} — mission terms: ${terms.map(t => t.label).join(', ')}`)
  console.log(`grants whose own text reads as a real fit (score >=5): ${items.length}\n`)
  console.log(`fit  match  status        funder / title`)
  console.log('─'.repeat(96))
  for (const i of items.slice(0, 34)) {
    const shown = i.score === null ? `  --  ${i.gate.padEnd(12)}` : `${String(i.score).padStart(4)}%  ${(i.score >= 55 ? 'VISIBLE' : 'below 55%').padEnd(12)}`
    console.log(`${String(i.textFit).padStart(3)}  ${shown} ${(i.funder + ' — ' + i.title).slice(0, 60)}`)
  }

  // A grant for another part of the country is not a tagging failure, it is
  // correctly buried. Separating the two is the whole point — otherwise this
  // overstates the problem by counting every Scottish and London fund.
  const reachable = items.filter(i => i.reachable)
  const gated = reachable.filter(i => i.score === null && i.gate === 'SECTOR GATE')
  const lowScored = reachable.filter(i => i.score !== null && i.score < 55)
  const visible = reachable.filter(i => i.score !== null && i.score >= 55)

  console.log(`\n${'─'.repeat(96)}`)
  console.log(`reads as a fit, total                          : ${items.length}`)
  console.log(`  ...of which are out of area OR below their   : ${items.length - reachable.length}`)
  console.log(`     minimum ask (both correctly buried)`)
  console.log(`\nOF THE ${reachable.length} THIS ORG COULD ACTUALLY APPLY TO:`)
  console.log(`  visible to the user (>=55%)                  : ${visible.length}`)
  console.log(`  scores below 55%, so never seen              : ${lowScored.length}`)
  console.log(`  dropped by the sector gate, never scored     : ${gated.length}`)

  if (lowScored.length) {
    console.log(`\nreachable, reads as a fit, but scores too low to be seen:`)
    for (const g of lowScored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 14)) {
      console.log(`  ${String(g.score).padStart(3)}%  fit ${String(g.textFit).padStart(2)}  [${g.sectors.join(',')}]  ${g.funder}`.slice(0, 112))
    }
  }
  if (gated.length) {
    console.log(`\nreachable, reads as a fit, dropped by the sector gate:`)
    for (const g of gated.slice(0, 14)) {
      console.log(`  fit ${String(g.textFit).padStart(2)}  [${g.sectors.join(',')}]  ${g.funder} — ${g.title}`.slice(0, 112))
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) })
