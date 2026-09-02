// Paul, 2026-09-02 evening: "Emergency Essentials: reject, out of scope under
// the audience rule. Angels' Den: hide it today as round closed on its own
// description, watchlisted."
//
// Emergency Essentials is written the way the Reject button writes. Angels'
// Den is written the way the removal actuator writes a round_closed verdict:
// is_active false, pipeline_state between_rounds_scheduled, which the
// migration-057 trigger turns into a watchlist entry so a reopened round
// brings the row back. The quote is the row's own description, and the
// deadline stamp records it so the evidence says why.
//
//   npx tsx --env-file=.env.local scripts/close-two-2026-09-02.ts          dry run
//   APPLY=1 npx tsx --env-file=.env.local scripts/close-two-2026-09-02.ts  write

import { createClient } from '@supabase/supabase-js'
import { formatRejectReason } from '../src/lib/admin/reject-reasons'
import { buildEvidencePatch, recordFieldEvidence } from '../src/lib/field-evidence'

const APPLY = process.env.APPLY === '1'
const SOURCE = 'user_verified:close-two-2026-09-02'
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const db = createClient(URL_, KEY)
const EE = 'f83ffef7-affe-4a69-878f-aa5213b54c5a'
const AD = 'cbad88ec-2eed-40b8-a1f2-1c05cb023dbc'
const AD_QUOTE = 'Live pitch event at The Elgiva, Chesham, 9 September 2026. Deadline 11 May 2026.'

async function patch(id: string, body: Record<string, unknown>, what: string) {
  const res = await fetch(`${URL_}/rest/v1/scraped_grants?id=eq.${id}`, {
    method: 'PATCH', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(body),
  })
  const rows = await res.json()
  if (!res.ok || !Array.isArray(rows) || rows.length !== 1) throw new Error(`${what}: write failed ${res.status} ${JSON.stringify(rows).slice(0, 200)}`)
}

async function main() {
  const { data } = await db.from('scraped_grants').select('id,title,funder,is_active,pipeline_state,description,deadline,saved_for_later,apply_url').in('id', [EE, AD])
  const by = Object.fromEntries((data ?? []).map(r => [r.id, r]))
  const ee = by[EE], ad = by[AD]
  if (!ee || ee.is_active !== false || ee.pipeline_state !== 'tagged') throw new Error('Emergency Essentials moved')
  if (!ad || ad.is_active !== true || ad.deadline !== '2026-09-09') throw new Error('Angels Den moved')
  if (!String(ad.description).includes('Deadline 11 May 2026')) throw new Error('Angels Den description no longer states the May deadline')
  const eeReason = formatRejectReason('out_of_scope', 'only registered referral agencies apply, on behalf of individual children; organisations cannot apply directly')
  console.log(`Emergency Essentials: reject → ${eeReason}`)
  console.log(`Angels' Den: is_active false, between_rounds_scheduled, quote "${AD_QUOTE}"`)
  if (!APPLY) { console.log('\nDRY RUN, nothing written.'); return }

  await patch(EE, { is_active: false, pipeline_state: 'rejected', rejection_reason: eeReason, saved_for_later: false }, 'Emergency Essentials')
  await patch(AD, { is_active: false, pipeline_state: 'between_rounds_scheduled' }, 'Angels Den')
  const { patch: evp } = buildEvidencePatch([{ field: 'deadline', agrees: false, proposed: '2026-05-11', quote: AD_QUOTE, source_url: ad.apply_url, note: 'round closed on its own description; 9 September is the pitch event' }], { by: SOURCE })
  await recordFieldEvidence({ id: AD, patch: evp, db })

  const { data: after } = await db.from('scraped_grants').select('title,is_active,pipeline_state,rejection_reason').in('id', [EE, AD])
  console.log('\nLANDED'); for (const r of after ?? []) console.log(`  ${r.title}: active=${r.is_active} state=${r.pipeline_state} ${r.rejection_reason ?? ''}`)
  const { data: wl, error } = await db.from('funder_watchlist').select('*').or(`grant_id.eq.${AD},funder.ilike.%Clare Foundation%`).limit(3)
  console.log(`watchlist rows for Angels' Den: ${error ? 'ERROR ' + error.message : (wl ?? []).length}`)
}
if (process.env.FIX_DEADLINE !== '1') main().catch(e => { console.error(e.message); process.exit(1) })

// ── Addendum, same evening ──────────────────────────────────────────────────
// `between_rounds_scheduled` rows stay reachable on purpose (public-visibility.ts):
// the page renders "closed, expected back" from a PAST deadline. With the
// deadline still 9 September the page showed a live countdown, so the deadline
// itself is corrected to the date the description states. user_verified (70)
// outranks the LinkedIn scraper (40) that wrote 9 September.
export async function fixDeadline() {
  const { mergeGrantUpdate } = await import('../src/lib/grant-merge')
  const res = await mergeGrantUpdate({ id: AD, fields: { deadline: '2026-05-11' }, source: SOURCE, db })
  if (!res.applied.includes('deadline')) throw new Error(`deadline not applied ${JSON.stringify(res.rejected)}`)
  console.log('Angels\' Den deadline: 2026-09-09 → 2026-05-11')
}
if (process.env.FIX_DEADLINE === '1') fixDeadline().catch(e => { console.error(e.message); process.exit(1) })
