// Jerwood and Bristol Impact Fund 3, authorised by Paul on 2026-08-19 after both
// writes were refused by his own admin pins.
//
// THE PINS ARE RELEASED, NOT OUTRANKED. The tempting shortcut is to write with an
// `admin:` source, which beats trust 100. It also stamps a fresh pin — admin
// sources pin regardless of `pinned: false` — and a pinned null deadline on
// Jerwood would stop the real closing date being written when the round opens in
// February. So the stale `field_provenance.deadline` entry is removed and the new
// value written normally at user_verified trust, leaving the field open to
// whatever reads the page next.
//
// Jerwood — a real round, six months out. "Applications open 9am 3 February
// (closing 2pm 17 March) 2027." Treated like Aldi: the deadline is cleared so the
// card can say "Opens 3 Feb 2027", and the 17 March close is kept in
// `deadline_cycle` so nothing is lost. check-coming-soon brings the row back into
// review on 3 February, which is when a closing date should be read off the page
// rather than derived.
//
// Bristol Impact Fund 3 — hidden. There is no round to apply for until April
// 2028. September 2027 is when the council publishes a timeline, not when
// anything opens, so there is no honest opening date to put on a card. Paul:
// "there's no honest opening date to show." The parsed date stays at 2027-09-01
// so the row comes back for a look when that timeline appears.
//
//   npx tsx --env-file=.env.local scripts/fix-jerwood-bristol-2026-08-19.ts --dry
//   npx tsx --env-file=.env.local scripts/fix-jerwood-bristol-2026-08-19.ts
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { formatNextOpen } from '../src/lib/utils'

const DRY = process.argv.includes('--dry')
const SOURCE = 'user_verified:jerwood-bristol-2026-08-19'

const EDITS = [
  {
    id: '6df1b665-ae45-435c-b07f-f56ccb582d5a',
    title: 'Jerwood Annual Funding Round',
    release: ['deadline'],
    fields: {
      deadline: null,
      deadline_cycle: [{ day: 17, month: 3, label: 'Annual round closes' }],
      next_open_date: 'Applications open on 3 February 2027 and close on 17 March 2027.',
      next_open_date_parsed: '2027-02-03',
    },
    snippet:
      'jerwood.org/funding/: "Applications open 9am 3 February (closing 2pm 17 March) 2027", for projects '
      + 'starting between 1 July 2027 and 30 June 2028. The stored deadline of 3 February was the OPENING date. '
      + 'Cleared so the card shows when the round opens; the 17 March close is kept in deadline_cycle.',
  },
  {
    id: 'b0611f72-056a-4c29-8f8b-ad5597093d92',
    title: 'Bristol Impact Fund 3 — Small Grants',
    release: ['deadline'],
    fields: {
      deadline: null,
      is_active: false,
      pipeline_state: 'between_rounds_scheduled',
      next_open_date: 'Timeline for the next round is published from September 2027; that round runs from 1 April 2028.',
      next_open_date_parsed: '2027-09-01',
    },
    snippet:
      'bristol.gov.uk: "A second round of BIF3 small grants will run from 1 April 2028 to 31 March 2030. Further '
      + 'information about the application process and timeline will be published from September 2027." The first '
      + 'round is funded and running, 1 September 2026 to 31 August 2028. Nothing closed on 28 April 2027, and '
      + 'September 2027 is when a timeline appears, not when applications open.',
  },
]

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  for (const e of EDITS) {
    console.log(`\n── ${e.title}`)

    const { data: before } = await db.from('scraped_grants')
      .select('field_provenance').eq('id', e.id).limit(1)
    const prov = { ...((before?.[0]?.field_provenance ?? {}) as Record<string, unknown>) }
    for (const f of e.release) {
      const held = prov[f] as { source?: string; pinned?: boolean } | undefined
      console.log(`   releasing ${f}: held by ${held?.source ?? '(nothing)'}${held?.pinned ? ', pinned' : ''}`)
      delete prov[f]
    }

    if (DRY) { console.log(`   would then write ${Object.keys(e.fields).join(', ')} (dry)`); continue }

    // Direct write, deliberately outside the trust ladder — this is the release
    // itself, and it is the only step that has to bypass it.
    const { error } = await db.from('scraped_grants').update({ field_provenance: prov }).eq('id', e.id)
    if (error) { console.log(`   RELEASE FAILED: ${error.message}`); continue }

    const citations = Object.fromEntries(
      Object.keys(e.fields).map(k => [k, { snippet: e.snippet, confidence: 'high' as const }]),
    )
    const r = await mergeGrantUpdate({ id: e.id, fields: e.fields, source: SOURCE, db, citations })
    console.log(`   applied:  ${JSON.stringify(r.applied)}`)
    if (r.rejected?.length) console.log(`   STILL REFUSED: ${JSON.stringify(r.rejected)}`)
  }
  if (DRY) return

  console.log('\n── what each card says now')
  const { data } = await db.from('scraped_grants')
    .select('title, is_active, is_rolling, deadline, deadline_cycle, next_open_date, next_open_date_parsed, field_provenance')
    .in('id', EDITS.map(e => e.id))
  for (const r of (data ?? []) as { title: string; is_active: boolean; is_rolling: boolean; deadline: string | null; deadline_cycle: unknown; next_open_date: string | null; next_open_date_parsed: string | null; field_provenance: Record<string, { source?: string }> }[]) {
    const shows = !r.is_active ? 'hidden'
      : (!r.is_rolling && !r.deadline && r.next_open_date) ? (formatNextOpen(r.next_open_date) ?? 'Check funder')
      : (r.deadline ? `DEADLINE ${r.deadline}` : 'Check funder')
    console.log(`  ${r.title.slice(0, 40).padEnd(40)} → ${shows}`)
    console.log(`      deadline now held by: ${r.field_provenance?.deadline?.source ?? '(released, nothing holds it)'}`)
    console.log(`      comes back for review on: ${r.next_open_date_parsed}`)
  }
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
