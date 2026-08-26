/* eslint-disable @typescript-eslint/no-explicit-any */
// Northern Impact Fund 2 (Key Fund) — tagged "UK", lends in the North and Midlands.
//
// The tag was written by ai_enrich:v2 on 2026-07-19 with confidence "low", an
// EMPTY snippet, and this reason: "no explicit geographic restriction stated;
// UK-wide is inferred from lack of stated boundaries and funder's general
// investment model". Silence on the fund's own page became a UK-wide claim,
// which is the widest possible reading of no evidence at all.
//
// The funder's home page states the scope for all of its investments:
//   "We offer investments from £5k up to £300k to community and social
//    enterprises operating in the North of England and the Midlands."
//
// user_verified (70), not admin (100): it beats ai_enrich (60) so the next
// enrichment run cannot silently re-infer "UK", but it does not pin, so this
// stays correctable. Confirming a correction is not deciding it must never
// improve.
//
//   npx tsx --env-file=.env.local scripts/keyfund-nif2-geography-2026-08-27.ts --dry
//   npx tsx --env-file=.env.local scripts/keyfund-nif2-geography-2026-08-27.ts
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const ID     = '105cf22a-e502-436b-8806-b1f0c56b4df1'
const VALUE  = 'North of England & Midlands'   // matches the sibling live row's spelling
const SOURCE = 'user_verified:keyfund-nif2-geography-2026-08-27'
const DRY    = process.argv.includes('--dry')

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: before } = await db.from('scraped_grants')
    .select('title, location_tag, is_local, is_active, field_provenance').eq('id', ID).maybeSingle()
  if (!before) { console.error('row not found'); process.exit(1) }
  const b = before as any
  console.log(`── ${b.title}`)
  console.log(`   before : location_tag=${JSON.stringify(b.location_tag)}  is_local=${b.is_local}  live=${b.is_active}`)
  console.log(`   held by: ${JSON.stringify(b.field_provenance?.location_tag)}`)

  if (b.location_tag === VALUE) { console.log('   already narrowed, nothing to do'); return }
  if (DRY) { console.log(`   DRY — would write location_tag=${JSON.stringify(VALUE)} as ${SOURCE}`); return }

  const r = await mergeGrantUpdate({
    id: ID,
    fields: { location_tag: VALUE },
    source: SOURCE,
    pinned: false,
    db,
    citations: {
      location_tag: {
        snippet: 'We offer investments from £5k up to £300k to community and social enterprises operating in the North of England and the Midlands.',
        confidence: 'high',
        reason: 'Funder-level scope read from https://thekeyfund.co.uk/ on 2026-08-27. The fund page itself states no geography, which is what ai_enrich read as UK-wide.',
      },
    },
  })
  console.log(`   applied : ${JSON.stringify(r.applied)}`)
  console.log(`   rejected: ${JSON.stringify(r.rejected)}`)

  const { data: after } = await db.from('scraped_grants')
    .select('location_tag, field_provenance').eq('id', ID).maybeSingle()
  const a = after as any
  console.log(`   after  : location_tag=${JSON.stringify(a.location_tag)}`)
  console.log(`   prov   : ${JSON.stringify(a.field_provenance?.location_tag)}`)
}
main().catch(e => { console.error(e.message); process.exit(1) })
