// One-off: record A B Charitable Trust's income thresholds on the live row.
//
// The row's who_can_apply says only "small to medium-sized organisations".
// The funder's own FAQ is far more specific, and the difference is decisive
// for a mid-sized applicant:
//   "For our open programme we require three year's financial information, all
//    three years need to be showing a minimum income of £150,000 and be under
//    the upper threshold of £1.5 million."
//
// Verified against https://abcharitabletrust.org.uk/faqs on 2026-07-29.
//
// Why it matters: this fund scores 44% for a £2.1m Manchester charity today —
// visible enough to waste their time, and they are barred outright. The
// eligibility engine reads income caps out of this text, so recording it lets
// the matcher do the right thing rather than relying on the user to notice.
//
// Written at system: trust (50), which beats the row's admin:legacy (special-
// cased to 35) without pinning the field against future enrichment.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import path from 'path'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

for (const l of readFileSync(path.resolve(__dirname, '../.env.local'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const ROW_ID = 'a94ae453-629b-46ca-a21e-11606403bfc9'

;(async () => {
  const apply = process.argv.includes('--apply')
  const { data } = await db.from('scraped_grants').select('funder, title, funder_brief').eq('id', ROW_ID).single()
  const brief = (data?.funder_brief ?? {}) as Record<string, unknown>

  const updated = {
    ...brief,
    who_can_apply:
      'Registered charities and CICs working in the Trust\'s priority areas of human rights, migration and criminal justice. '
      + 'INCOME THRESHOLDS: for the open programme the Trust requires three years of financial information, and all three years '
      + 'must show a minimum income of £150,000 and be under an upper threshold of £1.5 million. Organisations slightly below the '
      + 'minimum in one year may contact the team to discuss eligibility. The Trust does not fund individuals directly.',
  }

  console.log(`\n${data?.funder} — ${data?.title}`)
  console.log(`\nBEFORE:\n  ${String(brief.who_can_apply ?? '(empty)').slice(0, 220)}`)
  console.log(`\nAFTER:\n  ${updated.who_can_apply.slice(0, 320)}`)

  if (!apply) { console.log('\nDRY RUN — nothing written.\n'); return }
  const r = await mergeGrantUpdate({
    id: ROW_ID,
    fields: { funder_brief: updated },
    source: 'system:income-cap-verified:2026-07-29',
    pinned: false,
    db,
  })
  console.log(`\napplied: ${r.applied.join(', ') || 'none'}   rejected: ${(r.rejected ?? []).join(', ') || 'none'}\n`)
})()
