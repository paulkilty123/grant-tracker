// Over-broad location tags, 2026-09-04.
//
// Paul, from the demo: Bramble Arts Collective in Leeds scored a full green
// location bar against Sir James Reckitt Charity, whose priority is Hull and
// East Yorkshire (or Quaker causes). The row's tag was "Yorkshire", and the
// matcher's hierarchy lists Leeds under Yorkshire, so it matched. The
// enricher had it right ("Hull and East Yorkshire", ai_enrich:v2, which the
// matcher splits on "and" and scores against the East Yorkshire towns); it
// was pinned to "Yorkshire" on 14 July. Pinned admin, so this is admin again.
//
// The same shape was checked across every live local row whose brief names
// a narrower area than the tag. Retagged to what the brief says, in the
// vocabulary the matcher already knows (REGION_HIERARCHY in matching.ts):
// county keys with their towns, comma or "and" lists split into parts, and a
// bare town matched by containment against the org's location.
//
// Left alone: Community Foundation North East and NE Create Growth (the tag
// is the region and the brief is most of it), Fishmongers' (several
// programmes, one London-wide), Chagossian Fund ("Crawley and other parts of
// Sussex"), SWIG Start Up Loans (South West is right).
//
//   npx tsx --env-file=.env.local scripts/location-narrow-2026-09-04.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const APPLY  = process.argv.includes('--apply')
const SOURCE = 'admin:paulkilty1@gmail.com'

const ROWS: { title: string; funder?: string; to: string; quote: string }[] = [
  { title: 'Sir James Reckitt Charity — General Grants', to: 'Hull and East Yorkshire',
    quote: 'Hull and East Yorkshire, or charities associated with the Society of Friends (Quakers)' },
  { title: 'Community First Prime Opportunities Fund', to: 'North Yorkshire and East Yorkshire',
    quote: 'York, North Yorkshire, Hull, and East Riding of Yorkshire.' },
  { title: 'Small Grants', funder: 'Two Ridings', to: 'North Yorkshire and East Yorkshire',
    quote: 'East Yorkshire, Hull, North Yorkshire, and York.' },
  { title: 'Fraisthorpe Wind Farm Community Benefit Fund', to: 'Bridlington',
    quote: 'Parish council areas of Barmston and Fraisthorpe, Carnaby, and the part of Bridlington town council area south of Bessingby Road' },
  { title: 'Sixpenny Wood Wind Farm Fund', to: 'Goole and Howden',
    quote: 'Six parishes in East Yorkshire: Blacktoft, Eastrington, Gilberdyke, Hook, Kilpin, and Laxton' },
  { title: 'Awards to organisations in Northumberland supporting young people', to: 'Northumberland',
    quote: 'Northumberland only' },
  { title: 'Main Grants Programme', to: 'Tyne and Wear, Northumberland, County Durham and Hartlepool',
    quote: 'Tyne and Wear, Northumberland, County Durham, and Hartlepool. Excludes Darlington, Stockton, Redcar, and Middlesbrough.' },
  { title: 'Devon Community Foundation — Community Grants', to: 'Devon',
    quote: 'Devon, Plymouth, and Torbay only.' },
  { title: 'Norfolk Community Foundation — Grants for Groups', to: 'Norfolk',
    quote: 'Norfolk only, with some funds restricted to specific districts' },
  { title: 'Sussex Community Foundation — Brighton and Hove Legacy Fund', to: 'Brighton and Hove',
    quote: 'Brighton and Hove only.' },
  { title: 'Grants for Disability and Vulnerable People', to: 'Herefordshire, Worcestershire and West Midlands',
    quote: 'Herefordshire, Worcestershire, and the metropolitan boroughs of the West Midlands only.' },
  { title: 'Hampstead Wells and Camden Trust', to: 'Camden',
    quote: 'Hampstead, Wells, and Camden area (referred to as their Area of Benefit)' },
  { title: 'Older People and Housing Programme', to: 'London and Norfolk',
    quote: 'Greater London and Norfolk only.' },
]

async function main() {
  const db = getAdminDb()
  console.log(APPLY ? 'APPLY' : 'DRY RUN')
  let changed = 0
  for (const r of ROWS) {
    let q = db.from('scraped_grants').select('id, title, location_tag, is_active, pipeline_state')
      .eq('is_active', true).eq('pipeline_state', 'published').ilike('title', r.title.replace(/—/g, '%').slice(0, 40) + '%')
    if (r.funder) q = q.ilike('funder', `%${r.funder}%`)
    const { data } = await q
    if (!data || data.length !== 1) { console.log(`  ${r.title}: expected 1 live row, found ${data?.length ?? 0}; skipped`); continue }
    const row = data[0]
    console.log(`  ${row.title.slice(0, 48).padEnd(50)} ${row.location_tag} -> ${r.to}`)
    if (!APPLY || row.location_tag === r.to) continue
    const res = await mergeGrantUpdate({ id: row.id, fields: { location_tag: r.to, is_local: true }, source: SOURCE, pinned: true, db,
      citations: { location_tag: { snippet: r.quote, confidence: 'high' } } })
    const refused = res.rejected.filter(x => x.reason !== 'idempotent')
    if (refused.length) console.log('     REFUSED', JSON.stringify(refused)); else changed++
  }
  console.log(`changed ${changed}`)
}
main().catch(e => { console.error(e); process.exit(1) })
