/* eslint-disable @typescript-eslint/no-explicit-any */
// Greggs Foundation Community Action Fund — narrow the geography to this round.
//
// The row is tagged "UK". The funder's own page says the current round takes
// applications from two places only:
//   "The following areas are eligible for applications: Glasgow (Nitshill G53), South Tyneside"
//
// location_tag has been PINNED since 2026-06-03 by admin:location-tag-hygiene,
// which collapsed the older, more honest "UK (variable by round)" to "UK". The
// pin is why this never got corrected: a verification pass on 2026-08-18 read
// the very sentence above and could only park it as a citation on `is_local`,
// because the pin refused the location_tag write.
//
// So this write is admin: (the only source Case 3 lets past a pin) with
// pinned:false, which clears the pin on the way through. The areas change every
// round, so freezing them again would rebuild the same trap.
//
//   npx tsx --env-file=.env.local scripts/greggs-caf-round-geography-2026-08-27.ts --dry
//   npx tsx --env-file=.env.local scripts/greggs-caf-round-geography-2026-08-27.ts
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const ID     = 'cfb56fe7-0ddb-4ac4-ab6f-c04102b8009d'
const VALUE  = 'Glasgow & South Tyneside'
const SOURCE = 'admin:greggs-caf-round-2026-08-27'
const DRY    = process.argv.includes('--dry')

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: before } = await db.from('scraped_grants')
    .select('title, location_tag, is_local, is_active, deadline, field_provenance').eq('id', ID).maybeSingle()
  if (!before) { console.error('row not found'); process.exit(1) }
  const b = before as any
  console.log(`── ${b.title}`)
  console.log(`   before: location_tag=${JSON.stringify(b.location_tag)}  is_local=${b.is_local}  live=${b.is_active}  deadline=${b.deadline}`)
  console.log(`   held by: ${JSON.stringify(b.field_provenance?.location_tag)}`)

  if (b.location_tag === VALUE) { console.log('   already narrowed, nothing to do'); return }
  if (DRY) { console.log(`   DRY — would write location_tag=${JSON.stringify(VALUE)} as ${SOURCE} (pinned:false)`); return }

  const r = await mergeGrantUpdate({
    id: ID,
    fields: { location_tag: VALUE },
    source: SOURCE,
    pinned: false,
    db,
    citations: {
      location_tag: {
        snippet: 'The following areas are eligible for applications: Glasgow (Nitshill G53), South Tyneside. The Community Action Fund is currently open for applications until 28th August at 12 noon.',
        confidence: 'high',
        reason: 'Read from https://www.greggsfoundation.org.uk/grants/community-funding on 2026-08-27.',
      },
    },
  })
  console.log(`   applied : ${JSON.stringify(r.applied)}`)
  console.log(`   rejected: ${JSON.stringify(r.rejected)}`)

  const { data: after } = await db.from('scraped_grants')
    .select('location_tag, is_local, field_provenance').eq('id', ID).maybeSingle()
  const a = after as any
  console.log(`   after : location_tag=${JSON.stringify(a.location_tag)}  is_local=${a.is_local}`)
  console.log(`   prov  : ${JSON.stringify(a.field_provenance?.location_tag)}`)
}
main().catch(e => { console.error(e.message); process.exit(1) })
