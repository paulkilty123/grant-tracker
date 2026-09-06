// Provenance correction, 2026-09-07. Charity and Co-operative Lending Fund.
//
// amount_max was corrected from £30,000,000 to £10,000,000 during pile A batch
// 1's first apply, while rule 2 still put pile A writes at system: trust. The
// rule was rewritten hours later: a value READ off the page with its sentence
// as citation goes at user_verified, so that it outranks an ai_enrich pass.
//
// The value is right and the citation is on it; only the source is a notch too
// low, and at trust 50 an ai_enrich run at 60 could put the £30 million pot
// figure back — which is the exact error this write removed.
//
// Re-running the batch does not fix it. mergeGrantUpdate checks idempotence by
// VALUE before it looks at trust, so a second write of the same £10,000,000 at
// a higher trust returns `idempotent` and leaves the old stamp. Same gap the
// timing job hit when correcting a citation's source_url. So this patches the
// one provenance entry directly, and nothing else.
//
//   npx tsx --env-file=.env.local scripts/verdicts-fix-coop-provenance-2026-09-07.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'

const APPLY = process.argv.includes('--apply')
const ID    = 'e1ae0341-15ae-4c05-98b5-18fed2989a88'
const FROM  = 'system:verdicts-2026-09-07'
const TO    = 'user_verified:verdicts-2026-09-07'

async function main() {
  const db = getAdminDb()
  const { data } = await db.from('scraped_grants')
    .select('id, title, amount_max, is_active, pipeline_state, field_provenance').eq('id', ID).single()
  if (!data) throw new Error('no row')
  if (!/Charity and Co-operative Lending Fund/.test(data.title)) throw new Error(`wrong row: ${data.title}`)
  if (data.amount_max !== 10000000) throw new Error(`amount_max is ${data.amount_max}, not the corrected value — stop`)

  const prov = structuredClone(data.field_provenance) as Record<string, { source?: string; citation?: unknown }>
  const entry = prov?.amount_max
  if (!entry) throw new Error('no amount_max provenance')
  if (entry.source === TO) { console.log('already at user_verified, nothing to do'); return }
  if (entry.source !== FROM) throw new Error(`amount_max is held by ${entry.source}, not this job — leaving it alone`)
  if (!entry.citation) throw new Error('refusing to raise the trust of an uncited value')

  const beforeState = { is_active: data.is_active, pipeline_state: data.pipeline_state }
  console.log(`${data.title}`)
  console.log(`  amount_max  ${data.amount_max}`)
  console.log(`  source      ${entry.source}  ->  ${APPLY ? TO : `${TO} (dry run)`}`)
  if (!APPLY) return

  entry.source = TO
  const { error } = await db.from('scraped_grants').update({ field_provenance: prov }).eq('id', ID)
  if (error) throw new Error(error.message)

  const after = await db.from('scraped_grants').select('is_active, pipeline_state').eq('id', ID).single()
  if (JSON.stringify(beforeState) !== JSON.stringify(after.data)) throw new Error('state moved — put it back')
  console.log('  done, state unchanged')
}
main().catch(e => { console.error(e); process.exit(1) })
