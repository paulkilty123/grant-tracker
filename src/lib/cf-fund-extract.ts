// AI-extraction pipeline for high-value Community Foundation (CF) funds.
//
// Community Foundations run a portfolio of many small local grant funds
// (often £200-£3,000 — grassroots orgs already know to check their own CF's
// site directly for these) alongside a handful of larger funds (£5k+) that
// ARE worth a real catalogue entry with structured matching, deadline
// alerts and pipeline tracking. This module periodically re-visits each
// CF's funds-listing page, asks Claude to extract every named fund, and
// only keeps the ones at or above AMOUNT_THRESHOLD as scraped_grants rows.
// Everything below threshold is discarded (logged, not silently dropped) —
// the existing "rolling + check our website" umbrella row per CF remains
// the permanent fallback pointer for that tier, this pipeline does not
// replace it.
//
// Deliberately AI-extraction rather than another bespoke DOM scraper (see
// crawl.ts's ~13 existing per-CF scrapers): CF sites vary too wildly in
// structure (card grids, WordPress sitemaps, prose-only listings, some
// with no published amounts at all) for hand-written selectors to
// generalise, and that pattern is exactly what produced much of the thin/
// duplicate data manually cleaned up in the catalogue audit that preceded
// this pipeline.
//
// Root-cause dedup fix: crawl.ts's upsertGrants() dedupes strictly by
// external_id, never by apply_url — different scrapers/manual-adds
// generate different external_ids for the same real-world fund, which is
// exactly how ~13 duplicate CF rows accumulated in the catalogue. This
// module's upsert path checks apply_url (and a funder+title fallback)
// BEFORE falling back to external_id, so repeat runs and cross-source
// collisions both resolve to the same row instead of creating a new one.

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { parse as parseHTML } from 'node-html-parser'
import { mergeGrantUpdate, stampNewGrant } from '@/lib/grant-merge'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!
const EXTRACTION_MODEL  = 'claude-sonnet-4-5-20250929'
const PROVENANCE_SOURCE = 'ai_extract:cf_fund_pipeline'

// Only catalogue a fund individually if a single applicant can receive at
// least this much from it. Below this, the CF's existing rolling+note
// umbrella row is the right place to point users — see project notes.
export const AMOUNT_THRESHOLD = 5000

// Next.js 14 caches fetch() calls by default, including the ones supabase-js
// makes internally — and that cache persists across invocations within a
// single Vercel deployment, not just within one request. Found live this
// session: a query with a STATIC shape (same funder name every run, unlike
// e.g. expire-grants' date-based queries which naturally cache-bust daily)
// kept returning its first-ever "row doesn't exist" response on every
// subsequent call, even after a full process restart — which would have
// caused this weekly cron to silently reinsert duplicates on its second run,
// reintroducing the exact bug class this pipeline exists to fix. Explicit
// cache: 'no-store' on every request this client makes is required, not
// optional, for correctness here.
function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (url, options) => fetch(url, { ...options, cache: 'no-store' }) } },
  )
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

// ── Pilot config — 5 CFs chosen to exercise every part of this pipeline ──────
// Cambridgeshire/Cornwall: verify the threshold correctly discards most of a
//   CF's funds and keeps only the real ones.
// Oxfordshire/Dorset: each already has an individually-catalogued fund added
//   manually this session under a DIFFERENT source/external_id — the critical
//   dedup test is that re-extraction updates that existing row, not duplicates it.
// Sussex: already has a bespoke crawlSussexCF DOM scraper doing a similar
//   umbrella+individual split — tests that the two coexist without collision
//   (kept on a distinct slug/external_id namespace).
export interface CFFundConfig {
  slug:        string
  funderName:  string
  listingUrl:  string
}

