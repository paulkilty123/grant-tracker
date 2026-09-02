// The seventeen live rows carrying an unsupported figure, settled under the
// 30 August rule with Paul's rulings of 2 September. No model call. Page reads
// go through the production read-page route (free) and are the SECOND read:
// the stored August stamp is the first, per the second-read rule.
//
// Rulings applied here, verbatim from Paul:
//   - Sir James Knott: null both, not a £15,000 ceiling. Typical amounts go in
//     the write-up.
//   - Postcode Society Trust: keep £50,000 and cite the funder's FAQ from
//     26 August.
//   - Yapp and Quartet: read the next page first. Quartet's relink is a
//     proposal (not done here).
//   - Everything else as listed: each null with its quote.
//   - A Sinclair Henderson: NOT touched here. The stored read quotes the page
//     ("The next meeting will be in June 2028 ... Applications should be
//     received by the previous month"), so 31 May 2028 is the funder's own
//     date and clearing it would remove a true fact. Flagged back to Paul.
//
// Nulls are written the way the 30 August sweep wrote them: a direct PATCH
// that sets the field and stamps user_verified provenance with the quote as
// its citation, so the value stays improvable by a later read and the figure
// removed is recorded. Write-ups are edited through mergeGrantUpdate
// (user_verified 70 outranks ai_enrich 60) with _ungrounded_amounts cleared,
// since the figures it listed are gone from the prose.
//
//   npx tsx --env-file=.env.local scripts/amount-seventeen-2026-09-02.ts          dry run
//   APPLY=1 npx tsx --env-file=.env.local scripts/amount-seventeen-2026-09-02.ts  write

import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { buildEvidencePatch, recordFieldEvidence } from '../src/lib/field-evidence'
import { deriveReviewReasons, type ReviewRow } from '../src/lib/admin/review-reasons'

const APPLY  = process.env.APPLY === '1'
const SOURCE = 'user_verified:amount-null-sweep-2026-09-02'
const NOW    = new Date().toISOString()
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!
const KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!
const SECRET = process.env.ADMIN_SECRET!
const db = createClient(URL_, KEY)

type Fig = { figure: string; context: string }
async function readPage(url: string): Promise<{ ok: boolean; figures: Fig[]; excerpt: string }> {
  const res = await fetch('https://www.shootsfunding.co.uk/api/admin/read-page', {
    method: 'POST', headers: { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }), signal: AbortSignal.timeout(90_000),
  })
  if (!res.ok) return { ok: false, figures: [], excerpt: '' }
  const r = (await res.json()).results[0]
  return { ok: !!r.ok, figures: r.figures ?? [], excerpt: r.excerpt ?? '' }
}

/** Per-applicant award cue in the sentence around a figure. Same test the
 *  30 August work settled on: a figure on the page is not a ceiling until the
 *  sentence says what an applicant may ask for. */
const AWARD_CUE = /\b(grants?|awards?|funding|apply|request|application)s?\b[^.]{0,60}\b(up to|of up to|between|maximum|max\.?|from|per (year|annum|grant))\b|\b(up to|maximum grant)\b[^.]{0,40}£/i
function awardFigures(figs: Fig[]): Fig[] { return figs.filter(f => AWARD_CUE.test(f.context)) }

type Null = { id: string; name: string; url: string; quote: string; why: string; alsoWriteUp?: string }
type Keep = { id: string; name: string; writeUp?: string; evidence?: Parameters<typeof buildEvidencePatch>[0]; nullMin?: boolean }

