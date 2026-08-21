// Hackney Crisis and Resilience Fund: an individual's fund tagged for eight
// organisation types. Authorised by Paul, 2026-08-20: "change the hackney fund
// so it is accurate."
//
// READ THE PAGE FIRST, because the pin might have encoded something the brief
// did not — councils do sometimes pay crisis money out through voluntary
// organisations, which is why this was flagged rather than fixed yesterday.
// hackney.gov.uk settles it: "you can only apply for the Hackney Crisis and
// Resilience Fund if you live in the borough of Hackney."
//
// THE NUANCE IS WORTH KEEPING, and it is the reason the row earns its place: a
// support worker "can fill in the form on behalf of someone else if they've
// given you permission". So a charity has a real use for this record — it is
// just never the applicant, and never the recipient. Tagging it `individual`
// while saying that plainly in `who_can_apply` is more useful than either
// removing the row or leaving eight structures on it.
//
// THE PIN IS RELEASED, NOT OUTRANKED. Same as Jerwood and Bristol yesterday:
// writing with an `admin:` source would beat trust 100 and stamp a fresh pin,
// and a pinned value here would stop the verifier correcting it if the council
// changes the scheme. The stale provenance entry is removed and the new value
// written at user_verified trust.
//
//   npx tsx --env-file=.env.local scripts/fix-hackney-crisis-2026-08-20.ts --dry
//   npx tsx --env-file=.env.local scripts/fix-hackney-crisis-2026-08-20.ts
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const DRY = process.argv.includes('--dry')
const ID = '4df9ef88-e673-4507-96e9-f6764d0b54d0'
const SOURCE = 'user_verified:hackney-crisis-2026-08-20'

const SNIPPET =
  'hackney.gov.uk: "You can only apply for the Hackney Crisis and Resilience Fund if you live in the borough of '
  + 'Hackney." A third party "can fill in the form on behalf of someone else if they\'ve given you permission", but '
  + 'the applicant and the recipient is the resident. "We make a decision for each application individually, based on '
  + 'your circumstances and how much money we have available when you apply." "You can apply for the Crisis and '
  + 'Resilience Fund until 31 March 2029." "You will not need to pay the money back."'

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data } = await db.from('scraped_grants')
    .select('field_provenance, funder_brief, eligible_structures').eq('id', ID).limit(1)
  if (!data?.length) { console.error('row not found'); process.exit(1) }

  const prov = { ...((data[0].field_provenance ?? {}) as Record<string, unknown>) }
  const held = prov.eligible_structures as { source?: string; pinned?: boolean } | undefined
  console.log(`releasing eligible_structures: held by ${held?.source ?? '(nothing)'}${held?.pinned ? ', pinned' : ''}`)
  console.log(`was: [${((data[0].eligible_structures as string[] | null) ?? []).join(', ')}]`)

  const brief = { ...((data[0].funder_brief ?? {}) as Record<string, unknown>) }
  brief.who_can_apply =
    'Residents of the London Borough of Hackney who are struggling to afford essentials. You can only apply if you '
    + 'live in the borough. This is a fund for an individual or household, not for an organisation: a charity or '
    + 'support worker can fill in the form on behalf of someone who has given permission, but the applicant and the '
    + 'recipient is the resident. Useful to a frontline organisation as a route for the people it supports, never as '
    + 'income for the organisation itself.'

  if (DRY) { console.log('would set eligible_structures = [individual] and rewrite who_can_apply (dry)'); return }

  delete prov.eligible_structures
  const { error } = await db.from('scraped_grants').update({ field_provenance: prov }).eq('id', ID)
  if (error) { console.error(`release failed: ${error.message}`); process.exit(1) }

  const r = await mergeGrantUpdate({
    id: ID,
    fields: { eligible_structures: ['individual'], funder_brief: brief },
    source: SOURCE,
    db,
    citations: {
      eligible_structures: { snippet: SNIPPET, confidence: 'high' },
      funder_brief: { snippet: SNIPPET, confidence: 'high' },
    },
  })
  console.log(`applied:  ${JSON.stringify(r.applied)}`)
  if (r.rejected?.length) console.log(`REFUSED:  ${JSON.stringify(r.rejected)}`)

  const { data: after } = await db.from('scraped_grants')
    .select('title, eligible_structures, deadline, amount_min, amount_max, field_provenance').eq('id', ID).limit(1)
  const row = after?.[0] as { title: string; eligible_structures: string[]; deadline: string; field_provenance: Record<string, { source?: string }> }
  console.log(`\nnow: ${row.title}`)
  console.log(`  eligible_structures: [${row.eligible_structures.join(', ')}]`)
  console.log(`  now held by:         ${row.field_provenance?.eligible_structures?.source}`)
  console.log(`  deadline:            ${row.deadline} (page: "until 31 March 2029")`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
