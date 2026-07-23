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
// Exported so cf-fund-verify.ts can identify this pipeline's own rows without
// duplicating the string literal.
export const PROVENANCE_SOURCE = 'ai_extract:cf_fund_pipeline'

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
// Exported so cf-fund-verify.ts's later pass over this pipeline's own rows
// gets the same no-store fix — it would be exposed to the identical staleness
// bug otherwise (see comment above).
export function adminClient() {
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

// ── Full rollout — 26 more CFs, researched and URL-verified 2026-07-22 ──────
// Deliberately excluded, not forgotten:
//   - Community Foundation Wales, South Yorkshire CF — fund lists render via
//     JS/AJAX; a plain fetch only sees "Loading...". This pipeline is static-
//     fetch-only by design (matches crawl.ts's existing convention of hand-
//     converting JS-heavy pages to static seeds rather than escalating to a
//     headless browser) — Wales already has a sitemap-based DOM scraper
//     (crawlCFWales) that works around this differently; South Yorkshire has
//     no equivalent yet.
//   - East End Community Foundation — no single aggregate listing page, only
//     4 separate borough pages (Tower Hamlets, Hackney, Newham, City of
//     London) with 1-2 funds each. Low yield for the added config complexity.
//   - Essex Community Foundation — only real listing found is a fundholder
//     directory that mixes in closed/legacy funds alongside live ones (noisy).
//     Already has a working rolling+note umbrella row; left alone rather than
//     risk bad extractions.
//   - Cumbria Community Foundation — tested during rollout, not excluded on
//     paper alone: its listing page is ~43k chars (200+ named funds), took
//     2m40s to process even with the raised caps below (a real risk to
//     batch-mates sharing a 270s window), and came back 100% "unstated" for
//     amounts anyway — its page lists fund names only, amounts live on
//     individual per-fund sub-pages this pipeline doesn't follow. Zero yield
//     for outsized cost; would need per-fund-page-following to ever be worth
//     including, which is real extra engineering, not a config change.
//   - "Community Foundation North East" and "Community Foundation Tyne & Wear
//     and Northumberland" are the SAME organisation (same domain,
//     communityfoundation.org.uk) — the DB has both funder-name strings from
//     past scraping, exactly the kind of duplicate-funder confusion this
//     pipeline is meant to avoid creating fresh instances of. Kept as one
//     entry, using the funder name with more existing catalogue rows.
export const CF_FUND_SOURCES: CFFundConfig[] = [
  { slug: 'cambridgeshire_cf', funderName: 'Cambridgeshire Community Foundation', listingUrl: 'https://www.cambscf.org.uk/funds/' },
  { slug: 'cornwall_cf',       funderName: 'Cornwall Community Foundation',       listingUrl: 'https://cornwallcommunityfoundation.com/cornwall-charity-grants/grants/' },
  { slug: 'oxfordshire_cf',    funderName: 'Oxfordshire Community Foundation',    listingUrl: 'https://oxfordshire.org/ocfgrants/' },
  { slug: 'dorset_cf',         funderName: 'Dorset Community Foundation',         listingUrl: 'https://www.dorsetcommunityfoundation.org/apply-for-a-grant/grants-for-groups/' },
  { slug: 'sussex_cf_funds',   funderName: 'Sussex Community Foundation',         listingUrl: 'https://sussexcommunityfoundation.org/grants/how-to-apply/' },

  { slug: 'heart_of_england_cf_funds', funderName: 'Heart of England Community Foundation',              listingUrl: 'https://www.heartofenglandcf.org/available-grants/' },
  { slug: 'bedfordshire_luton_cf',     funderName: 'Bedfordshire and Luton Community Foundation',         listingUrl: 'https://blcf.org.uk/apply-for-a-grant/' },
  { slug: 'berkshire_cf',              funderName: 'Berkshire Community Foundation',                      listingUrl: 'https://berkshirecf.org/available-funding/' },
  { slug: 'cheshire_cf',               funderName: 'Cheshire Community Foundation',                       listingUrl: 'https://www.cheshirecommunityfoundation.org.uk/grants-programmes/' },
  { slug: 'merseyside_cf',             funderName: 'Community Foundation for Merseyside',                 listingUrl: 'https://cfmerseyside.org.uk/our-grants' },
  { slug: 'cf_northern_ireland',       funderName: 'Community Foundation for Northern Ireland',           listingUrl: 'https://www.communityfoundationni.org/achieving-impact/available-grants/' },
  { slug: 'cf_surrey',                 funderName: 'Community Foundation for Surrey',                     listingUrl: 'https://www.cfsurrey.org.uk/apply' },
  { slug: 'tyne_wear_northumberland_cf', funderName: 'Community Foundation Tyne & Wear and Northumberland', listingUrl: 'https://www.communityfoundation.org.uk/apply/' },
  { slug: 'devon_cf',                  funderName: 'Devon Community Foundation',                          listingUrl: 'https://devoncf.com/current-funds/' },
  { slug: 'forever_notts_cf',          funderName: 'Forever Notts (Nottinghamshire Community Foundation)', listingUrl: 'https://www.forevernotts.com/grants/apply-for-grants/' },
  { slug: 'hampshire_iow_cf',          funderName: 'Hampshire & Isle of Wight Community Foundation',       listingUrl: 'https://hiwcf.org.uk/grants-for-groups/' },
  { slug: 'herefordshire_cf',          funderName: 'Herefordshire Community Foundation',                  listingUrl: 'https://www.herefordshirecf.org/our-funds-programmes/' },
  { slug: 'hertfordshire_cf',          funderName: 'Hertfordshire Community Foundation',                  listingUrl: 'https://www.hertscf.org.uk/grant-making' },
  { slug: 'kent_cf',                   funderName: 'Kent Community Foundation',                           listingUrl: 'https://kentcf.org.uk/about-us/our-funds/' },
  { slug: 'leeds_cf_funds',            funderName: 'Leeds Community Foundation',                          listingUrl: 'https://www.leedscf.org.uk/open-grants/' },
  { slug: 'leicestershire_rutland_cf', funderName: 'Leicestershire and Rutland Community Foundation',     listingUrl: 'https://www.llrcommunityfoundation.org.uk/our-grants/apply-for-a-grant/' },
  { slug: 'lincolnshire_cf',           funderName: 'Lincolnshire Community Foundation',                   listingUrl: 'https://lincolnshirecf.co.uk/available-grants/' },
  { slug: 'london_cf_funds',           funderName: 'London Community Foundation',                         listingUrl: 'https://londoncf.org.uk/apply/available-grants' },
  { slug: 'norfolk_cf',                funderName: 'Norfolk Community Foundation',                        listingUrl: 'https://www.norfolkfoundation.com/funding-support/grants/groups/' },
  { slug: 'northamptonshire_cf',       funderName: 'Northamptonshire Community Foundation',               listingUrl: 'https://www.ncf.uk.com/grants/grants-available' },
  { slug: 'quartet_cf_funds',          funderName: 'Quartet Community Foundation',                        listingUrl: 'https://quartetcf.org.uk/apply-for-funding/apply-for-a-grant/' },
  { slug: 'somerset_cf',               funderName: 'Somerset Community Foundation',                       listingUrl: 'https://www.somersetcf.org.uk/grants-and-funding/grants-and-funding-for-groups/' },
  { slug: 'suffolk_cf',                funderName: 'Suffolk Community Foundation',                        listingUrl: 'https://suffolkcf.org.uk/current-grants/' },
  { slug: 'two_ridings_cf_funds',      funderName: 'Two Ridings Community Foundation',                    listingUrl: 'https://tworidingscf.org.uk/apply-for-funding/' },
  { slug: 'wiltshire_swindon_cf',      funderName: 'Wiltshire and Swindon Community Foundation',          listingUrl: 'https://www.wscf.org.uk/grants-and-support/groups/' },
]

// ── Extraction types ──────────────────────────────────────────────────────────

interface DeadlineCycleEntry {
  day:    number
  month:  number
  label?: string
}

interface ExtractedFund {
  name:              string
  amount_min:        number | null
  amount_max:        number | null
  // 'uncapped' is distinct from 'unstated': found live on Suffolk CF's
  // Sizewell C Community Fund ("Provides up to £23m... Maximum grant: No
  // maximum") — a fund that explicitly states it has NO per-grant ceiling is
  // not the same as a fund that just never mentions an amount, and treating
  // them the same discarded the single largest, most significant fund on
  // the whole page for the same reason a genuinely-too-vague-to-catalogue
  // fund gets discarded.
  amount_status:     'stated' | 'unstated' | 'uncapped'
  amount_snippet:    string | null
  deadline:          string | null   // ISO date or null
  is_rolling:        boolean
  deadline_snippet:  string | null
  deadline_cycle:    DeadlineCycleEntry[] | null
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
  // Foundation-wide operational notices (e.g. a new application portal
  // launching) found alongside the per-fund listing — see buildSystemPrompt.
  // `applied` is only ever true when there was exactly one unambiguous
  // existing non-pipeline row for this funder AND the write wasn't rejected
  // by the trust ladder (umbrella rows fixed by an admin earlier this
  // project are pinned admin-trust, which correctly refuses an automated
  // overwrite — see applyFunderNotice).
  funderNotice:             { text: string; applied: boolean; reason: string } | null
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

  // Found live on Suffolk CF's page: every fund's apply_url was coming back
  // as the shared listing page URL, not that fund's own "More about this
  // fund" page — because a plain .text strip throws away every href
  // attribute, leaving the model nothing but the visible label to work with.
  // Inline each link's resolved absolute URL right after its own text so the
  // information survives being flattened to plain text.
  root.querySelectorAll('a').forEach(a => {
    const href  = a.getAttribute('href')
    const label = a.text.trim()
    if (!href || !label) return
    let absolute: string
    try { absolute = new URL(href, url).toString() } catch { return }
    a.set_content(`${label} [URL: ${absolute}]`)
  })

  const text = root.text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  // Most CF listing pages run 5k-15k chars stripped (10-40 funds). Cumbria CF
  // is a known outlier at ~43k chars (200+ named funds) — this cap won't
  // fully cover it even raised this far, and the model's max_tokens budget
  // couldn't return 200 funds' worth of structured JSON in one call anyway.
  // Accepted as a documented partial-coverage case rather than building
  // multi-call pagination for one outlier; flag if Cumbria's results look thin.
  return text.slice(0, 30_000)
}

// ── Extraction model call ─────────────────────────────────────────────────────

function buildSystemPrompt(todayISO: string): string {
  return `You are extracting EVERY individual named grant fund mentioned on a UK Community Foundation's funds/grants listing page — small and large alike. Do not filter or omit anything based on amount; a downstream process decides which funds are worth cataloguing, not you. Your only job is complete, accurately-grounded extraction.

Today's date is ${todayISO}. This matters for deadlines: found live in production data — a fund whose page states a recurring pattern like "Application deadlines: 1 February, 1 August" was extracted with deadline "2025-02-01", a date in the PAST, because the year was guessed rather than reasoned from today's date. When a fund's deadline is described as a recurring pattern (multiple dates per year, "next closing date", etc.), you MUST compute the NEXT occurrence strictly after ${todayISO} — never return a deadline date that has already passed.

CRITICAL grounding rule: amount_max is what a SINGLE applicant can receive from THIS SPECIFIC named fund. Do NOT use a total programme pot, cumulative annual distribution, or a "grants of up to £Xm distributed since Y" figure — those describe the whole portfolio, not one grant. Also found live in production data — a foundation's page had a single page-wide disclaimer ("Most of our funds are for grants under £10,000") that got wrongly copied onto EVERY fund as if each one specifically said this. A statement about the foundation's funds IN GENERAL, or about "most" of its funds, is NOT evidence for any ONE named fund's specific amount — if a fund has no amount stated for IT BY NAME, set amount_status to "unstated" even if a general/aggregate statement exists elsewhere on the page. Never guess a number, and never reuse one generic statement across multiple funds unless the page explicitly states that exact figure applies to each of them by name.

UNCAPPED FUNDS — a fund can also explicitly state it has NO per-grant maximum (e.g. "Maximum grant: No maximum", "grants are uncapped", alongside a total programme figure like "Provides up to £23m to local charities"). This is different from a fund that simply never mentions money at all. When the page explicitly says there is no cap, set amount_status to "uncapped" (not "unstated"), leave amount_max null, and put the total-programme context (if any) in eligibility_notes as background — never in amount_max, which must always mean a single applicant's own ceiling, never the whole programme's size.

Every amount and deadline you return must be backed by a verbatim snippet from the page text in amount_snippet / deadline_snippet.

LINK FORMAT — links on this page appear inline as "visible text [URL: https://...]". When a fund's own details are followed by a link like "More about this fund… [URL: https://example.org/grants/my-fund/]" or "Apply here [URL: ...]", that URL is THIS fund's own apply_url — prefer it over the general listing page URL. If no such per-fund link is present near a fund's details, leave apply_url null (a downstream process falls back to the listing page).

FOUNDER-WIDE NOTICE — separately from individual funds, note whether the page states an important operational change to the APPLICATION PROCESS ITSELF — e.g. a new funding portal or platform launching, a registration requirement, a change to how you submit. This is different from any one fund's eligibility criteria. Only report this if it's a genuine process-level announcement, not routine guidance (e.g. "use Chrome, not Safari" is not a notice). If present, summarise it in 1-2 sentences in the top-level funder_notice field; otherwise set it to null.

DEADLINE CYCLE — a fund with a genuinely recurring annual pattern (e.g. "two deadlines per year in May and October", "applications close 8 May, 31 August and 11 December each year") needs more than just its next deadline captured, or a downstream process has no way to know a further round is coming once that one date passes. When the page explicitly states day-of-month + month for each recurring round, ALSO populate deadline_cycle as an array of {day, month, label} objects (label optional, e.g. "Round 1"). Only populate it from genuinely recurring dates stated with day-of-month + month for each occurrence — do not populate it from a single one-off deadline, from decision/notification dates, or from a strategy period (e.g. "2025-2027" is not a cycle). If no recurring cycle is stated, set deadline_cycle to null — do not guess or infer one from vague language like "we run several rounds a year" with no specific dates given.

Return valid JSON only — no markdown fencing, no commentary.`
}

function buildUserPrompt(funderName: string, pageText: string, todayISO: string): string {
  return `Funder: ${funderName}
Today's date: ${todayISO}

Page text:
"""
${pageText}
"""

Extract EVERY named fund mentioned on this page, regardless of size — including small funds under £1,000. Do not skip or omit any fund based on its amount; return the complete list and let amount_min/amount_max/amount_status speak for themselves.

For any deadline, compute the next occurrence strictly after ${todayISO} — if the page states a recurring pattern (e.g. two dates a year), pick whichever of those dates is soonest after today, rolling into next year if every stated date this year has already passed. If that recurring pattern gives explicit day-of-month + month for each round, also populate deadline_cycle (see system instructions) — otherwise leave it null.

For apply_url, use the per-fund link (formatted "text [URL: ...]" per the system instructions) that appears with that fund's own details, not the page's own URL.

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
      "deadline_cycle": null,
      "eligibility_notes": "brief eligibility summary",
      "apply_url": "https://... specific fund page if linked, else null"
    }
  ],
  "funder_notice": null
}`
}

interface ExtractionResult {
  funds:         ExtractedFund[]
  funderNotice:  string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callExtractionModel(funderName: string, pageText: string): Promise<ExtractionResult> {
  const todayISO = new Date().toISOString().slice(0, 10)
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
        max_tokens: 16384, // raised from 8192 for larger CFs (Kent 40+ funds, etc.) — see fetchPageText's cap comment for the one known outlier this still doesn't fully solve
        system: buildSystemPrompt(todayISO),
        messages: [{ role: 'user', content: buildUserPrompt(funderName, pageText, todayISO) }],
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
  return {
    funds:        Array.isArray(parsed.funds) ? parsed.funds : [],
    funderNotice: typeof parsed.funder_notice === 'string' && parsed.funder_notice.trim() ? parsed.funder_notice.trim() : null,
  }
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
    // Only ever included when the model actually found a stated recurring
    // pattern — omitted (not written as null) otherwise, so a later run that
    // DOES find cycle detail (or an admin who adds one manually) is never
    // clobbered by an earlier run's "no cycle found" result.
    ...(fund.deadline_cycle && fund.deadline_cycle.length > 0 ? { deadline_cycle: fund.deadline_cycle } : {}),
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

// A foundation-wide operational notice (see buildSystemPrompt) belongs on
// the CF's own general/rolling catalogue row, not any one individual fund —
// but this pipeline only ever inserts/updates individual funds, so that row
// has to be found separately. Deliberately conservative: only write when
// there's exactly one unambiguous candidate (any non-pipeline-sourced row
// for this funder). Multiple matches, or none, are surfaced rather than
// guessed at.
//
// Found live this session: Suffolk's own umbrella row was fixed by an admin
// earlier this project (source admin:cf-hub-relabel-2026-06-24, pinned) —
// which correctly BLOCKS this pipeline's ai_extract-trust write, per the
// same trust ladder that stops any lower-trust source clobbering a
// deliberate admin correction. That's not a bug to route around; it's
// reported honestly via the returned `reason` so a human can decide whether
// to apply the suggested text by hand, exactly like the urls/page.tsx enrich
// handlers already surface a `rejected` array instead of silently showing
// content that didn't save.
async function applyFunderNotice(
  db: SupabaseClient,
  config: CFFundConfig,
  notice: string,
): Promise<{ text: string; applied: boolean; reason: string }> {
  const { data: candidates, error } = await db
    .from('scraped_grants')
    .select('id, description')
    .eq('funder', config.funderName)
    .neq('source', PROVENANCE_SOURCE)

  if (error) return { text: notice, applied: false, reason: `candidate lookup failed: ${error.message}` }
  if (!candidates || candidates.length === 0) return { text: notice, applied: false, reason: 'no existing umbrella row found for this funder' }
  if (candidates.length > 1) return { text: notice, applied: false, reason: `${candidates.length} candidate rows found for this funder — ambiguous, left for manual placement` }

  const [target] = candidates
  const existingDescription = (target.description as string | null) ?? ''
  if (existingDescription.includes(notice)) return { text: notice, applied: false, reason: 'already present' }

  const newDescription = existingDescription ? `${existingDescription}\n\n${notice}` : notice
  const { rejected } = await mergeGrantUpdate({
    id: target.id as string,
    fields: { description: newDescription },
    source: PROVENANCE_SOURCE,
    pinned: false,
    db,
  })
  if (rejected.some(r => r.field === 'description')) {
    return { text: notice, applied: false, reason: `blocked by trust ladder (${rejected.find(r => r.field === 'description')?.reason}) — apply by hand if wanted` }
  }
  return { text: notice, applied: true, reason: 'appended to existing umbrella row' }
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
    funderNotice: null,
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
  let funderNotice: string | null
  try {
    ;({ funds, funderNotice } = await callExtractionModel(config.funderName, pageText))
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

    // 'uncapped' funds explicitly state there's no per-grant ceiling, so
    // there's no maximum to compare against AMOUNT_THRESHOLD — they always
    // qualify (see the ExtractedFund.amount_status comment for why this is
    // NOT the same as 'unstated').
    const passesCeiling = fund.amount_status === 'uncapped'
      || (fund.amount_max != null && fund.amount_max >= AMOUNT_THRESHOLD)
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

  if (funderNotice) {
    try {
      result.funderNotice = await applyFunderNotice(db, config, funderNotice)
    } catch (e) {
      result.errors.push(`funder notice failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return result
}