// ── Null both, with the page's own words ─────────────────────────────────────
const NULLS: Null[] = [
  { id: '0e506d16-9e5c-47e0-aae9-7f3444b3646c', name: 'TrustLaw', url: 'https://www.trust.org/trustlaw/',
    quote: 'TrustLaw - Our Global Pro Bono Legal Network', why: 'pro bono legal support; the page states no figure' },
  { id: '25466243-4af6-453a-9ea4-5f471919fa30', name: 'Resolution Foundation Workertech Partnership', url: 'https://www.resolutionfoundation.org/ventures',
    quote: 'Resolution Ventures', why: 'the page states no figure; £1,300,000 was the programme, not an award' },
  { id: '469b52bf-f8b9-4b4a-b8cd-54789928562e', name: 'National Digital Inclusion Network membership', url: 'https://www.goodthingsfoundation.org/network',
    quote: 'Join the National Digital Inclusion Network', why: 'membership, not a grant; the page states no figure' },
  { id: '7873fc4e-1763-4f49-9121-40cbfdb2916c', name: 'Eveson Trust', url: 'https://www.eveson.org.uk/',
    quote: 'Apply for a Grant Application Guidelines How to Apply', why: 'the page states no figure; £50,000 came from nowhere on the funder’s site' },
  { id: '3b887829-eff4-41fe-823c-3f8155755b2e', name: 'The Fore', url: 'https://thefore.org/who-we-fund/',
    quote: 'Your annual revenue should be less than £500k', why: 'the only figure is an income threshold, not an award' },
  { id: '57c520fd-c715-478b-8a6e-7c9907044d2a', name: 'Mercers’ Older People and Housing', url: 'https://www.mercers.co.uk/philanthropy/older-people-and-housing',
    quote: 'In 2024-2025 the Older People & Housing programme awarded £2.6 million over 28 grants', why: 'the £2.6 million ceiling was the pool; the £50,000 floor is on no page' },
  { id: '85f9af1e-b1cb-4796-8a7c-163aabec2037', name: 'Gannochy Trust Perth & Kinross', url: 'https://www.gannochytrust.org.uk/our-grants/applying-for-grant-funding/',
    quote: 'a Gannochy Trust Youth Panel Fund which was designed by young people and will provide grants of up to £10,000', why: 'no figure for the main fund; £10,000 belongs to the separate Youth Panel Fund; £30,001 is on no page',
    alsoWriteUp: 'No figure is stated for the main Perth and Kinross grants. The separate Youth Panel Fund offers up to £10,000 for youth health, youth voice and youth mental health projects in Perth and Kinross.' },
  { id: 'a7b1e535-b639-471c-9231-1d87cff07489', name: 'DWF Foundation', url: 'https://dwfgroup.com/en/about-us/dwf-foundation',
    quote: 'the Foundation had distributed grants totalling over £1.5million to good causes', why: 'a pool; no per-grant figure on the page' },
  { id: '142d3163-b0a5-441b-9f8c-b306bd4b1ddd', name: 'Sir James Knott Trust Main Grants', url: 'https://www.knott-trust.co.uk//applications',
    quote: 'We often fund £5,000 per year over 3 years, occasionally fund £15,000 per year over 3 years and rarely fund more than that.', why: 'Paul: £15,000 is typical, not a maximum; £45,000 was our arithmetic',
    alsoWriteUp: 'Small grants of £2,000 or under are handled outside trustee meetings. The Trust often funds £5,000 per year over three years, occasionally £15,000 per year over three years, and rarely more. Applications over £10,000 usually involve an assessor visit.' },
  { id: '757e41c3-07dd-4f84-9f4f-9588a4bcfd41', name: 'Yapp Charitable Trust', url: 'https://yappcharitabletrust.org.uk/what-we-fund/',
    quote: 'We only offer grants to registered charities with a total annual expenditure of less than £50,000', why: 'next page read: the only figure is an expenditure threshold; £3,000 came from a third-party scraper' },
]

