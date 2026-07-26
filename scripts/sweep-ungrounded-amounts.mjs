// Read-only confidence sweep: runs the enrich-grant numeric-grounding logic
// (extractMoneyAmounts / detectUngroundedAmounts — mirror of the shipped guard)
// over every stored funder_brief, and reports any typical_award figure NOT
// grounded in its own citation snippet + the original scrape. No writes.
//
// Purpose (18 Jun launch-claims honesty pass): has any ungrounded amount ever
// slipped past human review into the LIVE set? LIVE flagged rows are the
// concern; captured/tagged (in-queue) flagged rows are review doing its job.
//
//   node scripts/sweep-ungrounded-amounts.mjs
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n')
    .map(l => l.trim()).filter(l => l && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, '')] }),
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

function extractMoneyAmounts(text) {
  if (!text) return []
  const out = []
  const re = /£\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s?(k|m|bn|million|billion)?(?![a-z])/gi
  let m
  while ((m = re.exec(text))) {
    let n = parseFloat(m[1].replace(/,/g, ''))
    const s = (m[2] ?? '').toLowerCase()
    if (s === 'k') n *= 1e3
    else if (s === 'm' || s === 'million') n *= 1e6
    else if (s === 'bn' || s === 'billion') n *= 1e9
    if (Number.isFinite(n) && n > 0) out.push(Math.round(n))
  }
  return out
}
function detectUngrounded(value, ground) {
  const stated = extractMoneyAmounts(value)
  if (!stated.length) return []
  const g = extractMoneyAmounts(ground)
  return stated.filter(a => { const tol = Math.max(a * 0.1, 1000); return !g.some(x => Math.abs(x - a) <= tol) })
}

// published (live) + captured/tagged (review queue); archived rejects don't matter
const states = ['published', 'captured', 'tagged']
let all = []
for (const st of states) {
  const { data, error } = await sb
    .from('scraped_grants')
    .select('id, funder, title, pipeline_state, is_active, funder_brief, description, eligibility_criteria, amount_min, amount_max')
    .eq('pipeline_state', st)
    .not('funder_brief', 'is', null)
    .limit(2000)
  if (error) { console.error(st, error.message); process.exit(1) }
  all = all.concat(data)
}

// Hallucination signature = the enriched typical_award materially INFLATES the
// amount the source (original scrape) states. Only comparable when BOTH the
// scrape and typical_award contain figures; "amount absent from a short
// description" is NOT evidence of error (the page may state it; review + the
// live page verify). Conservative thresholds keep this high-signal: enriched
// max must exceed the scrape max by >2x AND by >£20,000.
const flagged = []
for (const g of all) {
  const fb = g.funder_brief || {}
  const ta = fb.typical_award
  if (typeof ta !== 'string') continue
  const elig = Array.isArray(g.eligibility_criteria) ? g.eligibility_criteria.join('  ') : (g.eligibility_criteria || '')
  const descA = extractMoneyAmounts(`${g.description || ''}  ${elig}`)
  const taA = extractMoneyAmounts(ta)
  if (descA.length === 0 || taA.length === 0) continue
  const descMax = Math.max(...descA)
  const taMax = Math.max(...taA)
  if (taMax > descMax * 2 && (taMax - descMax) > 20000) {
    const live = g.is_active && g.pipeline_state === 'published'
    const amountBled = g.amount_max != null && g.amount_max > descMax * 2 && (g.amount_max - descMax) > 20000
    flagged.push({ live, state: g.pipeline_state, active: g.is_active, id: g.id, funder: g.funder, title: g.title, descMax, taMax, amount_max: g.amount_max, amountBled, ta, descr: (g.description || '').slice(0, 160) })
  }
}
flagged.sort((a, b) => (b.live - a.live) || (b.taMax / b.descMax - a.taMax / a.descMax))

const scanned = all.filter(g => typeof g.funder_brief?.typical_award === 'string').length
const liveFlagged = flagged.filter(f => f.live)
const bled = flagged.filter(f => f.amountBled)
console.log(`Scanned ${scanned} briefs across ${states.join('/')}. Inflation-flagged ${flagged.length} (LIVE: ${liveFlagged.length}). amount_max ALSO inflated (real data error): ${bled.length}.\n`)
for (const f of flagged) {
  console.log(`${f.live ? '🔴 LIVE' : '⚪ queue'} ${f.amountBled ? '⚠️ AMOUNT_MAX BLED' : '(text only)'}  ${f.funder} — ${f.title}`)
  console.log(`   scrape max £${f.descMax.toLocaleString()}  →  typical_award max £${f.taMax.toLocaleString()}  |  amount_max=${f.amount_max == null ? 'null' : '£' + f.amount_max.toLocaleString()}`)
  console.log(`   typical_award: ${f.ta.slice(0, 200)}`)
  console.log(`   id: ${f.id}\n`)
}