export const CF_FUND_SOURCES: CFFundConfig[] = [
  { slug: 'cambridgeshire_cf', funderName: 'Cambridgeshire Community Foundation', listingUrl: 'https://www.cambscf.org.uk/funds/' },
  { slug: 'cornwall_cf',       funderName: 'Cornwall Community Foundation',       listingUrl: 'https://cornwallcommunityfoundation.com/cornwall-charity-grants/grants/' },
  { slug: 'oxfordshire_cf',    funderName: 'Oxfordshire Community Foundation',    listingUrl: 'https://oxfordshire.org/ocfgrants/' },
  { slug: 'dorset_cf',         funderName: 'Dorset Community Foundation',         listingUrl: 'https://www.dorsetcommunityfoundation.org/apply-for-a-grant/grants-for-groups/' },
  { slug: 'sussex_cf_funds',   funderName: 'Sussex Community Foundation',         listingUrl: 'https://sussexcommunityfoundation.org/grants/how-to-apply/' },
]

// ── Extraction types ──────────────────────────────────────────────────────────

interface ExtractedFund {
  name:              string
  amount_min:        number | null
  amount_max:        number | null
  amount_status:     'stated' | 'unstated'
  amount_snippet:    string | null
  deadline:          string | null   // ISO date or null
  is_rolling:        boolean
  deadline_snippet:  string | null
  eligibility_notes: string | null
  apply_url:         string | null
}

export interface CFFundResult {
  slug:                     string
  funderName:               string
  extracted:                number
  atOrAboveThreshold:       number
  discardedBelowThreshold:  number
  discardedUnstated:        number
  inserted:                 number
  updated:                  number
  discardedDetail:          { name: string; amount_max?: number | null; reason: 'below_threshold' | 'unstated' }[]
  errors:                   string[]
}

// ── Page fetch ─────────────────────────────────────────────────────────────────
// Static fetch only, same as crawl.ts's fetchHtml — no JS rendering. A CF
// listing page that needs JS to render its fund list should get a manual
// override URL (e.g. a sitemap, as crawl.ts's crawlCFWales does) rather than
// this pipeline silently returning nothing for it.
async function fetchPageText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-GB,en;q=0.9',
    },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`${url} returned ${res.status}`)
  const html = await res.text()
  const root = parseHTML(html)
  root.querySelectorAll('script, style, noscript').forEach(el => el.remove())
  const text = root.text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  // CF listing pages can enumerate 100+ funds — cap generously.
  return text.slice(0, 18_000)
}

// ── Extraction model call ─────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `You are extracting EVERY individual named grant fund mentioned on a UK Community Foundation's funds/grants listing page — small and large alike. Do not filter or omit anything based on amount; a downstream process decides which funds are worth cataloguing, not you. Your only job is complete, accurately-grounded extraction.

CRITICAL grounding rule: amount_max is what a SINGLE applicant can receive from THIS named fund. Do NOT use a total programme pot, cumulative annual distribution, or a "grants of up to £Xm distributed since Y" figure — those describe the whole portfolio, not one grant. If you cannot find a clear per-applicant amount, set amount_status to "unstated" and leave amount_min/amount_max as null. Never guess a number.

Every amount and deadline you return must be backed by a verbatim snippet from the page text in amount_snippet / deadline_snippet.

Return valid JSON only — no markdown fencing, no commentary.`
}

function buildUserPrompt(funderName: string, pageText: string): string {
  return `Funder: ${funderName}

Page text:
"""
${pageText}
"""

Extract EVERY named fund mentioned on this page, regardless of size — including small funds under £1,000. Do not skip or omit any fund based on its amount; return the complete list and let amount_min/amount_max/amount_status speak for themselves.