// ── Keep the figure; tidy the write-up or add the evidence ───────────────────
const KEEPS: Keep[] = [
  { id: '16ca161d-a373-475e-9032-9944bd5c02e2', name: 'Rudbaxton Parish Education Fund',
    writeUp: 'Up to £2,000 per year. Multi-year grants of up to three years may be considered in exceptional circumstances.' },
  { id: '6e6e8050-27ca-456a-846c-91a1198681fd', name: 'Energy Resilience Fund',
    writeUp: '£25,000 to £250,000 as a blended package, 40% of it grant and the rest loan.' },
  { id: '80141171-c793-470c-b03a-abeae9ea7d79', name: 'Riverside Foundation Community Fund',
    writeUp: 'Small grants of under £3,000. Larger applications are considered separately.' },
  { id: 'd35b05bd-bbb1-4826-aa8f-6dca2739591b', name: 'Suffolk Giving Fund',
    writeUp: 'Up to £3,000 from the Suffolk Giving Fund.' },
  { id: '01aa47c7-4db6-4f51-a129-66ab25e3b548', name: 'St Giles & St George Education Charity',
    writeUp: 'Not stated. The charity reports what it gave in 2024 by grant type but publishes no per-applicant figure.' },
  { id: 'ec676c7f-93b3-404c-aaf9-7bb1ec71b83b', name: 'Postcode Society Trust (South England)',
    evidence: [{ field: 'amount_max', agrees: true, source_url: 'https://www.postcodesocietytrust.org.uk/funding-guide/faqs',
      quote: 'Organisations can apply for up to £50,000 in total for across a 3-year period, dependent on your organisation size.',
      note: 'funder FAQ, verified 2026-08-26; the apply page defers to the eligibility checker' }] },
  { id: 'db00b21f-d51d-470c-9cab-9f34b73fb1e9', name: 'Quartet Express Grant Programme', nullMin: true,
    evidence: [{ field: 'amount_max', agrees: true, source_url: 'https://quartetcf.org.uk/grants/express-grant-programme/',
      quote: 'This grant programme is open for applications all year. Maximum grant awarded: £5,000',
      note: 'the fund’s own page, one link below the apply_url; relink proposed after 11 Sep' }] },
]

