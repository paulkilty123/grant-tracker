// Fill the prog_* columns (length, format, next start) from the programme
// brief text already on the row. No page reads, no model: plain pattern
// matching over time_commitment, decision_timeline and what_they_fund, and
// a value is written only when the text is unambiguous. Never overwrites a
// column that already has a value.
//
//   npx tsx --env-file=.env.local scripts/fill-programme-columns-2026-09-15.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'

const APPLY = process.argv.includes('--apply')
const SRC = 'system:programme-columns-2026-09-15'
const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, eighteen: 18, twenty: 20 }
const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december']

function weeksFrom(text: string): number | null {
  const t = text.toLowerCase()
  const m = t.match(/\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|eighteen|twenty)[- ](week|month)s?\b/)
  if (!m) return null
  const n = WORDS[m[1]] ?? Number(m[1])
  if (!n) return null
  return m[2] === 'month' ? n * 4 : n
}

function modeFrom(text: string): 'remote' | 'in_person' | 'hybrid' | null {
  const t = text.toLowerCase()
  const online = /\b(online|virtual|remote|self[- ]paced|zoom|webinar)\b/.test(t)
  const person = /\b(in[- ]person|face[- ]to[- ]face|residential|on[- ]site|in london|in manchester|in glasgow|in edinburgh|in bristol|in birmingham|venue)\b/.test(t)
  if (online && person) return 'hybrid'
  if (online) return 'remote'
  if (person) return 'in_person'
  return null
}

function startFrom(text: string, now: Date): string | null {
  // "runs 1 March to 2 April 2027", "first session 28 October", "starts 12 January 2027"
  const t = text.toLowerCase()
  const m = t.match(/\b(?:first session|starts?|begins?|launch(?:es)?|runs? (?:from )?|programme runs )\s*(?:on |online |in person )?(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+(\d{4}))?/)
  // An explicit year is required. A bare "1 April" could be last cohort's date
  // and bumping it a year would be a guess dressed as a fact.
  if (!m || !m[3]) return null
  const day = Number(m[1]); const month = MONTHS.indexOf(m[2]) + 1; const year = Number(m[3])
  if (new Date(Date.UTC(year, month - 1, day)).getTime() < now.getTime() - 14 * 86_400_000) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

async function main() {
  const db = getAdminDb()
  const { data: rows, error } = await db.from('scraped_grants')
    .select('id, title, funder_brief, prog_length_weeks, prog_location_mode, prog_next_cohort_start, field_provenance')
    .eq('funding_type', 'programme').eq('is_active', true).eq('pipeline_state', 'published').order('title')
  if (error) throw error
  const now = new Date()
  let touched = 0
  for (const r of rows ?? []) {
    const b = (r.funder_brief ?? {}) as Record<string, unknown>
    const s = (k: string) => (typeof b[k] === 'string' ? (b[k] as string) : '')
    const timing = [s('time_commitment'), s('decision_timeline'), s('what_they_fund')].join(' ')
    const patch: Record<string, unknown> = {}
    const prov: Record<string, unknown> = {}
    const note = (why: string) => ({ pinned: false, set_at: now.toISOString(), source: SRC, note: why })
    if (r.prog_length_weeks == null) { const w = weeksFrom(s('time_commitment') || s('what_they_fund')); if (w) { patch.prog_length_weeks = w; prov.prog_length_weeks = note('from time_commitment / what_they_fund text') } }
    if (r.prog_location_mode == null) { const m = modeFrom(timing + ' ' + s('programme_offer')); if (m) { patch.prog_location_mode = m; prov.prog_location_mode = note('from brief text: online / in person wording') } }
    if (r.prog_next_cohort_start == null) { const d = startFrom(s('decision_timeline') + ' ' + s('time_commitment'), now); if (d) { patch.prog_next_cohort_start = d; prov.prog_next_cohort_start = note('from decision_timeline / time_commitment text') } }
    const keys = Object.keys(patch)
    console.log(`${keys.length ? '+' : '='} ${r.title}: ${keys.map(k => `${k}=${patch[k]}`).join(', ') || 'nothing derivable'}`)
    if (keys.length) touched++
    if (APPLY && keys.length) {
      const { error: uErr } = await db.from('scraped_grants').update({ ...patch, field_provenance: { ...((r.field_provenance ?? {}) as Record<string, unknown>), ...prov } }).eq('id', r.id)
      if (uErr) console.log(`   WRITE FAILED ${uErr.message}`)
    }
  }
  console.log(`\n${touched} rows ${APPLY ? 'updated' : 'would update'} of ${rows?.length ?? 0}`)
}
main().catch(e => { console.error(e); process.exit(1) })
