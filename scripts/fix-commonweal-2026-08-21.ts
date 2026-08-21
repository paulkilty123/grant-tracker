// Commonweal Housing: the row pointed at the homepage and was marked url_status
// 'dead' with url_last_checked null — the signature of a manual hide rather than
// a failed check (see the dead-grant-diagnostics note). Its actual call page is
// live and says "Call for New Ideas: Now Open".
//
// Everything below is quoted from that page, read 2026-08-21 without an API call:
// applications open until Friday 16 October 2026; England, Wales and Scotland
// only, explicitly NOT Northern Ireland; funding is for a feasibility study, and
// the page states no figure — so amounts stay null.
//
//   npx tsx --env-file=.env.local scripts/fix-commonweal-2026-08-21.ts
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const ID = '7f8efdf7-22e9-4d06-aee8-62b18008c247'
const URL = 'https://www.commonwealhousing.org.uk/partner-with-us-call-for-new-ideas1'
const SOURCE = 'system:idox-feed-2026-08-21'

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const res = await mergeGrantUpdate({
    id: ID,
    fields: {
      apply_url: URL,
      deadline: '2026-10-16',
      is_rolling: false,
      description: 'Commonweal is inviting organisations to propose innovative housing models that could improve outcomes for young people experiencing difficult transitions into adulthood. Successful applicants receive grant funding to undertake a feasibility study exploring whether their proposal could become a future Commonweal property-based pilot project; where a study shows a viable model, Commonweal may go on to develop a multi-year property-based pilot, including acquiring properties. Aimed at young people aged 16 and over facing significant disadvantage: care experience, homelessness or housing insecurity, contact with the criminal justice system, neurodivergence, mental health challenges (excluding projects needing intensive clinical support), exclusion from education, or exploitation and abuse. Applications from Wales and Scotland are particularly encouraged alongside England; applications from Northern Ireland are not being accepted for this call. Applications close Friday 16 October 2026. The page states no grant figure.',
    },
    source: SOURCE, db,
    citations: {
      deadline:    { snippet: '"Applications are open until Friday 16th October 2026." — commonwealhousing.org.uk/partner-with-us-call-for-new-ideas1, read 2026-08-21', confidence: 'high' },
      apply_url:   { snippet: 'The row pointed at the homepage and was marked dead with no check date. This page loads (200) and is headed "Call for New Ideas: Now Open".', confidence: 'high' },
      description: { snippet: 'Written from the page text verbatim on 2026-08-21. No amount is stated anywhere on the page, so amount_min/max are deliberately left null.', confidence: 'high' },
    },
  })
  console.log(`applied : ${res.applied.join(', ') || '(nothing)'}`)
  if (res.rejected?.length) console.log(`REFUSED : ${JSON.stringify(res.rejected)}`)

  // url_status was 'dead' against the OLD url. Reset to unchecked so the checker
  // makes its own call on the new one — asserting 'ok' here would be me marking
  // my own homework.
  const { error } = await db.from('scraped_grants')
    .update({ url_status: 'unchecked', url_last_checked: null }).eq('id', ID)
  console.log(error ? `url_status: FAILED ${error.message}` : 'url_status: dead → unchecked')

  const { data } = await db.from('scraped_grants')
    .select('title,is_active,pipeline_state,apply_url,deadline,url_status').eq('id', ID).single()
  console.log('\n', JSON.stringify(data, null, 2))
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
