// Why did a specific grant NOT reach an org's top matches?
//
// preflight-match.ts prints the top 15, which tells you what won but never why
// something lost. This traces named funders through the same gate chain and
// reports, for each: gated (and on which gate) or scored (and where it ranked).
//
//   npx tsx scripts/trace-org-match.ts <orgId> lloyds "help the homeless" martin
//
// Mirrors preflight-match.ts exactly — same query, same gates, same scorer. If
// they ever diverge this script is lying, so keep them in step.
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

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const CANONICAL_TYPES = new Set(['grant', 'programme', 'investment', 'in_kind'])
const BROAD_LOCATION = new Set(['uk', 'uk-wide', 'england', 'nationwide', 'national', 'uk wide', 'all uk'])

async function main() {
  const [orgId, ...needles] = process.argv.slice(2)
  if (!orgId) { console.error('Usage: npx tsx scripts/trace-org-match.ts <orgId> [needle...]'); process.exit(1) }

  const { data: org } = await supabase.from('organisations').select('*').eq('id', orgId).single()
  const typedOrg = org as Organisation
  const orgStructure = typedOrg.legal_structure
  const orgLocation = (typedOrg.primary_location ?? '').toLowerCase().trim()
  const sectorSet = new Set((typedOrg.impact_sectors ?? []) as string[])
  const benefSet = new Set((typedOrg.beneficiary_groups ?? []) as string[])

  const today = new Date().toISOString().split('T')[0]
  const { data: rows } = await supabase
    .from('grants_with_funder')
    .select('*')
    .eq('is_active', true)
    .neq('url_status', 'dead')
    .or(`is_rolling.eq.true,deadline.is.null,deadline.gte.${today},next_open_date_parsed.gte.${today}`)
    .order('last_seen_at', { ascending: false })
    .limit(1000)

  function locationPasses(geoScope: string[] | undefined): boolean {
    if (!orgLocation || !geoScope || geoScope.length === 0) return true
    return geoScope.some(s => {
      const sl = s.toLowerCase()
      return BROAD_LOCATION.has(sl) || sl.includes(orgLocation) || orgLocation.includes(sl)
    })
  }

  type Traced = { title: string; funder: string; type: string; verdict: string; score: number; sectors: string[]; benefs: string[]; detail?: string }
  const traced: Traced[] = []
  const scored: Traced[] = []

  for (const row of rows ?? []) {
    const g = normaliseScrapedGrant(row as Record<string, unknown>)
    const ge = g as typeof g & { impactSectors?: string[]; geoScope?: string[]; targetBeneficiaries?: string[] }
    const rec: Traced = {
      title: g.title, funder: g.funder ?? '', type: (g.fundingType ?? 'grant') as string,
      verdict: '', score: 0,
      sectors: ge.impactSectors ?? [],
      benefs: (row as Record<string, unknown>).target_beneficiaries as string[] ?? [],
    }

    if (!CANONICAL_TYPES.has(rec.type)) rec.verdict = 'GATED: funding type'
    else if (orgStructure && g.eligibleStructures?.length && !g.eligibleStructures.includes(orgStructure)) rec.verdict = 'GATED: structure'
    else if (!locationPasses(ge.geoScope)) rec.verdict = `GATED: location (${(ge.geoScope ?? []).join('/')})`
    else if (sectorSet.size > 0 && ge.impactSectors?.length && !ge.impactSectors.some(s => sectorSet.has(s))) {
      // The interesting failure: sector is a HARD gate, beneficiaries are not
      // consulted at all. A fund whose stated beneficiaries match the org
      // exactly is dropped here if its sector tags happen to miss.
      const benefOverlap = rec.benefs.filter(b => benefSet.has(b))
      rec.verdict = `GATED: sector [${rec.sectors.join(',')}]${benefOverlap.length ? `  <-- but beneficiaries MATCH: ${benefOverlap.join(', ')}` : ''}`
    } else {
      const r = computeMatchScore(g, typedOrg)
      rec.score = r.score
      rec.verdict = 'scored'
      // Per-dimension breakdown: a low total is either a weak fit everywhere or
      // one dimension scoring zero and dragging the rest down. Only the
      // breakdown tells you which, and they need opposite fixes.
      rec.detail = Object.entries(r.breakdown as unknown as Record<string, { score: number; max: number } | undefined>)
        .filter(([, v]) => v && typeof v.score === 'number')
        .map(([k, v]) => `${k} ${v!.score}/${v!.max}`).join('   ')
        + (r.warnReasons?.length ? `\n   warn: ${r.warnReasons.join('; ')}` : '')
      scored.push(rec)
    }
    traced.push(rec)
  }

  scored.sort((a, b) => b.score - a.score)
  const rankOf = (t: Traced) => scored.findIndex(s => s.title === t.title && s.funder === t.funder) + 1

  const hits = needles.length
    ? traced.filter(t => needles.some(n => `${t.funder} ${t.title}`.toLowerCase().includes(n.toLowerCase())))
    : traced.filter(t => t.verdict.startsWith('GATED: sector') && t.verdict.includes('beneficiaries MATCH'))

  console.log(`\nORG ${typedOrg.name} — sectors [${Array.from(sectorSet).join(', ')}], beneficiaries [${Array.from(benefSet).join(', ')}]`)
  console.log(`scanned ${rows?.length ?? 0}, scored ${scored.length}\n`)
  for (const h of hits) {
    const where = h.verdict === 'scored' ? `${h.score}%  rank ${rankOf(h)} of ${scored.length}` : h.verdict
    console.log(`${h.funder} — ${h.title}\n   ${where}${h.detail ? `\n   ${h.detail}` : ''}`)
  }

  // `general_public` is a near-universal tag, so an overlap on it alone is not
  // evidence of anything — a clean-energy innovation prize and a homelessness
  // charity both "serve the general public". Splitting on that is the whole
  // question: a SPECIFIC beneficiary overlap is real evidence the sector gate
  // got it wrong, and a general_public-only overlap is not.
  const GENERIC = new Set(['general_public'])
  const benefBlocked = traced.filter(t => t.verdict.includes('beneficiaries MATCH'))
  const specific = benefBlocked.filter(t => t.benefs.some(b => benefSet.has(b) && !GENERIC.has(b)))
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`Gated on sector despite ANY beneficiary overlap : ${benefBlocked.length}`)
  console.log(`  ...of which the overlap is general_public only: ${benefBlocked.length - specific.length}  (correctly dropped)`)
  console.log(`  ...of which a SPECIFIC group overlaps         : ${specific.length}  (arguably wrong to drop)\n`)
  // What would rescuing them actually surface? Score them anyway. If the
  // out-of-area ones land low the rescue is safe — the location cap already
  // buries them — and only the genuinely relevant ones rise.
  const rescued = specific.map(s => {
    const row = (rows ?? []).find(r => (r as Record<string, unknown>).title === s.title)
    if (!row) return { ...s, wouldScore: 0 }
    const g = normaliseScrapedGrant(row as Record<string, unknown>)
    return { ...s, wouldScore: computeMatchScore(g, typedOrg).score }
  }).sort((a, b) => b.wouldScore - a.wouldScore)

  const band = (lo: number, hi: number) => rescued.filter(r => r.wouldScore >= lo && r.wouldScore < hi).length
  console.log(`If rescued, they would score:  >=70: ${band(70, 101)}   55-69: ${band(55, 70)}   40-54: ${band(40, 55)}   <40: ${band(0, 40)}`)
  console.log(`(the dashboard shows >=55; anything below is invisible anyway)\n`)
  for (const s of rescued.slice(0, 22)) {
    const overlap = s.benefs.filter(b => benefSet.has(b) && !GENERIC.has(b))
    console.log(`  ${String(s.wouldScore).padStart(3)}%  ${(s.funder ?? '').slice(0, 36).padEnd(36)} ${overlap.join(', ').padEnd(32)} [${s.sectors.join(',')}]`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
