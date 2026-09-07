// Citation corrections, 2026-09-07. Batch 5's checker pass.
//
// Same shape as the Lambeth fix after batch 3: the values are right, three
// citations need tightening.
//
//   - Tesco Community Grants: the stored snippet ("Running costs and
//     organisation overheads") reads as an inclusion on its own; the page's
//     heading two lines above it is what makes it an exclusion. Carry the
//     heading into the snippet.
//   - Nadara Sisters 5km fund: the stored snippet is the whole fund
//     description sentence; tighten to the clause that actually names both
//     spend types.
//   - Green Rigg: confidence set to med rather than high — "will only be
//     considered in exceptional cases" is a softer signal than a flat
//     exclusion, the same standard as the Fine & Country / Inman single-
//     sentence rule.
//
// mergeGrantUpdate checks idempotence by VALUE before trust, so re-running the
// batch would leave all three citations exactly as they are. Direct patches.
//
//   npx tsx --env-file=.env.local scripts/spend-fix-citations-2026-09-07.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'

const APPLY = process.argv.includes('--apply')

type Fix = {
  id: string
  titleRe: RegExp
  field: 'spend_restriction' | 'spend_types'
  expectSnippet: string
  newSnippet: string
  newConfidence?: 'high' | 'med' | 'low'
}

const FIXES: Fix[] = [
  {
    id: 'd6f2fc61-1403-4f13-9d06-e3b47e6c4f4c', titleRe: /Tesco Community Grants/,
    field: 'spend_restriction',
    expectSnippet: 'Running costs and organisation overheads',
    newSnippet: 'Projects which are ineligible ... Running costs and organisation overheads',
  },
  {
    id: '6c091760-ee77-4a23-b1dd-36a780751eb7', titleRe: /Nadara Sisters/,
    field: 'spend_restriction',
    expectSnippet: 'Nadara Sisters and North Steads Wind Farm Community Benefit Fund established in 2018 supports applications from a minimum of £1,000 and up to £20,000 for both capital and revenue funding from charities and voluntary groups that offer services for the residents of the wind farm area.',
    newSnippet: 'supports applications from a minimum of £1,000 and up to £20,000 for both capital and revenue funding from charities and voluntary groups',
  },
  {
    id: 'f5c454d7-728e-4f11-b7f1-1dc139393d3e', titleRe: /Green Rigg/,
    field: 'spend_restriction',
    expectSnippet: 'Priority will be given to capital items with a tangible, lasting benefit, including improvements to community buildings. Running costs and revenue funding will only be considered in exceptional cases.',
    newSnippet: 'Priority will be given to capital items with a tangible, lasting benefit, including improvements to community buildings. Running costs and revenue funding will only be considered in exceptional cases.',
    newConfidence: 'med',
  },
]

async function main() {
  const db = getAdminDb()
  for (const fix of FIXES) {
    const { data } = await db.from('scraped_grants')
      .select('id, title, is_active, pipeline_state, field_provenance').eq('id', fix.id).single()
    if (!data) throw new Error(`${fix.id}: no row`)
    if (!fix.titleRe.test(data.title)) throw new Error(`wrong row: ${data.title}`)

    const prov = structuredClone(data.field_provenance) as Record<string, { citation?: { snippet?: string; confidence?: string; source_url?: string } }>
    const entry = prov?.[fix.field]
    if (!entry?.citation) throw new Error(`${data.title}: no ${fix.field} citation`)

    const alreadyDone = entry.citation.snippet === fix.newSnippet && (!fix.newConfidence || entry.citation.confidence === fix.newConfidence)
    if (alreadyDone) { console.log(`${data.title}: already corrected`); continue }
    if (entry.citation.snippet !== fix.expectSnippet) {
      throw new Error(`${data.title}: ${fix.field} citation is "${entry.citation.snippet}", not what this script expects — leaving it alone`)
    }

    const beforeState = { is_active: data.is_active, pipeline_state: data.pipeline_state }
    console.log(`${data.title} (${fix.field})`)
    console.log(`  was: "${entry.citation.snippet}" (${entry.citation.confidence})`)
    console.log(`  ->   "${fix.newSnippet}" (${fix.newConfidence ?? entry.citation.confidence})${APPLY ? '' : ' (dry run)'}`)
    if (!APPLY) continue

    entry.citation.snippet = fix.newSnippet
    if (fix.newConfidence) entry.citation.confidence = fix.newConfidence
    const { error } = await db.from('scraped_grants').update({ field_provenance: prov }).eq('id', fix.id)
    if (error) throw new Error(error.message)

    const after = await db.from('scraped_grants').select('is_active, pipeline_state').eq('id', fix.id).single()
    if (JSON.stringify(beforeState) !== JSON.stringify(after.data)) throw new Error(`${data.title}: state moved — put it back`)
    console.log('  done, state unchanged')
  }
}
main().catch(e => { console.error(e); process.exit(1) })
