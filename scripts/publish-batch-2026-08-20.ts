// A first batch for Paul to check before anything goes live.
//
// 59 of the 91 queue rows carry no blocking reason at all, and auto-publish has
// been evaluating them every morning in dry-run mode since it shipped. Paul:
// "do a batch first so i can check them."
//
// So this SELECTS and PRINTS. It publishes nothing. `--apply` exists and is not
// run until he has read the list.
//
// RANKED BY EVIDENCE, not by convenience. A row qualifies only if the gate is
// clean AND the engine actually read its page AND the brief is real rather than
// a stub — because "nothing blocking" is a statement about our reasons, not
// about whether a fundraiser landing on the card could do anything with it.
// That distinction is the one CLAUDE.md opens with.
//
// Free: stored data only, no page reads, no model calls.
//
//   npx tsx --env-file=.env.local scripts/publish-batch-2026-08-20.ts
//   npx tsx --env-file=.env.local scripts/publish-batch-2026-08-20.ts --apply
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { deriveReviewReasons, type ReviewRow } from '../src/lib/admin/review-reasons'
import { gateDecision } from '../src/lib/admin/publish-gate'

const APPLY = process.argv.includes('--apply')
const SIZE = 10
const SOURCE = 'user_verified:first-publish-batch-2026-08-20'

type Row = ReviewRow & {
  pipeline_state: string; funder: string | null; funding_type: string | null
  apply_url: string | null; amount_min: number | null; amount_max: number | null
  deadline: string | null; is_rolling: boolean | null
  funder_brief: Record<string, unknown> | null
  field_evidence: Record<string, { note?: unknown; checked_at?: unknown; agrees?: unknown }> | null
}

const STUB = ['knowledge_fallback', 'desk_research']

/**
 * SCOPE COMES BEFORE COMPLETENESS.
 *
 * The first run of this script offered "Child Focused Court IDVA — Cheshire &
 * Merseyside", £609,957 from a police and crime commissioner, scoring 7/7 on
 * evidence. Every field was present and the gate had nothing against it. It is
 * also the exact row Paul opened in the review queue on 18 August, and the reason
 * the gov.uk crawl was switched off: a commissioned service contract, not
 * something a charity applies to a funder for.
 *
 * The score measures whether the DATA is complete. It says nothing about whether
 * a fundraiser landing on the card could apply, which is the only question that
 * matters — CLAUDE.md opens with exactly this distinction and I walked into it.
 *
 * So: a public-body row does not enter a publish batch on completeness alone.
 * Its `who_can_apply` gets read first, by a person.
 */
const OUT_OF_BATCH_SOURCES = ['gov_uk']
const PUBLIC_BODY = /police and crime|crime commissioner|department for|ministry of|\bDCMS\b|\bDWP\b|\bDefra\b|council$/i

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const today = new Date().toISOString().slice(0, 10)

  const { data, error } = await db.from('scraped_grants').select('*')
    .in('pipeline_state', ['captured', 'enriched', 'tagged', 'tagged_awaiting_review']).limit(500)
  if (error) { console.error(error.message); process.exit(1) }
  const rows = (data ?? []) as unknown as Row[]

  const scored = rows
    .map(r => ({ r, gate: gateDecision(r, deriveReviewReasons(r, today)) }))
    .filter(x => x.gate.blocking.length === 0)
    .filter(x => !OUT_OF_BATCH_SOURCES.includes(String((x.r as unknown as { source?: string }).source ?? '')))
    .filter(x => !PUBLIC_BODY.test(x.r.funder ?? ''))
    .map(({ r, gate }) => {
      const brief = r.funder_brief ?? {}
      const pageRead = r.field_evidence?._page_read
      const readOk = pageRead?.note === 'verified'
      const briefReal = typeof brief.source === 'string' && !STUB.includes(brief.source)
      const who = typeof brief.who_can_apply === 'string' && brief.who_can_apply.length > 40
      const structures = (r.eligible_structures ?? []).length > 0
      const sectors = (r.impact_sectors ?? []).length > 0
      const timing = r.deadline !== null || r.is_rolling === true || typeof brief.how_to_apply === 'string'
      const amountOrHonest = r.amount_max !== null || r.amount_min !== null || typeof brief.typical_award === 'string'
      const score = [readOk, briefReal, who, structures, sectors, timing, amountOrHonest].filter(Boolean).length
      return { r, score, readOk, briefReal, who, structures, sectors, timing, amountOrHonest,
               info: gate.informational.map(i => i.code) }
    })
    .sort((a, b) => b.score - a.score || (a.r.title ?? '').localeCompare(b.r.title ?? ''))

  const publicBodyHeld = rows.filter(r =>
    OUT_OF_BATCH_SOURCES.includes(String((r as unknown as { source?: string }).source ?? ''))
    || PUBLIC_BODY.test(r.funder ?? '')).length
  console.log(`\nqueue rows eligible for a batch  : ${scored.length}`)
  console.log(`held back, public body or gov.uk : ${publicBodyHeld}  (scope read first, see the note in this file)`)
  console.log(`of those, page read + real brief : ${scored.filter(s => s.readOk && s.briefReal).length}`)
  console.log(`\n── proposed first batch of ${SIZE}, strongest evidence first\n`)

  const batch = scored.slice(0, SIZE)
  for (const s of batch) {
    const r = s.r
    const money = r.amount_max ? `up to £${r.amount_max.toLocaleString('en-GB')}` : (r.amount_min ? `from £${r.amount_min.toLocaleString('en-GB')}` : 'no amount stated')
    const when = r.deadline ? `closes ${r.deadline}` : r.is_rolling ? 'rolling' : 'no date'
    console.log(`  ${r.title?.slice(0, 58)}`)
    console.log(`      ${r.funder ?? '—'}  ·  ${r.funding_type ?? 'grant'}  ·  ${money}  ·  ${when}`)
    console.log(`      ${r.apply_url}`)
    console.log(`      evidence ${s.score}/7  ${[!s.readOk && 'page not read', !s.briefReal && 'stub brief', !s.who && 'thin who-can-apply', !s.structures && 'no structures', !s.sectors && 'no sectors', !s.timing && 'no timing', !s.amountOrHonest && 'no amount'].filter(Boolean).join(', ') || 'complete'}`)
    if (s.info.length) console.log(`      notes: ${s.info.join(', ')}`)
    console.log()
  }

  if (!APPLY) { console.log('Nothing published. Re-run with --apply once Paul has said yes.\n'); return }

  let published = 0
  for (const s of batch) {
    const r = await mergeGrantUpdate({
      id: s.r.id, fields: { pipeline_state: 'published', is_active: true }, source: SOURCE, db,
      citations: { pipeline_state: { snippet: `First hand-checked publish batch, ${today}. Gate clean, page read, brief complete.`, confidence: 'high' } },
    })
    if (r.applied.length) published++
  }
  console.log(`\npublished: ${published}/${batch.length}`)
  const { data: after } = await db.from('scraped_grants').select('title, is_active, pipeline_state').in('id', batch.map(b => b.r.id))
  const notLive = (after ?? []).filter(a => !(a as { is_active: boolean }).is_active)
  console.log(`not live afterwards: ${notLive.length}`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
