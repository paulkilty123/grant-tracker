// Second pass over the two Dorset CF rows staged by dorset-cf-stage-2026-09-13:
// the four insight fields the review bar tests for, niche tags, and then the
// review reasons that remain, so Paul can see what still stands between each
// row and publish. Everything from the two pages already fetched; no model call.
//
//   npx tsx --env-file=.env.local scripts/dorset-cf-enrich-2026-09-13.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { deriveReviewReasons, type ReviewRow } from '../src/lib/admin/review-reasons'

const APPLY = process.argv.includes('--apply')
const SRC = 'system:dorset-cf-2026-09-13'
const IDS = { umbrella: 'dc9b3dc4-6950-4868-b126-9b367c3ff0cf', wessex: '18c8933b-5618-45aa-9d7a-2b925e36ba57' }

type Patch = { brief: Record<string, string>; fields?: Record<string, unknown> }
const P: Record<string, Patch> = {
  [IDS.umbrella]: {
    brief: {
      priorities: 'Local grassroots organisations well placed to identify and address local needs, whose services and activities improve the lives of Dorset residents. Grants are meant to reflect the diversity of the county, and groups supporting diverse communities or people facing discrimination are welcomed.',
      geographic_focus: 'The county of Dorset, including Bournemouth, Christchurch and Poole. Some programmes are narrower: the BCP funds cover Bournemouth, Christchurch and Poole only, and the Wessex Water fund also reaches Ringwood.',
      strong_application: 'A Dorset-based group with a clear local need it is placed to meet, applying to the programme whose criteria it fits rather than to the foundation in general. Groups new to the foundation should take the 20 minute pre-application call first.',
    },
    fields: { niche_tags: ['neighbourhood', 'place_based'] },
  },
  [IDS.wessex]: {
    brief: {
      geographic_focus: 'Dorset and Ringwood. The same fund runs through Quartet, Somerset and Wiltshire community foundations for their areas, and a group may apply to only one of them.',
      strong_application: 'A small Dorset group with income under £500,000 and modest reserves, running for more than a year, asking for up to £4,000 towards work in an area of deprivation or rural isolation, community building, or debt and financial capability, with a simple way to record outcomes. A significant community or charitable element is needed for arts or sports work.',
    },
    fields: { niche_tags: ['neighbourhood', 'place_based', 'social_isolation', 'debt_advice', 'financial_education'] },
  },
}

async function main() {
  const db = getAdminDb()
  const { data, error } = await db.from('scraped_grants').select('*').in('id', Object.values(IDS))
  if (error) throw error
  const rows = (data ?? []) as (ReviewRow & { id: string; funder_brief: Record<string, unknown> | null; niche_tags: string[] | null })[]
  if (rows.length !== 2) throw new Error(`expected 2 rows, read ${rows.length}`)
  for (const row of rows) {
    const patch = P[row.id]
    const existing = row.funder_brief ?? {}
    const merged = { ...existing }
    const added: string[] = []
    for (const [k, v] of Object.entries(patch.brief)) {
      const cur = typeof existing[k] === 'string' ? (existing[k] as string) : ''
      if (v.length > cur.length) { merged[k] = v; added.push(k) }
    }
    const fields: Record<string, unknown> = { funder_brief: merged }
    for (const [k, v] of Object.entries(patch.fields ?? {})) {
      if (JSON.stringify((row as Record<string, unknown>)[k] ?? null) !== JSON.stringify(v)) { fields[k] = v; added.push(k) }
    }
    console.log(`## ${row.title}: +${added.join(',') || 'nothing'}`)
    if (APPLY && added.length) {
      const r = await mergeGrantUpdate({ id: row.id, source: SRC, db, fields })
      const bad = r.rejected.filter(x => x.reason !== 'idempotent')
      console.log(bad.length ? '   BLOCKED ' + bad.map(x => x.field + ':' + x.reason).join(',') : `   applied ${r.applied.join(',')}`)
    }
  }
  // Reasons after the write, re-read so the report is of what is in the table.
  const { data: after } = await db.from('scraped_grants').select('*').in('id', Object.values(IDS))
  for (const row of (after ?? []) as ReviewRow[]) {
    const rs = deriveReviewReasons(row)
    console.log(`## ${(row as { title?: string }).title}: ${rs.length ? rs.map(r => `${r.severity}:${r.code}`).join(', ') : 'no reasons, publishable'}`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
