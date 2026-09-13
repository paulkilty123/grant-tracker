// Build and render the digest as it would go on Tuesday 15 September for the
// launch-week signups, without sending: HTML files for a few, and the ranked
// five for all twelve so the ordering change can be read against
// scripts/assess-signup-matches-2026-09-13.ts. DB read only.
//
//   npx tsx --env-file=.env.local scripts/digest-preview-2026-09-13.ts <outdir>
import { writeFileSync } from 'node:fs'
import { getAdminDb } from '../src/lib/admin/admin-db'
import { buildDigest } from '../src/lib/digest/build'
import { renderDigest } from '../src/lib/digest/render'
import type { Organisation } from '../src/types'

const OUT = process.argv[2]
if (!OUT) throw new Error('outdir required')
const NOW = new Date('2026-09-15T10:00:00Z')
const ORIGIN = 'https://www.shootsfunding.co.uk'
const HTML_FOR = ['Unicorn Theatre', 'Bridlington Cricket Foundation', 'Redhill Fields Open Air Events']

async function main() {
  const db = getAdminDb()
  const { data: orgs, error } = await db.from('organisations').select('*').gte('created_at', '2026-09-09').order('created_at')
  if (error) throw error
  if (!orgs?.length) throw new Error('no orgs')
  for (const org of orgs as Organisation[]) {
    const m = await buildDigest(org, { origin: ORIGIN, now: NOW, recentlyShown: [] })
    if (!m) { console.log(`## ${org.name}: no send`); continue }
    console.log(`## ${org.name} | ${m.mode} | subject: ${m.subject}`)
    console.log(`   edition: ${m.edition ? m.edition.updates[0] : 'none'}`)
    for (const r of m.matches) console.log(`   match: ${r.title}`)
    if (HTML_FOR.includes(org.name)) {
      const html = renderDigest(m, { origin: ORIGIN, unsubscribeUrl: `${ORIGIN}/unsubscribe`, now: NOW })
      const f = `${OUT}/digest-${org.name.toLowerCase().replace(/[^a-z]+/g, '-')}.html`
      writeFileSync(f, html)
      console.log(`   wrote ${f}`)
    }
  }
}
main().catch(e => { console.error(e); process.exit(1) })
