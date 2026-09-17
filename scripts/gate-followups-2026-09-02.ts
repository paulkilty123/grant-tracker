// Four row actions from Paul's 2 September rulings. No model call; one free
// page read for Angels' Den already done by hand (the £120,000 is the pool).
//
//   Law Society Pro Bono Charter   reject, out_of_scope: a page addressed to the giver
//   CAF Bank Secured Loans         funding_subtype loan, then publish (Investment tab)
//   A&O Shearman Global Grants     archive on its quote, the way the removal actuator does
//   Angels' Den 2026               null the £120,000: a pool, under the seventeen rule
//
//   npx tsx --env-file=.env.local scripts/gate-followups-2026-09-02.ts          dry run
//   APPLY=1 npx tsx --env-file=.env.local scripts/gate-followups-2026-09-02.ts  write

import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { buildEvidencePatch, recordFieldEvidence } from '../src/lib/field-evidence'
import { formatRejectReason } from '../src/lib/admin/reject-reasons'
import { deriveReviewReasons, type ReviewRow } from '../src/lib/admin/review-reasons'
import { gateDecision } from '../src/lib/admin/publish-gate'

const APPLY = process.env.APPLY === '1'
const SOURCE = 'user_verified:gate-followups-2026-09-02'
const NOW = new Date().toISOString()
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const db = createClient(URL_, KEY)

const LAW = '71609919-6bc4-4bd1-bea5-a2d89007c92c'
const CAF = '082947f9-16c2-47b7-804d-5d64ada6debf'
const AO  = 'bd72165c-9f44-4935-9b50-d6bed81def8e'
const AD  = 'cbad88ec-2eed-40b8-a1f2-1c05cb023dbc'
const AO_QUOTE = 'We are no longer accepting applications for the Global Grants Program.'
const AD_QUOTE = 'Six visionary entrepreneurs have generously donated a total of £60,000 to support charities in the County. This is matched by The Clare Foundation, bringing the total to £120,000.'
const AD_URL = 'https://theclarefoundation.org/angels-den-2026'

async function patch(id: string, body: Record<string, unknown>, what: string) {
  const res = await fetch(`${URL_}/rest/v1/scraped_grants?id=eq.${id}`, {
    method: 'PATCH', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(body),
  })
  const rows = await res.json()
  if (!res.ok || !Array.isArray(rows) || rows.length !== 1) throw new Error(`${what}: write failed ${res.status} ${JSON.stringify(rows).slice(0, 200)}`)
}

async function main() {
  const { data } = await db.from('scraped_grants').select('*').in('id', [LAW, CAF, AO, AD])
  if ((data ?? []).length !== 4) throw new Error(`expected 4 rows, got ${data?.length}`)
  const by = Object.fromEntries(data!.map(r => [r.id, r]))
  const law = by[LAW], caf = by[CAF], ao = by[AO], ad = by[AD]

  // Preconditions: the state each ruling was made against.
  if (law.is_active !== false || law.pipeline_state !== 'tagged') throw new Error('Law Society moved')
  if (caf.is_active !== false || caf.funding_type !== 'investment' || caf.funding_subtype !== null) throw new Error('CAF Bank moved')
  if (ao.is_active !== true || ao.field_evidence?.still_listed?.quote !== AO_QUOTE) throw new Error('A&O moved or the quote changed')
  if (ad.is_active !== true || ad.amount_max !== 120000 || ad.amount_min !== null) throw new Error('Angels Den moved')

  const lawReason = formatRejectReason('out_of_scope', 'a page addressed to the giver: a charter for law firms to sign, not funding a charity can apply for')
  console.log(`Law Society: reject → ${lawReason}`)
  console.log(`CAF Bank: funding_subtype loan, saved_for_later off, publish`)
  console.log(`A&O Shearman: archive, "${AO_QUOTE}"`)
  console.log(`Angels' Den: amount_max 120000 → null (pool), "${AD_QUOTE.slice(0, 80)}…"`)
  if (!APPLY) { console.log('\nDRY RUN, nothing written. APPLY=1 to write.'); return }

  const landed: string[] = []
  await patch(LAW, { is_active: false, pipeline_state: 'rejected', rejection_reason: lawReason, saved_for_later: false }, 'Law Society')
  landed.push('Law Society Pro Bono Charter: rejected, out of scope')

  const sub = await mergeGrantUpdate({ id: CAF, fields: { funding_subtype: 'loan' }, source: SOURCE, db })
  if (!sub.applied.includes('funding_subtype')) throw new Error(`CAF subtype not applied ${JSON.stringify(sub.rejected)}`)
  await patch(CAF, { saved_for_later: false }, 'CAF release')
  const pub = await mergeGrantUpdate({ id: CAF, fields: { is_active: true, pipeline_state: 'published' }, source: SOURCE, db })
  if (!pub.applied.includes('is_active') || !pub.applied.includes('pipeline_state')) throw new Error(`CAF publish did not land ${JSON.stringify(pub)}`)
  landed.push('CAF Bank Secured Loans: subtype loan, published')

  await patch(AO, { is_active: false, pipeline_state: 'archived', rejection_reason: `no_longer_listed: ${AO_QUOTE}` }, 'A&O archive')
  landed.push('A&O Shearman Global Grants: archived on its quote')

  const prov = { pinned: false, set_at: NOW, source: SOURCE, citation: { confidence: 'high', snippet: AD_QUOTE, url: AD_URL }, previous: { amount_max: 120000 }, why: 'the £120,000 is the pool across ten charities; no per-charity figure is stated' }
  await patch(AD, { amount_max: null, field_provenance: { ...(ad.field_provenance ?? {}), amount_max: prov } }, 'Angels Den null')
  const { patch: evp } = buildEvidencePatch([{ field: 'amount_max', agrees: null, quote: AD_QUOTE, source_url: AD_URL, note: 'we state a figure this page does not' }], { by: SOURCE })
  await recordFieldEvidence({ id: AD, patch: evp, db })
  const fb = { ...(ad.funder_brief ?? {}), _ungrounded_amounts: [] }
  await mergeGrantUpdate({ id: AD, fields: { funder_brief: fb }, source: SOURCE, db })
  landed.push('Angels\' Den 2026: £120,000 → null, pool recorded')

  console.log('\nLANDED'); for (const l of landed) console.log(`  ${l}`)
  const { data: after } = await db.from('scraped_grants').select('*').in('id', [LAW, CAF, AO, AD])
  for (const r of after ?? []) console.log(`  ${r.title}: active=${r.is_active} state=${r.pipeline_state} gate=${gateDecision(r as ReviewRow).outcome} codes=${deriveReviewReasons(r as ReviewRow).map(c => c.code).join(',')}`)
}
main().catch(e => { console.error(e.message); process.exit(1) })
