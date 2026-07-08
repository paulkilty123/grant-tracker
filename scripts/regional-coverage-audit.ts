// Regional coverage audit — the catalogue's LOCAL cash-grant layer per region.
// A standing catalogue-quality metric AND the regional go-to-market map: we sell
// where the local layer is stacked. Read-only.
//
//   npx tsx scripts/regional-coverage-audit.ts
//
// Every org competes in the shared national/UK-wide (+ England-wide for English
// orgs) pool. On TOP of that sits a region's local layer — place-specific funds
// that give an org there a real edge. This ranks that local layer by region.
// Cash = funding_type 'grant'. Multi-area tags (e.g. "London & South East")
// count toward each area they name.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'; import path from 'path'
for (const line of readFileSync(path.resolve(__dirname, '../.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const today = new Date().toISOString().slice(0, 10)
const has = (t: string, kw: string[]) => kw.some(k => t.includes(k))

// Shared, non-local pools.
function isNational(t: string): boolean {
  return t === '' || t === '(null)' ||
    has(t, ['uk', 'united kingdom', 'national', 'global', 'britain', 'uk & ireland']) ||
    ['england & wales', 'england, scotland & wales', 'england, scotland and wales', 'england scotland & wales'].includes(t)
}
const isEnglandWide = (t: string) => t === 'england'

// Region local-layer keyword sets (English regions + devolved nations).
const REGIONS: Array<{ name: string; kw: string[] }> = [
  { name: 'London', kw: ['london', 'camden', 'hackney', 'islington', 'westminster', 'richmond', 'croydon', 'southwark', 'ealing', 'sutton', 'wandsworth', 'bromley', 'haringey', 'lambeth', 'lewisham', 'greenwich', 'newham', 'tower hamlets', 'brent', 'barnet', 'enfield', 'redbridge', 'hounslow', 'city of london', 'kensington', 'chelsea', 'hammersmith', 'islington'] },
  { name: 'North West', kw: ['north west', 'manchester', 'merseyside', 'liverpool', 'lancashire', 'cheshire', 'wigan', 'bolton', 'salford', 'stockport', 'oldham', 'rochdale', 'trafford', 'tameside', 'bury', 'cumbria', 'preston', 'blackpool'] },
  { name: 'North East', kw: ['north east', 'newcastle', 'tyne', 'wear', 'northumberland', 'durham', 'sunderland', 'gateshead', 'teesside', 'middlesbrough'] },
  { name: 'Yorkshire & Humber', kw: ['yorkshire', 'leeds', 'sheffield', 'hull', 'bradford', 'humber', 'scarborough', 'york', 'wakefield', 'doncaster'] },
  { name: 'West Midlands', kw: ['west midlands', 'birmingham', 'coventry', 'warwickshire', 'solihull', 'wolverhampton', 'dudley', 'sandwell', 'walsall', 'staffordshire', 'shropshire', 'stoke'] },
  { name: 'East Midlands', kw: ['east midlands', 'nottingham', 'leicester', 'derby', 'lincolnshire', 'northampton', 'rutland', 'derbyshire'] },
  { name: 'East of England', kw: ['east of england', 'norfolk', 'suffolk', 'essex', 'cambridge', 'hertfordshire', 'bedfordshire', 'peterborough', 'norwich', 'ipswich'] },
  { name: 'South East', kw: ['south east', 'kent', 'sussex', 'surrey', 'buckinghamshire', 'brighton', 'hove', 'hampshire', 'oxfordshire', 'berkshire', 'southampton', 'portsmouth', 'milton keynes', 'lewes', 'worthing', 'chichester', 'reading', 'medway'] },
  { name: 'South West', kw: ['south west', 'bristol', 'somerset', 'devon', 'cornwall', 'gloucestershire', 'dorset', 'wiltshire', 'bath', 'plymouth', 'exeter', 'severn trent'] },
  { name: 'Scotland', kw: ['scotland', 'glasgow', 'edinburgh', 'aberdeen', 'dundee', 'ayrshire', 'fife', 'lanarkshire', 'highland', 'perth', 'stirling'] },
  { name: 'Wales', kw: ['wales', 'cardiff', 'swansea', 'gwynedd', 'wrexham', 'newport', 'powys'] },
  { name: 'Northern Ireland', kw: ['northern ireland', 'belfast', 'derry', 'ulster'] },
]

async function main() {
  const { data } = await sb.from('grants_with_funder')
    .select('title, location_tag, funding_type')
    .eq('is_active', true).neq('url_status', 'dead')
    .or(`is_rolling.eq.true,deadline.is.null,deadline.gte.${today},next_open_date_parsed.gte.${today}`).limit(2000)
  const grants = (data ?? []).filter(r => r.funding_type === 'grant')

  let national = 0, englandWide = 0, unclassifiedRegional = 0
  const local: Record<string, number> = Object.fromEntries(REGIONS.map(r => [r.name, 0]))
  for (const g of grants) {
    const t = (g.location_tag ?? '(null)').toLowerCase().trim()
    if (isNational(t)) { national++; continue }
    if (isEnglandWide(t)) { englandWide++; continue }
    const matched = REGIONS.filter(r => has(t, r.kw))
    if (matched.length === 0) { unclassifiedRegional++; continue }
    for (const r of matched) local[r.name]++
  }

  console.log(`active CASH grants: ${grants.length}`)
  console.log(`shared pool: national/UK-wide ${national} + England-wide ${englandWide} = ${national + englandWide}`)
  console.log(`unclassified regional (classifier gap — inspect if large): ${unclassifiedRegional}\n`)
  console.log('LOCAL CASH-GRANT LAYER BY REGION (ranked — the GTM / coverage map):')
  const ranked = Object.entries(local).sort((a, b) => b[1] - a[1])
  const max = Math.max(...ranked.map(r => r[1]), 1)
  for (const [name, n] of ranked) {
    const bar = '█'.repeat(Math.round((n / max) * 30))
    console.log(`  ${name.padEnd(20)} ${String(n).padStart(3)}  ${bar}`)
  }
  console.log(`\nEnglish-region local layer, richest → barest:`)
  const eng = ranked.filter(([n]) => !['Scotland', 'Wales', 'Northern Ireland'].includes(n))
  console.log('  ' + eng.map(([n, c]) => `${n} ${c}`).join(' · '))
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
