/**
 * Publish five of the six staged Yorkshire rows, and reshape the sixth.
 * Paul's go, 8 September 2026.
 *
 * The sixth, Community Grants Programme (Kirklees) Round 11, is NOT published:
 * applications do not open until 21 September. Published live with a 6 November
 * deadline it would read as an open fund, and a Kirklees user clicking it next
 * week would find no application form. That is the same defect found on the
 * York row this morning, so it is not repeated here.
 *
 * It is stored instead in the shape the catalogue already uses for a fund
 * between rounds: no deadline, a free-text "opens" badge, and the parsed date
 * that check-coming-soon reads. The 6 November closing date is preserved in the
 * brief's decision_timeline for whoever publishes it.
 */
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import * as fs from 'fs'

const env = fs.readFileSync('.env.local', 'utf8')
const envVar = (k: string) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))![1].trim()
const db = createClient(envVar('NEXT_PUBLIC_SUPABASE_URL'), envVar('SUPABASE_SERVICE_ROLE_KEY'))

const SOURCE = 'user_verified:cf-yorkshire-publish-2026-09-08'
const APPLY = process.argv.includes('--apply')
const HOLD = 'Community Grants Programme (Kirklees), Round 11'
const TODAY = '2026-09-08'

;(async () => {
  const { data: rows, error } = await db.from('scraped_grants')
    .select('id,title,deadline,is_active,pipeline_state,apply_url,funder_brief')
    .eq('source', 'system:cf-yorkshire-2026-09-08')
  if (error) throw new Error(error.message)
  if (rows!.length !== 6) throw new Error(`expected 6 staged rows, found ${rows!.length}`)

  const toPublish = rows!.filter(r => r.title !== HOLD)
  const hold = rows!.find(r => r.title === HOLD)
  if (!hold) throw new Error(`the row to hold back was not found: ${HOLD}`)
  if (toPublish.length !== 5) throw new Error(`expected 5 to publish, got ${toPublish.length}`)

  // Nothing goes live with a deadline that has already passed.
  for (const r of toPublish) {
    if (!r.deadline) throw new Error(`${r.title}: no deadline, refusing to publish as open`)
    if (r.deadline <= TODAY) throw new Error(`${r.title}: deadline ${r.deadline} is not in the future`)
  }
  console.log(`5 rows to publish, earliest deadline ${toPublish.map(r => r.deadline).sort()[0]}`)

  if (!APPLY) {
    for (const r of toPublish) console.log(`  DRY publish  ${r.deadline}  ${r.title}`)
    console.log(`  DRY hold     -> between_rounds_scheduled, opens 2026-09-21  ${hold.title}`)
    return
  }

  for (const r of toPublish) {
    const res = await mergeGrantUpdate({
      id: r.id, fields: { is_active: true, pipeline_state: 'published' }, source: SOURCE as never, db,
    })
    const bad = res.rejected.filter(x => x.reason !== 'idempotent')
    console.log(`published  ${r.deadline}  ${r.title}${bad.length ? `  REJECTED ${JSON.stringify(bad)}` : ''}`)
  }

  // The held row: between-rounds shape. deadline cleared so it cannot read as
  // open; the November close stays in the brief.
  const res = await mergeGrantUpdate({
    id: hold.id,
    fields: {
      deadline: null,
      next_open_date: 'Applications open Monday 21 September 2026',
      next_open_date_parsed: '2026-09-21',
      pipeline_state: 'between_rounds_scheduled',
      is_active: false,
    },
    source: SOURCE as never, db,
  })
  const bad = res.rejected.filter(x => x.reason !== 'idempotent')
  console.log(`held       opens 2026-09-21  ${hold.title}${bad.length ? `  REJECTED ${JSON.stringify(bad)}` : ''}`)

  // End state.
  const { data: after } = await db.from('scraped_grants')
    .select('title,is_active,pipeline_state,deadline,next_open_date_parsed')
    .eq('source', 'system:cf-yorkshire-2026-09-08')
  const live = after!.filter(r => r.is_active && r.pipeline_state === 'published')
  const held = after!.filter(r => !r.is_active && r.pipeline_state === 'between_rounds_scheduled')
  if (live.length !== 5) throw new Error(`expected 5 live, got ${live.length}`)
  if (held.length !== 1) throw new Error(`expected 1 held, got ${held.length}`)
  const openLie = live.find(r => !r.deadline || r.deadline <= TODAY)
  if (openLie) throw new Error(`a live row has no future deadline: ${openLie.title}`)
  console.log(`\nend state: ${live.length} live with future deadlines, ${held.length} held until ${held[0].next_open_date_parsed}`)
})()