Return JSON in this exact format:
{
  "funds": [
    {
      "name": "Fund name",
      "amount_min": 5000,
      "amount_max": 20000,
      "amount_status": "stated",
      "amount_snippet": "verbatim text backing the amount",
      "deadline": "2026-09-04",
      "is_rolling": false,
      "deadline_snippet": "verbatim text backing the deadline or rolling status",
      "eligibility_notes": "brief eligibility summary",
      "apply_url": "https://... specific fund page if linked, else null"
    }
  ]
}`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callExtractionModel(funderName: string, pageText: string): Promise<ExtractedFund[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any = null
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(30_000 * attempt)

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: EXTRACTION_MODEL,
        max_tokens: 8192,
        system: buildSystemPrompt(),
        messages: [{ role: 'user', content: buildUserPrompt(funderName, pageText) }],
      }),
    })

    if (res.ok) { data = await res.json(); break }
    const errText = await res.text()
    if (res.status === 429 || errText.includes('rate_limit')) continue
    throw new Error(`extraction API call failed for ${funderName}: ${errText}`)
  }
  if (!data) throw new Error(`extraction API call exhausted retries for ${funderName}`)

  const textBlock = data.content?.find((b: { type: string }) => b.type === 'text') as { text: string } | undefined
  if (!textBlock?.text) throw new Error(`no text block in extraction response for ${funderName}`)

  let raw = textBlock.text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
  if (!raw.startsWith('{')) {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (jsonMatch) raw = jsonMatch[0]
    else throw new Error(`no JSON found in extraction response for ${funderName}`)
  }

  const parsed = JSON.parse(raw)
  return Array.isArray(parsed.funds) ? parsed.funds : []
}

// ── Dedup + upsert ─────────────────────────────────────────────────────────────

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100)
}

// Normalises a title for fuzzy comparison: lowercases, folds "&"/"and"
// together (found live this session — "Community Wellbeing & Mental Health
// Fund" vs "...and Mental Health Fund" broke a naive substring match, the
// same class of bug as "Elephant & Castle" vs "Elephant Castle" found
// manually auditing London CF), and strips punctuation/whitespace noise.
function normaliseTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

// Root-cause dedup fix (see file header): check apply_url first, then a
// funder+title fuzzy fallback, BEFORE the deterministic external_id lookup.
// This is what catches an existing manually-added row under a different
// external_id/source — the Oxfordshire/Dorset pilot inclusion tests exactly
// this path.
async function findExistingRowId(
  db: SupabaseClient,
  applyUrl: string | null,
  funderName: string,
  fundName: string,
): Promise<string | null> {
  if (applyUrl) {
    const { data } = await db.from('scraped_grants').select('id').eq('apply_url', applyUrl).maybeSingle()
    if (data) return data.id as string
  }
  const { data: candidates } = await db
    .from('scraped_grants')
    .select('id, title')
    .ilike('funder', `%${funderName}%`)
  if (candidates) {
    const fundNorm = normaliseTitle(fundName)
    const match = candidates.find(c => {
      // Existing titles are often prefixed with the funder name (e.g. "X
      // Community Foundation — Y Fund"), which the extracted fund name never
      // is — so containment, not equality, both directions.
      const titleNorm = normaliseTitle(String(c.title))
      return titleNorm === fundNorm || titleNorm.includes(fundNorm) || fundNorm.includes(titleNorm)
    })
    if (match) return match.id as string
  }
  return null
}

async function upsertFund(
  db: SupabaseClient,
  config: CFFundConfig,
  fund: ExtractedFund,
): Promise<'inserted' | 'updated'> {
  const applyUrl   = fund.apply_url || config.listingUrl
  const externalId = fund.apply_url
    ? `cf_fund:${slugify(fund.apply_url)}`
    : `cf_fund:${config.slug}:${slugify(fund.name)}`

  // Content fields only — applied on BOTH insert and update. Deliberately
  // excludes is_active/url_status/pipeline_state: those are new-row-only
  // (see below). Found live this session — a first version of this function
  // included is_active: false unconditionally in the update patch too, which
  // meant re-running the pipeline against a CF that already had an
  // individually-catalogued, published fund (Dorset's Wellbeing Fund) would
  // silently un-publish it — mergeGrantUpdate's state machine treats
  // is_active:false landing on a published row as an explicit admin
  // de-publish action and demotes it to 'captured'. An update must never
  // touch activation state; only a genuinely new row goes through Needs
  // Review.
  const contentFields = {
    external_id:          externalId,
    title:                 fund.name,
    funder:                config.funderName,
    funder_type:           'community_foundation',
    funding_type:          'grant',
    description:           fund.eligibility_notes || null,
    amount_min:            fund.amount_min,
    amount_max:            fund.amount_max,
    deadline:              fund.is_rolling ? null : fund.deadline,
    is_rolling:            fund.is_rolling,
    is_local:              true,
    sectors:               [] as string[],
    eligibility_criteria:  [] as string[],
    apply_url:             applyUrl,
    raw_data: {
      amount_snippet:      fund.amount_snippet,
      deadline_snippet:    fund.deadline_snippet,
      source_listing_url:  config.listingUrl,
    },
  }

  let existingId = await findExistingRowId(db, fund.apply_url, config.funderName, fund.name)
  if (!existingId) {
    const { data } = await db.from('scraped_grants').select('id').eq('external_id', externalId).maybeSingle()
    existingId = (data?.id as string | undefined) ?? null
  }

  if (existingId) {
    await mergeGrantUpdate({ id: existingId, fields: contentFields, source: PROVENANCE_SOURCE, pinned: false, db })
    return 'updated'
  }

  // is_active/url_status are new-row-only — see the comment on contentFields
  // above for why an update must never carry these.
  const row = {
    ...contentFields,
    source:      PROVENANCE_SOURCE,
    is_active:   false, // Needs Review — universal catalogue-addition gate
    url_status:  'unchecked',
  }
  const stamped = stampNewGrant(row, PROVENANCE_SOURCE, { pinned: false })
  const { error } = await db.from('scraped_grants').insert(stamped)
  if (error) throw new Error(error.message)
  return 'inserted'
}

// ── Main entry point ────────────────────────────────────────────────────────────

export async function extractFundsFromCF(config: CFFundConfig): Promise<CFFundResult> {
  const result: CFFundResult = {
    slug: config.slug,
    funderName: config.funderName,
    extracted: 0,
    atOrAboveThreshold: 0,
    discardedBelowThreshold: 0,
    discardedUnstated: 0,
    inserted: 0,
    updated: 0,
    discardedDetail: [],
    errors: [],
  }

  const db = adminClient()

  let pageText: string
  try {
    pageText = await fetchPageText(config.listingUrl)
  } catch (e) {
    result.errors.push(`fetch failed: ${e instanceof Error ? e.message : String(e)}`)
    return result
  }

  let funds: ExtractedFund[]
  try {
    funds = await callExtractionModel(config.funderName, pageText)
  } catch (e) {
    result.errors.push(`extraction failed: ${e instanceof Error ? e.message : String(e)}`)
    return result
  }

  result.extracted = funds.length

  for (const fund of funds) {
    // amount_status is the model's own explicit signal — do not infer intent
    // from nulls alone (see the grounding rule in the system prompt).
    if (fund.amount_status === 'unstated') {
      result.discardedUnstated++
      result.discardedDetail.push({ name: fund.name, reason: 'unstated' })
      continue
    }

    const passesCeiling = fund.amount_max != null && fund.amount_max >= AMOUNT_THRESHOLD
    const passesFloor   = fund.amount_max == null && fund.amount_min != null && fund.amount_min >= AMOUNT_THRESHOLD
    if (!passesCeiling && !passesFloor) {
      result.discardedBelowThreshold++
      result.discardedDetail.push({ name: fund.name, amount_max: fund.amount_max, reason: 'below_threshold' })
      continue
    }

    result.atOrAboveThreshold++
    try {
      const outcome = await upsertFund(db, config, fund)
      if (outcome === 'inserted') result.inserted++
      else result.updated++
    } catch (e) {
      result.errors.push(`write failed for "${fund.name}": ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return result
}