async function main() {
  const ids = [...NULLS.map(n => n.id), ...KEEPS.map(k => k.id)]
  const { data, error } = await db.from('scraped_grants').select('*').in('id', ids)
  if (error) throw new Error(error.message)
  if ((data ?? []).length !== ids.length) throw new Error(`expected ${ids.length} rows, got ${data?.length}`)
  const by = Object.fromEntries(data!.map(r => [r.id, r]))
  const landed: string[] = []
  const skipped: string[] = []

  console.log(`NULLS (${NULLS.length})`)
  for (const n of NULLS) {
    const r = by[n.id]
    const before = { amount_min: r.amount_min, amount_max: r.amount_max }
    // Second read, now, before anything is written. A page that cannot be
    // read, or that states a per-applicant award after all, is left alone.
    const page = await readPage(n.url)
    const award = awardFigures(page.figures)
    const stateNothing = before.amount_min === null && before.amount_max === null
    console.log(`\n  ${n.name}: ${before.amount_min ?? 'null'} to ${before.amount_max ?? 'null'} | read ok=${page.ok} figures=${page.figures.length} award-cued=${award.length}`)
    for (const f of award) console.log(`     cue: £${f.figure} "${f.context.replace(/\s+/g, ' ').slice(0, 150)}"`)
    console.log(`     why: ${n.why}`)
    if (!page.ok) { skipped.push(`${n.name}: page unreadable on the second read`); continue }
    // Two rows were ruled on by Paul with the cued figures in front of him:
    // Knott's are the typical amounts, Gannochy's belong to the Youth Panel
    // sub-fund. Any other row where the second read finds an award-cued figure
    // is left for a person.
    const ruled = n.name.startsWith('Sir James Knott') || n.name.startsWith('Gannochy')
    if (!ruled && award.length > 0) {
      skipped.push(`${n.name}: the second read found an award-cued figure, left for a person`); continue
    }
    if (stateNothing && !n.alsoWriteUp) { skipped.push(`${n.name}: already null`); continue }
    if (!APPLY) continue
    const prov = { pinned: false, set_at: NOW, source: SOURCE, citation: { confidence: 'high', snippet: n.quote, url: n.url }, previous: before, why: n.why }
    const body: Record<string, unknown> = {
      field_provenance: { ...(r.field_provenance ?? {}), ...(stateNothing ? {} : { amount_min: prov, amount_max: prov }) },
    }
    if (!stateNothing) { body.amount_min = null; body.amount_max = null }
    const res = await fetch(`${URL_}/rest/v1/scraped_grants?id=eq.${n.id}`, {
      method: 'PATCH', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(body),
    })
    const rows = await res.json()
    if (!res.ok || !Array.isArray(rows) || rows.length !== 1) throw new Error(`${n.name}: null write failed ${res.status} ${JSON.stringify(rows).slice(0, 200)}`)
    const { patch } = buildEvidencePatch([
      { field: 'amount_min', agrees: null, quote: n.quote, source_url: n.url, note: 'we state a figure this page does not' },
      { field: 'amount_max', agrees: null, quote: n.quote, source_url: n.url, note: 'we state a figure this page does not' },
    ], { by: SOURCE })
    await recordFieldEvidence({ id: n.id, patch, db })
    let brief = ''
    if (n.alsoWriteUp) {
      const fb = { ...(r.funder_brief ?? {}), typical_award: n.alsoWriteUp, _ungrounded_amounts: [] }
      const m = await mergeGrantUpdate({ id: n.id, fields: { funder_brief: fb }, source: SOURCE, db })
      if (!m.applied.includes('funder_brief')) throw new Error(`${n.name}: write-up not applied ${JSON.stringify(m.rejected)}`)
      brief = ', write-up'
    }
    landed.push(`${n.name}: ${stateNothing ? 'already null' : `${before.amount_min ?? 'null'} to ${before.amount_max ?? 'null'} → null`}${brief}`)
  }

  console.log(`\nKEEPS (${KEEPS.length})`)
  for (const k of KEEPS) {
    const r = by[k.id]
    console.log(`\n  ${k.name}: ${r.amount_min ?? 'null'} to ${r.amount_max ?? 'null'}${k.writeUp ? ' | write-up' : ''}${k.evidence ? ' | evidence' : ''}${k.nullMin ? ' | floor to null' : ''}`)
    if (!APPLY) continue
    const did: string[] = []
    if (k.writeUp) {
      const fb = { ...(r.funder_brief ?? {}), typical_award: k.writeUp, _ungrounded_amounts: [] }
      const m = await mergeGrantUpdate({ id: k.id, fields: { funder_brief: fb }, source: SOURCE, db })
      if (!m.applied.includes('funder_brief')) throw new Error(`${k.name}: write-up not applied ${JSON.stringify(m.rejected)}`)
      did.push('write-up')
    }
    if (k.nullMin && r.amount_min !== null) {
      const prov = { pinned: false, set_at: NOW, source: SOURCE, citation: { confidence: 'high', snippet: k.evidence![0].quote, url: k.evidence![0].source_url }, previous: { amount_min: r.amount_min } }
      const res = await fetch(`${URL_}/rest/v1/scraped_grants?id=eq.${k.id}`, {
        method: 'PATCH', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ amount_min: null, field_provenance: { ...(r.field_provenance ?? {}), amount_min: prov } }),
      })
      const rows = await res.json()
      if (!res.ok || !Array.isArray(rows) || rows.length !== 1) throw new Error(`${k.name}: floor write failed ${res.status}`)
      did.push(`floor ${r.amount_min} → null`)
    }
    if (k.evidence) {
      const { patch, unquoted } = buildEvidencePatch(k.evidence, { by: SOURCE })
      if (unquoted.length) throw new Error(`${k.name}: unquoted ${unquoted.join(', ')}`)
      await recordFieldEvidence({ id: k.id, patch, db })
      did.push('evidence')
    }
    landed.push(`${k.name}: ${did.join(', ')}`)
  }

  if (!APPLY) { console.log('\nDRY RUN, nothing written. APPLY=1 to write.'); return }

  // What landed, re-derived: does each row still carry an amount code?
  console.log('\nLANDED')
  for (const l of landed) console.log(`  ${l}`)
  if (skipped.length) { console.log('\nSKIPPED'); for (const s of skipped) console.log(`  ${s}`) }
  const { data: after } = await db.from('scraped_grants').select('*').in('id', ids)
  console.log('\nSTILL FLAGGED')
  let still = 0
  for (const r of after ?? []) {
    const codes = deriveReviewReasons(r as ReviewRow).map(c => c.code).filter(c => c === 'amount_unsupported' || c === 'amount_ungrounded')
    if (codes.length) { still++; console.log(`  ${r.title}: ${codes.join(', ')}`) }
  }
  if (still === 0) console.log('  none')
}
main().catch(e => { console.error(e.message); process.exit(1) })
