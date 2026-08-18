// Link-bucket rows where the link really was the problem, plus three front doors
// recorded as such.
//
// Key Fund's row points at keyfund.org.uk, which 302s to http://127.0.0.1 — a
// misconfigured redirect, not a dead site. The funder is thekeyfund.co.uk and it
// lists seven funds including Northern Impact Fund 2 at £5,000 to £150,000.
//
// Power to Change had BOTH its URLs dead: /our-funds/ soft-404s (the row on it was
// withdrawn earlier tonight as a duplicate) and /our-funding/ hard-404s. Its
// current support index is /get-support/.
//
// The other three are funder indexes, confirmed by reading them: Social Investment
// Business lists three funds with amounts, the GLA jobs-and-skills page lists six
// programmes, and Baring lists three of which only Strengthening Civil Society is
// open. Recording `funding_index_url` is a fact about the row and also stops the
// wrong-fund check asking a front door which single fund it is.
//
//   npx tsx --env-file=.env.local scripts/fix-link-rows-batch6-2026-08-18.ts --dry
//   npx tsx --env-file=.env.local scripts/fix-link-rows-batch6-2026-08-18.ts
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const DRY = process.argv.includes('--dry')
const SOURCE = 'user_verified:link-fix-2026-08-18'

const EDITS: { id: string; title: string; snippet: string; fields: Record<string, unknown> }[] = [
  {
    id: '0185be29-2511-48a8-9195-f2943c557e70',
    title: 'Key Fund Northern Impact Fund — wrong domain entirely',
    snippet:
      'keyfund.org.uk returns a 302 to http://127.0.0.1. The funder is thekeyfund.co.uk, whose funding page lists Northern Impact Fund 2: "Investment from £5,000 to £150,000" over 1 to 5 years, for organisations in the North of England and the Midlands with a direct social mission that mainstream lenders have turned down.',
    fields: {
      apply_url: 'https://thekeyfund.co.uk/funding/',
      funding_index_url: 'https://thekeyfund.co.uk/funding/',
      amount_min: 5000,
      amount_max: 150000,
    },
  },
  {
    id: '12cf1f69-c273-4ead-8e61-0a962afd7b88',
    title: 'Power to Change — both stored URLs are dead',
    snippet:
      'powertochange.org.uk/our-funding/ returns 404 and /our-funds/ returns the site\'s own "We could not find that" page with a 200. The current support index is /get-support/, which carries Trading for Good with its Match Trading grant and learning programme.',
    fields: {
      apply_url: 'https://powertochange.org.uk/get-support/',
      funding_index_url: 'https://powertochange.org.uk/get-support/',
    },
  },
  {
    id: '26029120-6cfa-4346-8834-36f77b0af3b2',
    title: 'Social Investment Business — a front door over three funds',
    snippet:
      'Community Builders Fund: loans of between £100k to £1.5m to UK charities and social enterprises. Energy Resilience Fund: blended fund of between £25-250k for energy saving measures. Reach Fund: grants between £5-15k in England to help raise further investment.',
    fields: { funding_index_url: 'https://www.sibgroup.org.uk/' },
  },
  {
    id: '93f38ed1-ca74-4b6f-9249-51c95a134006',
    title: 'GLA Jobs and Skills — an index of six programmes',
    snippet:
      'Lists Construction Skills Pilot and Skills Bootcamps for Londoners as open, with Construction Skills Capital Fund, Skills for Londoners Community Outreach, London Talent Pathways and Skills for Londoners Capital Fund as past opportunities.',
    fields: { funding_index_url: 'https://www.london.gov.uk/programmes-strategies/jobs-and-skills/funding' },
  },
  {
    id: 'ccd7ff18-dfde-406e-92e4-a0a19f13b721',
    title: 'Baring Arts Programme — not open, and the page is the funder index',
    snippet:
      'The Baring Foundation funding page lists three programmes: Arts and Mental Health, not currently open; International Development, always by invitation only; and Strengthening Civil Society, open with a deadline of 7 September 2026.',
    fields: {
      pipeline_state: 'between_rounds_scheduled',
      funding_index_url: 'https://baringfoundation.org.uk/our-grantmaking/current-funding-opportunities/',
    },
  },
]

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  let applied = 0
  let refused = 0
  for (const e of EDITS) {
    console.log(`\n── ${e.title}`)
    if (DRY) { console.log(`   ${JSON.stringify(e.fields).slice(0, 130)} (dry)`); continue }
    const citations = Object.fromEntries(
      Object.keys(e.fields).map(k => [k, { snippet: e.snippet, confidence: 'high' as const }]),
    )
    const r = await mergeGrantUpdate({ id: e.id, fields: e.fields, source: SOURCE, db, citations })
    console.log(`   applied:  ${JSON.stringify(r.applied)}`)
    applied += r.applied.length
    if (r.rejected?.length) { console.log(`   REFUSED:  ${JSON.stringify(r.rejected)}`); refused += r.rejected.length }
  }
  if (!DRY) console.log(`\nfields applied: ${applied}   fields refused: ${refused}`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
