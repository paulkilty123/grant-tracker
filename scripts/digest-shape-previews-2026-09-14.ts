// Three real post-launch digests, one per shape, sent to Paul's own address
// for review before Tuesday's send (Paul, 14 Sept 2026). Built by the same
// builder and renderer the route uses, dated now; the only difference is the
// recipient and a subject prefix naming the shape. Nothing is recorded in
// digest_sent_items, so rotation history is untouched.
//
//   npx tsx --env-file=.env.local scripts/digest-shape-previews-2026-09-14.ts ["Org name" ...]
import { Resend } from 'resend'
import { getAdminDb } from '../src/lib/admin/admin-db'
import { buildDigest } from '../src/lib/digest/build'
import { renderDigest } from '../src/lib/digest/render'
import { EMAIL_FROM_HEADER } from '../src/lib/mcp-brand'
import { unsubscribeUrl } from '../src/lib/alerts-unsubscribe'
import type { Organisation } from '../src/types'

const TO = 'paul@shootsfunding.co.uk'
const ORIGIN = 'https://www.shootsfunding.co.uk'
const PICKS = process.argv.slice(2).length ? process.argv.slice(2) : ['Bridlington Cricket Foundation', 'Redhill Fields Open Air Events', 'Unicorn Theatre']

async function main() {
  const db = getAdminDb()
  const resend = new Resend(process.env.RESEND_API_KEY!)
  // Named picks can be any organisation; the default three are post-launch signups.
  const q = db.from('organisations').select('*').in('name', PICKS).eq('alerts_enabled', true)
  const { data: orgs, error } = await (process.argv.slice(2).length ? q : q.gte('created_at', '2026-09-10'))
  if (error) throw error
  if ((orgs ?? []).length !== PICKS.length) throw new Error(`expected ${PICKS.length} orgs, read ${(orgs ?? []).length}: ${(orgs ?? []).map(o => o.name).join(', ')}`)
  for (const org of orgs as Organisation[]) {
    const { data: recent } = await db.from('digest_sent_items').select('section, item_key').eq('org_id', org.id).gte('sent_at', new Date(Date.now() - 31 * 86_400_000).toISOString())
    const m = await buildDigest(org, { origin: ORIGIN, recentlyShown: (recent ?? []) as { section: string; item_key: string }[] })
    if (!m) { console.log(`${org.name}: nothing to send`); continue }
    const html = renderDigest(m, { origin: ORIGIN, unsubscribeUrl: unsubscribeUrl(ORIGIN, org.id) })
    const r = await resend.emails.send({ from: EMAIL_FROM_HEADER, to: TO, subject: `[Preview, ${m.mode.replace('_', ' ')}: ${org.name}] ${m.subject}`, html })
    console.log(`${org.name} (${m.mode}): ${r.error ? 'FAILED ' + r.error.message : 'sent ' + r.data?.id}`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
