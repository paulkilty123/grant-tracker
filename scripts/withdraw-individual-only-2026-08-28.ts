// Ten live rows that only fund individuals, withdrawn.
//
// Every one carries eligible_structures ["individual"] and a who_can_apply that
// says so in the funder's own terms: students in Monmouthshire, residents of
// Barrhill, individual social entrepreneurs. This catalogue's audience is UK
// charities, CICs and social enterprises, so none of these can ever be applied
// for by a user, and a row nobody can act on is worse than an absent one.
//
// `out_of_scope` is the reason code that fits exactly: real funding, not for the
// organisations we serve.
//
// Note on UnLtd: its link was corrected hours earlier in the wrong-fund pass.
// That was right about the link and does not change who can apply. The awards go
// to individual social entrepreneurs.
//
//   npx tsx --env-file=.env.local scripts/withdraw-individual-only-2026-08-28.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { formatRejectReason } from '../src/lib/admin/reject-reasons'
import { deriveReviewReasons, type ReviewRow } from '../src/lib/admin/review-reasons'
import { gateDecision } from '../src/lib/admin/publish-gate'

const APPLY = process.argv.includes('--apply')
const COLS = ['id','external_id','title','funder','apply_url','funding_index_url','is_active','pipeline_state','url_status','url_quality_score','amount_min','amount_max','deadline','is_rolling','next_open_date','deadline_cycle','eligible_structures','impact_sectors','target_beneficiaries','niche_tags','funding_type','funder_type','location_tag','is_local','grant_sources','funder_brief','field_provenance','raw_data','needs_intervention_reason','field_evidence','last_seen_at','first_seen_at','source'].join(', ')

async function main() {
  const db = getAdminDb()
  const rows: any[] = []
  for (let from = 0; from < 5000; from += 500) {
    const { data, error } = await db.from('scraped_grants').select(COLS)
      .eq('is_active', true).not('pipeline_state', 'in', '("rejected","archived")').order('id').range(from, from + 499)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if ((data ?? []).length < 500) break
  }

  const targets = rows.filter(r =>
    gateDecision(r as ReviewRow).blocking.some(b => b.code === 'applicant_individual_only'))

  console.log(`${targets.length} rows${APPLY ? '' : ' (DRY RUN)'}\n`)

  for (const r of targets) {
    // The row's own eligibility sentence is the evidence, so the reason carries
    // it rather than asserting the finding a second time in my words.
    const who = String((r.funder_brief ?? {}).who_can_apply ?? '').replace(/\s+/g, ' ').slice(0, 200)
    const reason = formatRejectReason('out_of_scope',
      `Funds individuals rather than organisations, so no user of this catalogue can apply. `
      + `The row's own eligibility reads: "${who}"`)

    if (!APPLY) { console.log(`[dry] ${r.title}`); continue }

    const res = await mergeGrantUpdate({
      id: r.id, db,
      fields: { is_active: false, pipeline_state: 'rejected', rejection_reason: reason },
      source: 'system:individual-only-2026-08-28',
    })
    const ok = res.applied.includes('pipeline_state')
    console.log(`${ok ? 'withdrawn' : 'NOT WITHDRAWN'}  ${r.title}${ok ? '' : ' ' + JSON.stringify(res.rejected)}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
