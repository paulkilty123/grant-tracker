/**
 * Re-tag target_beneficiaries on live rows with the v4 beneficiary rules.
 *
 *   npx tsx --env-file=.env.local scripts/retag-beneficiaries-2026-09-16.ts --ids a,b,c [--write]
 *   npx tsx --env-file=.env.local scripts/retag-beneficiaries-2026-09-16.ts --all [--write]
 *
 * Writes ONLY target_beneficiaries (with its citation), never sectors or
 * structures: a beneficiary rule change should not move anything else.
 * Skips rows whose tags are admin- or user-verified (the ladder would refuse
 * them anyway; skipping saves the read). Dry by default: prints before/after.
 * Spend: one Haiku call per batch of 8 rows, reading stored text only.
 */
import { getAdminDb } from '@/lib/admin/admin-db'
import { classifyBatch, VALID_BENEFICIARIES, type GrantInput } from '@/lib/classify'
import { mergeGrantUpdate } from '@/lib/grant-merge'

const SOURCE = 'ai_classifier:v4-beneficiaries'
const args = process.argv.slice(2)
const write = args.includes('--write')
const idsArg = args[args.indexOf('--ids') + 1]
const all = args.includes('--all')
if (!idsArg && !all) { console.log('give --ids a,b,c or --all'); process.exit(1) }

async function main() {
  const db = getAdminDb()
  let q = db.from('scraped_grants').select('id, title, funder, description, funder_brief, target_beneficiaries, field_provenance').eq('is_active', true).eq('pipeline_state', 'published')
  if (idsArg) q = q.in('id', idsArg.split(','))
  const { data, error } = await q.order('id')
  if (error) throw new Error(error.message)
  const rows = (data ?? []).filter(r => {
    const src = String((r.field_provenance as Record<string, { source?: string }> | null)?.target_beneficiaries?.source ?? '')
    return !(src.startsWith('admin:') || src.startsWith('user_verified:'))
  })
  console.log(`rows ${data?.length ?? 0}, eligible for a re-read ${rows.length}, mode ${write ? 'WRITE' : 'dry'}`)
  let changed = 0, written = 0, refused = 0
  for (let i = 0; i < rows.length; i += 8) {
    const batch = rows.slice(i, i + 8)
    const inputs: GrantInput[] = batch.map(g => {
      const fb = g.funder_brief as Record<string, unknown> | null
      return {
        id: g.id, title: g.title, funder: g.funder, description: g.description,
        what_they_fund: typeof fb?.what_they_fund === 'string' ? fb.what_they_fund : undefined,
        priorities:     typeof fb?.priorities === 'string' ? fb.priorities : undefined,
        who_can_apply:  typeof fb?.who_can_apply === 'string' ? fb.who_can_apply : undefined,
      } as GrantInput
    })
    const results = await classifyBatch(inputs)
    for (const g of batch) {
      const r = results.find(x => x?.id === g.id)
      if (!r) { console.log(`   ?  ${g.title}: no result`); continue }
      const next = (r.target_beneficiaries ?? []).filter(v => VALID_BENEFICIARIES.has(v))
      const before = (g.target_beneficiaries as string[] | null) ?? []
      const same = before.length === next.length && before.every((v, k) => v === next[k])
      if (!same) changed++
      console.log(`${same ? '   =' : '   ~'} ${String(g.title).slice(0, 44).padEnd(44)} ${JSON.stringify(before)} -> ${JSON.stringify(next)}`)
      if (write && !same && next.length) {
        const cit = r._citations?.target_beneficiaries
        const res = await mergeGrantUpdate({ id: g.id, fields: { target_beneficiaries: next }, source: SOURCE, pinned: false, db,
          citations: cit ? { target_beneficiaries: cit } : undefined })
        if (res.applied.includes('target_beneficiaries')) written++; else refused++
      }
    }
  }
  console.log(`\nchanged ${changed} of ${rows.length}${write ? `, written ${written}, refused ${refused}` : ''}`)
}
main().catch(e => { console.error(e); process.exit(1) })
