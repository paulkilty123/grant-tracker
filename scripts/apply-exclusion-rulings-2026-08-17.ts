/**
 * Paul's rulings on the five false-eligibility rows and the three junk extractions.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RULINGS, 17 August 2026
 *
 * 1. An unincorporated group is NOT eligible where a fund strictly requires a
 *    registered company. Remove `unincorporated` from J N Derbyshire Trust and
 *    Key Fund's Property Fund.
 *
 * 2. A CIC limited by shares does NOT typically count as profit-distributing,
 *    so it stays eligible — **as a default, with an exception.** A CIC by shares
 *    can pay capped dividends under its asset lock, so where a funder's page
 *    specifically bars organisations that distribute profits to shareholders,
 *    that may genuinely include it. Paul's instruction was to read the two pages
 *    rather than assume, and the two came out differently:
 *
 *    SIZEWELL C IS THE EXCEPTION. Its page names the form on both sides:
 *      eligible   — "not-for-profit enterprises, including community interest
 *                    companies limited by guarantee"
 *      ineligible — "companies that are aimed at generating profits for private
 *                    distribution, including community interest companies
 *                    limited by shares and companies limited by shares"
 *    So `cic_shares` is removed there. Nothing was assumed; the funder wrote it.
 *
 *    SCOPS ARTS IS THE DEFAULT. Its guidelines exclude only the general
 *    "Privately owned, profit-distributing companies", naming neither CICs nor
 *    share capital, and its own eligibility list accepts "CIC (Community
 *    Interest Company)" unqualified. So `cic_shares` stays.
 *
 * 3. Grants for Good bars "Regular Ltd companies and sole traders" and we tag
 *    `ltd_shares`, which is exactly a regular Ltd company. Remove it.
 *
 * 4. Three rows' "exclusions" are navigation text the extractor lifted, not
 *    exclusions. Reject rather than carry: writing them would put meaningless
 *    prose on the eligibility surface, which is worse than the gap.
 *
 * SOURCE. These write with `admin:`, which is right and deliberate here: a human
 * decided each one, so the value SHOULD outrank re-enrichment and SHOULD pin.
 * That is the opposite of the staging case the repo warns about, where an
 * `admin:` source on an unreviewed value silently blocks Re-enrich for good.
 *
 * Run:  npx tsx scripts/apply-exclusion-rulings-2026-08-17.ts [--apply]
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { buildEvidencePatch, recordFieldEvidence } from '../src/lib/field-evidence'

const HERE = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(resolve(HERE, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

const APPLY  = process.argv.includes('--apply')
const SOURCE = 'admin:paulkilty1@gmail.com'

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/** Structures to REMOVE, with the funder's sentence that justifies it. */
const REMOVALS: { id: string; title: string; drop: string; because: string }[] = [
  { id: 'c740bb33-f49e-4c9f-b8db-110b767e985f', title: 'J N Derbyshire Trust',
    drop: 'unincorporated',
    because: 'the page bars "organisations not registered with Charities Commission or Companies House"' },
  { id: 'cc0252b3-e362-401c-80b6-5407fed2dfc8', title: 'Property Fund (Key Fund)',
    drop: 'unincorporated',
    because: 'the page bars applicants "Not a legal company registered at Companies House"' },
  { id: 'c80591fa-fdf6-4e2d-97a5-c14020cff1bb', title: 'Grants for Good Fund',
    drop: 'ltd_shares',
    because: 'the page bars "Regular Ltd companies and sole traders"' },
  { id: 'dc68dcb0-e614-4229-a4fd-8f5b609b7143', title: 'Sizewell C Community Fund',
    drop: 'cic_shares',
    because: 'the page bars "companies that are aimed at generating profits for private distribution, including community interest companies limited by shares"' },
]

/** Rows whose extracted "exclusions" are navigation text. */
const JUNK: { id: string; title: string; extracted: string }[] = [
  { id: '9d1b13f1-607d-48b1-80df-80e127cd8933', title: 'Annandale and Nithsdale Community Benefit Company',
    extracted: 'Information on what the fund cannot support is provided here.' },
  { id: '6a57acbc-0c38-45f4-ad35-17a79c059f5b', title: 'Cash for Kids - General Grant',
    extracted: "What we don't fund" },
  { id: 'f1fdcd6e-152a-403f-a1ac-f7838fbe9ebc', title: 'sportscotland — Facilities Investment',
    extracted: 'those that will not be eligible (see SFF Guidelines)' },
]

async function main() {
  const record: unknown[] = []
  let changed = 0
  const refused: string[] = []

  console.log('STRUCTURE REMOVALS\n')
  for (const r of REMOVALS) {
    const { data, error } = await db
      .from('scraped_grants').select('eligible_structures').eq('id', r.id).single()
    if (error) { refused.push(`${r.title}: read failed — ${error.message}`); continue }

    const held = (data?.eligible_structures ?? []) as string[]
    if (!held.includes(r.drop)) {
      console.log(`  ${r.title}: ${r.drop} is not held — nothing to do`)
      continue
    }
    const next = held.filter(s => s !== r.drop)
    console.log(`  ${r.title}`)
    console.log(`      drop ${r.drop}  —  ${r.because}`)
    console.log(`      ${held.join('+')}`)
    console.log(`   -> ${next.join('+')}`)

    if (!APPLY) continue

    let applied: string[] = []
    let rejected: unknown[] = []
    let err: string | null = null
    try {
      const res = await mergeGrantUpdate({
        id: r.id, fields: { eligible_structures: next }, source: SOURCE, pinned: true, db,
      })
      applied = res.applied; rejected = res.rejected
    } catch (e) { err = e instanceof Error ? e.message : String(e) }

    // NEVER assume it landed.
    const ok = !err && applied.includes('eligible_structures')
    if (ok) changed++
    else refused.push(`${r.title}: ${err ?? 'eligible_structures not applied'}`)
    record.push({ kind: 'structure', ...r, before: held, after: next, applied, rejected, error: err, ok })
  }

  console.log('\nREJECTED EXTRACTIONS (navigation text, not exclusions)\n')
  for (const j of JUNK) {
    console.log(`  ${j.title}\n      was: "${j.extracted}"`)
    if (!APPLY) continue

    // Overwrite the stamp so it is no longer a contradiction. No quote and no
    // verdict means no `proposed` survives, so the row leaves the review queue
    // with the reason recorded rather than silently cleared.
    const { patch } = buildEvidencePatch([{
      field: 'exclusions', quote: null, agrees: null, source_url: null,
      note: 'rejected 2026-08-17: the extracted text is a heading or link label, not an exclusion. The real exclusions are one page deeper and need a second hop.',
    }], { by: SOURCE })

    let err: string | null = null
    try {
      await recordFieldEvidence({ id: j.id, patch, db })
    } catch (e) { err = e instanceof Error ? e.message : String(e) }
    if (err) refused.push(`${j.title}: ${err}`)
    else changed++
    record.push({ kind: 'reject_extraction', ...j, error: err, ok: !err })
  }

  if (!APPLY) { console.log('\nNothing written. Re-run with --apply.'); return }

  const path = resolve(HERE, '..', 'reports', 'exclusion-rulings-2026-08-17.json')
  writeFileSync(path, JSON.stringify({ ranAt: new Date().toISOString(), source: SOURCE, changed, record }, null, 2))
  console.log(`\nROWS CHANGED: ${changed}`)
  if (refused.length > 0) for (const x of refused) console.log(`    REFUSED ${x}`)
  console.log('record written to reports/exclusion-rulings-2026-08-17.json')
}

main().catch(e => { console.error(e); process.exit(1) })
