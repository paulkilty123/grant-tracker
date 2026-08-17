// Stage researched funding opportunities into the catalogue for review.
//
//   npx tsx scripts/stage-researched-grants.ts <candidates.json>          # dry run
//   npx tsx scripts/stage-researched-grants.ts <candidates.json> --apply
//
// THREE TRAPS THIS AVOIDS, each of which has bitten before:
//
// 1. DEDUP BEFORE INSERT, IN SQL. Near-duplicate funder names are the failure
//    mode — the catalogue already carries "Granada Foundation" AND "The Granada
//    Foundation", "Zochonis Charitable Trust" AND "The Zochonis Charitable
//    Trust". Matching is done on a normalised key (lowercased, leading "the"
//    stripped, punctuation removed) against BOTH funder and apply_url.
//
// 2. NEVER an `admin:` source. mergeGrantUpdate reads any admin-prefixed source
//    as a human decision at trust 100 and pins it, which permanently blocks
//    Re-enrich from ever improving the row — a silent flash-then-revert in the
//    Needs Review UI. Nothing here has been reviewed by a human yet, so it goes
//    in at `system:` (trust 50), below ai_enrich, so enrichment can still write.
//
// 3. is_active = false, ALWAYS. Every catalogue addition sits behind the review
//    gate until Paul activates it. stampNewGrant() derives the pipeline_state
//    rather than letting a raw insert default to 'captured'.
//
// Input JSON: array of objects with at least { funder, title, apply_url }, plus
// any of: description, amount_min, amount_max, deadline, is_rolling,
// location_tag, funding_type, funder_type, who_can_apply, what_they_fund,
// impact_sectors, target_beneficiaries, eligible_structures, source_note.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stampNewGrant } from '../src/lib/grant-merge'

const HERE = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(resolve(HERE, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

// Overridable so this script serves more than the one batch it was written for.
// Default unchanged, so a re-run of the July batch behaves identically.
// MUST stay non-`admin:` whatever is passed — see trap 2 above.
const SOURCE = process.argv.find(a => a.startsWith('--source='))?.slice('--source='.length)
  ?? 'system:research-manchester-homelessness-2026-07-28'
if (SOURCE.startsWith('admin:')) {
  console.error('refusing an admin: source — nothing staged here has been reviewed by a human yet')
  process.exit(1)
}

/** Prefix for the generated `external_id`. Overridable for the same reason. */
const ID_PREFIX = process.argv.find(a => a.startsWith('--prefix='))?.slice('--prefix='.length) ?? 'research'

interface Candidate {
  funder: string
  title: string
  apply_url: string
  description?: string
  amount_min?: number | null
  amount_max?: number | null
  deadline?: string | null
  /** For a fund that is shut now with a known reopening — free text, as the column expects. */
  next_open_date?: string | null
  is_rolling?: boolean
  location_tag?: string | null
  funding_type?: string
  funder_type?: string
  who_can_apply?: string
  what_they_fund?: string
  impact_sectors?: string[]
  target_beneficiaries?: string[]
  eligible_structures?: string[]
  source_note?: string
}

/** Normalised key for duplicate detection. "The Granada Foundation" -> "granada foundation". */
const norm = (s: string) =>
  (s ?? '').toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim()

/** Host + path, so trailing slashes and query strings don't hide a duplicate. */
function urlKey(u: string): string {
  try { const p = new URL(u); return (p.host + p.pathname).replace(/\/$/, '').toLowerCase() }
  catch { return (u ?? '').toLowerCase() }
}

async function main() {
  const file = process.argv[2]
  const apply = process.argv.includes('--apply')
  if (!file) { console.error('Usage: npx tsx scripts/stage-researched-grants.ts <candidates.json> [--apply]'); process.exit(1) }

  const candidates = JSON.parse(readFileSync(file, 'utf8')) as Candidate[]
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })

  // Existing catalogue, indexed for dedup. Paginated — the table is well over
  // the 1000-row default and a short read would silently pass duplicates.
  const existingFunders = new Set<string>()
  const existingTitles  = new Set<string>()
  const existingUrls    = new Set<string>()
  let total = 0
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('scraped_grants').select('funder, title, apply_url').range(from, from + 999)
    if (error) throw new Error(error.message)
    for (const r of data ?? []) {
      total++
      if (r.funder) existingFunders.add(norm(String(r.funder)))
      if (r.funder && r.title) existingTitles.add(`${norm(String(r.funder))}::${norm(String(r.title))}`)
      if (r.apply_url) existingUrls.add(urlKey(String(r.apply_url)))
    }
    if (!data || data.length < 1000) break
  }
  console.log(`\nexisting catalogue rows indexed: ${total}`)

  const toInsert: Record<string, unknown>[] = []
  const skipped: string[] = []
  const seenThisRun = new Set<string>()

  for (const c of candidates) {
    if (!c.funder || !c.title || !c.apply_url) { skipped.push(`INCOMPLETE  ${c.funder ?? '?'} — ${c.title ?? '?'}`); continue }
    const fk = norm(c.funder)
    const tk = `${fk}::${norm(c.title)}`
    const uk = urlKey(c.apply_url)

    if (seenThisRun.has(tk) || seenThisRun.has(uk)) { skipped.push(`DUP IN BATCH  ${c.funder} — ${c.title}`); continue }
    if (existingTitles.has(tk)) { skipped.push(`DUP title+funder  ${c.funder} — ${c.title}`); continue }
    if (existingUrls.has(uk))   { skipped.push(`DUP apply_url     ${c.funder} — ${c.title}  (${c.apply_url})`); continue }
    // Same funder, different fund: allowed, but worth surfacing so a human can
    // confirm it is a genuinely separate programme and not a re-titling.
    const sameFunder = existingFunders.has(fk)

    seenThisRun.add(tk); seenThisRun.add(uk)

    const externalId = `${ID_PREFIX}-${norm(c.funder).replace(/\s+/g, '-')}-${norm(c.title).replace(/\s+/g, '-')}`.slice(0, 100)
    const row: Record<string, unknown> = {
      external_id:  externalId,
      source:       'research_batch',
      title:        c.title.trim(),
      funder:       c.funder.trim(),
      funder_type:  c.funder_type ?? 'trust_foundation',
      funding_type: c.funding_type ?? 'grant',
      description:  c.description ?? null,
      amount_min:   c.amount_min ?? null,
      amount_max:   c.amount_max ?? null,
      deadline:       c.deadline ?? null,
      next_open_date: c.next_open_date ?? null,
      is_rolling:     c.is_rolling ?? false,
      location_tag: c.location_tag ?? null,
      apply_url:    c.apply_url.trim(),
      impact_sectors:       c.impact_sectors ?? [],
      target_beneficiaries: c.target_beneficiaries ?? [],
      eligible_structures:  c.eligible_structures ?? [],
      // The brief is what the enricher and the classifier both read. Populating
      // who_can_apply here is what lets the eligibility vocabulary backstop do
      // its job on the very first pass rather than after a re-enrich.
      funder_brief: (c.who_can_apply || c.what_they_fund) ? {
        who_can_apply:  c.who_can_apply ?? null,
        what_they_fund: c.what_they_fund ?? null,
        source:         'desk_research',
      } : null,
      is_active:  false,          // review gate — never live on insert
      url_status: 'unchecked',
      raw_data:   { research_note: c.source_note ?? null, staged_on: new Date().toISOString().slice(0, 10), staged_by: SOURCE },
    }
    toInsert.push({ ...stampNewGrant(row, SOURCE), _sameFunder: sameFunder })
  }

  console.log(`candidates: ${candidates.length}   to insert: ${toInsert.length}   skipped: ${skipped.length}\n`)
  for (const s of skipped) console.log(`  ${s}`)
  console.log('')
  for (const r of toInsert) {
    console.log(`  + ${r.funder} — ${r.title}${r._sameFunder ? '   [funder already in catalogue, different fund]' : ''}`)
  }

  if (!apply) { console.log('\nDRY RUN — nothing written. Re-run with --apply.\n'); return }

  let ok = 0, failed = 0
  for (const r of toInsert) {
    const { _sameFunder, ...row } = r as Record<string, unknown> & { _sameFunder?: boolean }
    void _sameFunder
    const { error } = await db.from('scraped_grants').insert(row)
    if (error) { failed++; console.error(`  FAILED ${row.funder} — ${row.title}: ${error.message}`) }
    else ok++
  }
  console.log(`\nstaged ${ok}, failed ${failed} — all inactive, awaiting review\n`)
}

main().catch(e => { console.error(e); process.exit(1) })
