import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { syncLocationFields, preserveEligibilityFields } from '@/lib/funder-brief'
import { requireAdmin, isAdminBearerToken } from '@/lib/auth/require-admin'
import { mergeGrantUpdate, type ProvenanceEntry } from '@/lib/grant-merge'
import { extractIncomeGate } from '@/lib/extract-income-gate'
import { extractInvestmentTerms } from '@/lib/extract-investment-terms'
import { buildAwardText, extractGrantAmounts } from '@/lib/grant-amounts'
import { detectUncapturedMultiRound } from '@/lib/grant-deadlines'
import { recordGrantFlags, type GrantFlagCode } from '@/lib/grant-flags'
import { excerptWithMeta, excerptNotice, type Excerpted } from '@/lib/page-excerpt'
import { htmlToText } from '@/lib/page-text'

type Citation = NonNullable<ProvenanceEntry['citation']>

export const maxDuration = 45 // seconds — requires Vercel Pro

// Bump when the enrichment prompt below changes materially.
// v2 (2026-05-27): citation + confidence per field, structured _deadline_cycle
// extraction. See docs/pipeline-v1-spec.md §4 and §6.
const ENRICH_VERSION    = 'v2'
const PROVENANCE_SOURCE = `ai_enrich:${ENRICH_VERSION}`

/** Named so the usage tally and the call site cannot drift apart. */
const ENRICH_MODEL = 'claude-haiku-4-5-20251001'

// Deterministic org-income gate parse runs alongside the LLM brief but writes
// under its own source/trust (ai_extract = 50) so a verified gate survives the
// daily crawl. Re-derived on every enrich so a removed gate clears itself.
const INCOME_SOURCE = 'ai_extract:income:v1'

// Deterministic social-investment terms parse — same trust tier as the income
// gate. Only runs for funding_type='investment'. Writes si_security_required +
// si_interest_rate_percent resolved-or-null so a removed term self-clears.
const INVESTMENT_SOURCE = 'ai_extract:investment:v1'

// Per-applicant grant amounts, derived from the brief + description by the
// shared cue-based extractor in src/lib/grant-amounts.ts.
//
// Added 2026-07-25. Before this, the automated chain (process-pipeline-queue →
// enrich → classify → sweep) never derived amounts at all: the pool-aware logic
// existed only in the admin UI and ran when a human clicked "Detect all", and
// the only automated alternative was api/admin/fill-amounts, a cruder regex that
// wrote a funder's total annual distribution as the per-applicant figure.
//
// Trust 50 (`ai_extract:*`), deliberately: that is ABOVE `scraper` (40), so a
// derived amount survives the next crawl. fill-amounts writes as `ai_detect:*`
// (trust 30), below scraper, so its values are erased twice a week — which is
// why this, not that route, is the durable path.
const AMOUNTS_SOURCE = 'ai_extract:amounts:v1'

// Source string for quality flags written to raw_data.checks. Separate from the
// field-writing sources above because recordGrantFlags is idempotent PER SOURCE:
// every flag this route raises must share one source so a re-run replaces the
// whole set rather than accumulating duplicates.
const CHECKS_SOURCE = 'system:enrich_checks:v1'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

async function isAuthorised(req: NextRequest): Promise<boolean> {
  if (isAdminBearerToken(req.headers.get('authorization'))) return true
  const auth = await requireAdmin()
  return auth.ok
}

// ── Stale-date detector ──────────────────────────────────────────────────────
// Scans brief text fields for month-year date phrases (e.g. "expected
// December 2025", "next round opens autumn 2025", "as of January 2026") and
// flags any whose date is more than 30 days in the past. Catches the Growth
// Catalyst / Smart Grants failure mode: enrichment captured correct content
// at the time but the page itself was stale.
//
// Positive context (staleness signals): expect / next / opens / closes / as of
// / shortly / soon / TBC / upcoming / launching / will launch.
// Negative context (historical, not stale): since / from / founded / established
// / operating since / started / launched in / first awarded.
const STALE_MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10,
  nov: 11, november: 11, dec: 12, december: 12,
}
const STALE_CONTEXT_RE = /\b(?:expect(?:ed|ing)?|next round|round (?:opens?|closes?|closing)|opens?(?:\s+(?:in|on))?|opening|closes?|closing|as of|by|shortly|soon|upcoming|will (?:launch|open|close)|launching|launched|due to (?:open|close|launch)|new round)\b/i
const HISTORICAL_CONTEXT_RE = /\b(?:since|from|founded|established|operating since|running since|in operation since|started|launched in|first awarded|distributed since|set up in|incorporated|created in)\b/i

function detectStaleDates(
  text: string,
  today: Date,
): Array<{ phrase: string; matched_date: string }> {
  if (!text || text.length < 10) return []
  const stale: Array<{ phrase: string; matched_date: string }> = []
  const cutoff = new Date(today)
  cutoff.setDate(cutoff.getDate() - 30) // 30-day grace

  // Match "{month} {year}" in either order, with optional weasel words between
  const re = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{4})\b/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const monthKey = m[1].toLowerCase()
    const month = STALE_MONTHS[monthKey] ?? STALE_MONTHS[monthKey.slice(0, 3)]
    const year = parseInt(m[2], 10)
    if (!month || year < 2020 || year > 2050) continue

    // Last day of the named month — "October 2025" only becomes stale once
    // we're past the whole month.
    const parsed = new Date(Date.UTC(year, month, 0))
    if (parsed >= cutoff) continue

    // Inspect surrounding context (60 chars before, 30 after) for positive
    // staleness signals vs negative historical signals.
    const ctxStart = Math.max(0, m.index - 60)
    const ctxEnd   = Math.min(text.length, m.index + m[0].length + 30)
    const context  = text.slice(ctxStart, ctxEnd)
    if (HISTORICAL_CONTEXT_RE.test(context)) continue
    if (!STALE_CONTEXT_RE.test(context)) continue

    const phraseStart = Math.max(0, m.index - 30)
    const phraseEnd   = Math.min(text.length, m.index + m[0].length + 25)
    stale.push({
      phrase:       text.slice(phraseStart, phraseEnd).trim(),
      matched_date: `${year}-${String(month).padStart(2, '0')}`,
    })
  }
  return stale
}

// ── Numeric-grounding guard (amounts) ─────────────────────────────────────────
// Numbers are uniquely verifiable: a grant amount is either present in the
// source or it isn't (unlike a sector/structure, which is a judgement call). The
// enricher occasionally states a money figure with no source basis — the live
// failure mode from the 18 Jun review was a source reading "up to £20,000/year,
// max £40,000" surfacing as "£150,000 / £1 million". This flags any £-figure in
// typical_award that is NOT grounded in the field's own (verbatim) citation
// snippet or the original scrape, mirroring the stale-date detector: it lowers
// the field's citation confidence and records _ungrounded_amounts for review.
// ADVISORY ONLY — never rewrites the value. A ±10% / ±£1,000 tolerance absorbs
// honest rounding ("around £300k" vs source "£319k"); fabrication falls outside.
function extractMoneyAmounts(text: string): number[] {
  if (!text) return []
  const out: number[] = []
  // (?![a-z]) stops a k/m/bn suffix matching the first letter of a following
  // word — e.g. "£4,000 Match" must read £4,000, not £4,000m (£4bn).
  const re = /£\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s?(k|m|bn|million|billion)?(?![a-z])/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    let n = parseFloat(m[1].replace(/,/g, ''))
    const suffix = (m[2] ?? '').toLowerCase()
    if (suffix === 'k') n *= 1_000
    else if (suffix === 'm' || suffix === 'million') n *= 1_000_000
    else if (suffix === 'bn' || suffix === 'billion') n *= 1_000_000_000
    if (Number.isFinite(n) && n > 0) out.push(Math.round(n))
  }
  return out
}

// Money figures stated in `value` with no match (within ±10% or ±£1,000) in the
// grounding text. Non-empty → the field asserts amounts the source doesn't.
function detectUngroundedAmounts(value: string, groundingText: string): number[] {
  const stated = extractMoneyAmounts(value)
  if (stated.length === 0) return []
  const grounded = extractMoneyAmounts(groundingText)
  return stated.filter(a => {
    const tol = Math.max(a * 0.1, 1000)
    return !grounded.some(g => Math.abs(g - a) <= tol)
  })
}

// Fetch page text with realistic browser headers, strip HTML tags
/**
 * Reader-proxy fallback for funders whose WAF refuses non-browser clients.
 *
 * 21 catalogue rows across 16 hosts — Arts Council England, Historic England,
 * Groundwork, camden.gov.uk, Spacehive and others — return HTTP 403 to every
 * plain fetch. Measured 2026-07-25: four different header profiles (the current
 * one, a full Chrome set with sec-ch-ua, Googlebot, and no headers at all) all
 * got an identical 403, and `curl` got 403 too. So this is TLS/behavioural
 * fingerprinting at the WAF, not anything a User-Agent can talk its way past.
 *
 * The consequence was silent and bad: the fetch failed, enrichment fell through
 * to the knowledge_fallback path, and the brief got written from the model's
 * memory instead of the funder's page. Those rows then sat in the review queue
 * flagged unreadable, and re-reading them could never work — it just spent
 * another LLM call to write another brief from memory.
 *
 * A reader proxy renders the page and returns text, which does get through.
 *
 * OFF BY DEFAULT. Set READER_PROXY_URL to enable (e.g. "https://r.jina.ai/").
 * It is gated because it sends the funder URL to a third party, which is a
 * deployment decision rather than a code one — public grant pages, but still an
 * external dependency in the enrichment path and a service that then knows which
 * pages we read. Unset, behaviour is exactly as before.
 *
 * Only ever called AFTER a direct fetch has already failed, so it costs nothing
 * on the ~95% of hosts that work normally.
 */
async function fetchViaReaderProxy(url: string): Promise<Excerpted> {
  const base = process.env.READER_PROXY_URL
  if (!base) throw new Error('reader proxy not configured')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/${url}`, {
      signal: controller.signal,
      headers: {
        Accept: 'text/plain',
        ...(process.env.READER_PROXY_KEY ? { Authorization: `Bearer ${process.env.READER_PROXY_KEY}` } : {}),
      },
    })
    if (!res.ok) throw new Error(`reader proxy HTTP ${res.status}`)
    // Already text/markdown, so no tag stripping — just the same excerpting the
    // direct path uses, to keep the prompt the same size either way.
    return excerptWithMeta((await res.text()).replace(/\s{2,}/g, ' ').trim())
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchPageText(url: string): Promise<Excerpted> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.9',
        // Intentionally exclude 'br' — Node's native fetch decompresses gzip
        // and deflate but NOT Brotli, so advertising 'br' makes some servers
        // (e.g. greenhallfoundation.org on its WP host) return Brotli bytes
        // we then process as garbage HTML, silently falling through to the
        // knowledge_fallback path with all amounts/dates dropped.
        'Accept-Encoding': 'gzip, deflate',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Upgrade-Insecure-Requests': '1',
      },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const html = await res.text()
    // Visible text PLUS copy the markup holds in attributes or script JSON —
    // a plain tag strip reads bernardsunley.org/how-to-apply/ as 496 characters
    // of footer. See src/lib/page-text.ts.
    const stripped = htmlToText(html)
    // ~3k tokens, but chosen around funding wording rather than taken off the
    // top. AF3's first 12,000 characters are the theme's inline CSS; its amount,
    // closing date and eligibility all sit past 15,000. See page-excerpt.ts.
    return excerptWithMeta(stripped)
  } finally {
    clearTimeout(timeout)
  }
}

export async function POST(req: NextRequest) {
  if (!await isAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { grantId, pastedContent, additionalSources } = await req.json() as {
    grantId: string
    pastedContent?: string
    additionalSources?: Array<{ label: string; text?: string; url?: string }>
  }
  if (!grantId) return NextResponse.json({ error: 'grantId required' }, { status: 400 })

  // Load grant
  const { data: grant, error } = await supabase
    .from('scraped_grants')
    // raw_data is selected so the amount-conflict writer below can merge into it
    // rather than replacing it. Without it, `...existingRaw` would spread an
    // undefined-shaped {} and silently drop any existing raw_data keys (e.g.
    // cf-fund-verify's verify.flags).
    // deadline, is_rolling and deadline_cycle are selected for the uncaptured
    // multi-round check below.
    .select('id, title, funder, apply_url, description, eligibility_criteria, funder_brief, funding_type, amount_min, amount_max, raw_data, deadline, is_rolling, deadline_cycle')
    .eq('id', grantId)
    .single()

  if (error || !grant) return NextResponse.json({ error: 'Grant not found' }, { status: 404 })

  // Build primary content block
  const sections: string[] = []
  let fetchedFromUrl = false
  // Diagnostic: track why the primary URL fetch failed (if it did) so we
  // can see in Vercel logs and the response body why a brief came back as
  // knowledge_fallback. Silent catches were hiding things like 403/timeout.
  let primaryFetchDebug: string | null = null
  // What the model was actually shown of the primary page, so the response can
  // say "12,000 of 72,220" instead of implying the whole page was read.
  let primaryExcerpt: Excerpted | null = null

  if (pastedContent && pastedContent.trim().length > 100) {
    sections.push(`Primary source (pasted):\n---\n${pastedContent.trim().slice(0, 10000)}\n---`)
    primaryFetchDebug = 'used pasted content'
    // A pasted page IS the page. Until 2026-09-02 this path left the flag
    // false, so a brief written from text a reviewer supplied by hand was
    // stamped knowledge_fallback, and the queue then raised "page unreadable"
    // on the very row somebody had just read for it. Three Arts Council rows
    // came back labelled as written from memory with the page in front of the
    // model.
    fetchedFromUrl = true
  } else if (grant.apply_url) {
    const primaryUrl = grant.apply_url
    /**
     * Second attempt at the page, through the reader proxy.
     *
     * Shared by BOTH ways a direct read fails to produce text, which is the
     * whole of this change. The proxy retry used to live only in the catch, so
     * it fired for a host that 403s and never for a host that answers 200 with
     * an empty JavaScript shell — and the shell is the more common case of the
     * two. TechSoup's catalogue strips to 0 characters direct and returns 8,193
     * through the proxy; on 2026-08-27 it was re-read, took the short-fetch
     * branch, never tried the proxy, and wrote its brief from memory again with
     * "fetch returned only 0 chars" as the only trace.
     *
     * A brief written from memory is exactly what the publish gate blocks as
     * `page_unreadable`, so the failure returns as review work rather than
     * showing up as an error.
     */
    const tryReaderProxy = async (whyDirectFailed: string) => {
      try {
        const viaProxy = await fetchViaReaderProxy(primaryUrl)
        if (viaProxy.text.length >= 200) {
          primaryExcerpt = viaProxy
          sections.push(`Primary source (${primaryUrl}):\n---\n${excerptNotice(viaProxy)}${viaProxy.text}\n---`)
          fetchedFromUrl = true
          primaryFetchDebug = `${whyDirectFailed}; recovered via reader proxy (${viaProxy.text.length} chars`
            + (viaProxy.capped ? ` excerpted from ${viaProxy.originalLength}` : '') + ')'
        } else {
          primaryFetchDebug = `${whyDirectFailed}; reader proxy returned only ${viaProxy.text.length} chars`
        }
      } catch (proxyErr) {
        const why = proxyErr instanceof Error ? proxyErr.message : String(proxyErr)
        primaryFetchDebug = whyDirectFailed + (why === 'reader proxy not configured' ? '' : `; reader proxy also failed: ${why}`)
      }
    }

    try {
      const fetched = await fetchPageText(primaryUrl)
      if (fetched.text.length >= 200) {
        primaryExcerpt = fetched
        sections.push(`Primary source (${primaryUrl}):\n---\n${excerptNotice(fetched)}${fetched.text}\n---`)
        fetchedFromUrl = true
        primaryFetchDebug = `ok (${fetched.text.length} chars after strip`
          + (fetched.capped ? `, excerpted from ${fetched.originalLength}` : '') + ')'
      } else {
        await tryReaderProxy(`direct fetch returned only ${fetched.text.length} chars after stripping (< 200 threshold)`)
      }
    } catch (err) {
      const direct = err instanceof Error ? err.message : String(err)
      await tryReaderProxy(`direct fetch failed (${direct})`)
    }
    if (!fetchedFromUrl) console.warn('[enrich-grant] no primary text', primaryUrl, primaryFetchDebug)
  } else {
    primaryFetchDebug = 'no apply_url on grant'
  }

  // Append any additional sources (URL fetch or pasted text)
  if (additionalSources?.length) {
    for (const src of additionalSources) {
      const heading = src.label?.trim() ? `Additional source — ${src.label}` : 'Additional source'
      if (src.url?.trim() && (!src.text || src.text.trim().length < 50)) {
        try {
          const fetched = await fetchPageText(src.url.trim())
          if (fetched.text.length >= 100) {
            sections.push(`${heading} (${src.url}):\n---\n${excerptNotice(fetched)}${fetched.text}\n---`)
            fetchedFromUrl = true
          }
        } catch {
          // URL fetch failed — add a note so Claude knows the URL was inaccessible
          sections.push(`${heading} (${src.url}):\n---\nURL could not be fetched automatically (may require login or block bots). If you have access, paste the page content directly into the Sources text box.\n---`)
        }
      } else if (src.text && src.text.trim().length > 50) {
        sections.push(`${heading}:\n---\n${src.text.trim().slice(0, 8000)}\n---`)
      }
    }
  }

  // If no scraped content, fall back to knowledge-based enrichment using existing grant data
  if (sections.length === 0) {
    const knownInfo = [
      grant.description ? `Description: ${grant.description}` : null,
      grant.eligibility_criteria ? `Eligibility: ${grant.eligibility_criteria}` : null,
      grant.apply_url ? `Apply URL: ${grant.apply_url}` : null,
    ].filter(Boolean).join('\n')

    if (knownInfo.length > 30) {
      sections.push(`Known grant data (from database):\n---\n${knownInfo}\n---`)
    }
  }

  // If we have absolutely nothing, return an error
  if (sections.length === 0 && !grant.funder) {
    return NextResponse.json({ error: 'Not enough data to generate a brief. Add a URL or paste the page text.' }, { status: 422 })
  }

  const combinedContent = sections.length > 0 ? sections.join('\n\n') : ''
  const sourceNote = fetchedFromUrl
    ? 'Content was fetched live from the funder\'s website.'
    : 'The funder\'s website could not be fetched — use your training knowledge about this UK funder to fill in as many fields as possible, and note any uncertainty.'

  const prompt = `You are writing a funder intelligence brief for a UK charity/CIC grant tracker. ${sourceNote}

Grant title: ${grant.title}
Funder: ${grant.funder}
${combinedContent ? `\n${combinedContent}` : ''}

Write a structured "funder brief" as JSON. Rules:
- Write directly for a grant-seeker — practical, plain English, no jargon
- NEVER reference "the source", "the website", "the page", or your own uncertainty in field values
- These words are read by an applicant deciding whether to apply, and they cannot see what you were given. Write as though describing the funder from full knowledge of them. Never mention the material you are reading from, in ANY wording — not "excerpt", "extract", "text", "content", "information provided", or any synonym. "Priorities are not detailed in this excerpt" tells the applicant nothing about the funder and exposes our own plumbing; either state the priorities or omit the field
- Each field should be 1–3 sentences max
- If information is not explicitly stated, make a reasonable inference from context (e.g. if a funder supports "charities and community groups", infer the likely structures). Do not explain the inference — just state the conclusion naturally
- If a field is genuinely impossible to infer, use null — do not write placeholder text explaining what is unknown
- Avoid phrases like "not specified", "unclear from", "the source does not", "information not available"
- The three location fields (geographic_focus, location_tag, is_local) MUST be internally consistent — see the LOCATION FIELDS section below.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CITATIONS — required for every field

For every field you populate, return a matching entry in the \`_citations\` object with:
- "snippet": 50-300 chars verbatim from the source content above, showing the exact text that supports your value. Copy-paste, do not paraphrase.
- "confidence": EXACTLY ONE OF "high" | "med" | "low":
    - "high" — the snippet states the value explicitly and verbatim
    - "med"  — the value is implied by the snippet but requires light inference
    - "low"  — value inferred from broader context or training knowledge, snippet may be partial or missing
- "reason": REQUIRED when confidence is "low". Brief explanation (e.g. "no source phrase found", "inferred from general charity context")

If no source phrase supports a value, set the value to null and set the citation to:
{"snippet": "", "confidence": "low", "reason": "no_source_found"}

Do not fabricate snippets. If you can't find supporting text, use "low" with reason="no_source_found".

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DEADLINE CYCLE — extract when cycle language is present

SPEND — two INDEPENDENT questions about the money. Both are top-level fields.

\`_spend_types\` — what KIND of cost does it cover? Array, any of:
   "capital"   equipment, building work, vehicles, one-off physical items
   "revenue"   day-to-day running: staff, delivery, activities, overheads
Return BOTH when the funder covers both — "supports Capital and Revenue
applications" is exactly that, and roughly a quarter of funds do.

\`_spend_restriction\` — how tied to a purpose is the REVENUE money?
   "restricted"    tied to a specific project or programme
   "unrestricted"  core costs, salaries, "spend as you see fit"

These are ORTHOGONAL. Capital money for a named project is
["capital"] + "restricted". An unrestricted pot usable for anything is
["capital","revenue"] + "unrestricted". Do not let one answer drive the other.

THE TRAP: "capital" appearing in what the funder EXCLUDES means they REFUSE
capital — the opposite of the capital tag. Read what the funder is claiming, not
which words appear. A fund covering equipment but excluding building works still
has "capital": it covers some capital costs, which is what someone needing
equipment money is filtering for.

CONFIDENT "the page does not say" IS A REAL ANSWER: return null (for
_spend_restriction) or [] (for _spend_types). Do not default to "restricted"
because it is the common case — a guess and a reading must stay distinguishable.

IF YOU ARE NOT CONFIDENT, OMIT THE FIELD ENTIRELY. Omission means abstain: the
existing value is preserved. Writing null would destroy a good prior answer to
record your uncertainty, which is the more expensive error. Null is reserved for
a confident "the page does not say"; silence is for "I could not tell".

Add \`_spend_types\` / \`_spend_restriction\` entries to \`_citations\` with the
verbatim phrase whenever you populate either.

If the source mentions a recurring cycle of application deadlines (e.g. "two deadlines per year in May and October", "three Board meetings — applications close 8 May, 31 August, 11 December", "annual round closing 30 November"), populate the top-level \`_deadline_cycle\` field as an array:

[
  {"day": 8,  "month": 5,  "label": "Round 1 EOI"},  // label optional
  {"day": 31, "month": 8,  "label": "Round 2 EOI"},
  {"day": 11, "month": 12, "label": "Round 3 EOI"}
]

Rules:
- Only populate when the source explicitly states recurring dates with day-of-month + month name (or DD/MM format)
- Do NOT populate from project-completion dates, decision dates, or strategy periods (e.g. "2025-2027" is NOT a cycle)
- If you populate \`_deadline_cycle\`, also add an entry to \`_citations\` with key "_deadline_cycle" containing the verbatim source phrase
- If no recurring cycle is stated, omit \`_deadline_cycle\` entirely (do not return [] or null)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LOCATION FIELDS — derive carefully

Workflow: write \`geographic_focus\` first based on the source content,
then DERIVE \`location_tag\` and \`is_local\` from what you just wrote.
Never leave \`location_tag\` null when \`geographic_focus\` is populated —
those two fields must always agree.

DERIVATION TABLE — find your geographic_focus pattern in the left column,
copy the location_tag / is_local from the right.

| geographic_focus says…                                  | location_tag         | is_local |
|---------------------------------------------------------|----------------------|----------|
| "UK-wide" / "across the UK" / "United Kingdom only"     | UK                   | false    |
| "England only" / "England-wide"                         | England              | false    |
| "Scotland only" / "Scotland-wide"                       | Scotland             | false    |
| "Wales only" / "Wales-wide"                             | Wales                | false    |
| "Northern Ireland only"                                 | Northern Ireland     | false    |
| "Somerset only" / "Kent only" (any single county)       | Somerset / Kent      | true     |
| "Greater Manchester (all ten boroughs)"                 | Greater Manchester   | true     |
| "Tyne & Wear and Northumberland"                        | Tyne & Wear and Northumberland | true |
| "South Yorkshire region only" (cities listed)           | South Yorkshire      | true     |
| "Nine London boroughs: Barnet, Brent…" (multiple)       | London               | true     |
| "London Borough of Bromley and adjacent boroughs"       | Bromley              | true     |
| "Parish of Newbottle, Sunderland only"                  | Sunderland           | true     |

CRITICAL DISTINCTION — preference vs restriction:

A "preference for" or "examples in" a region is NOT a restriction.
- "UK-wide, with a strong preference for the Midlands" → location_tag: UK, is_local: false
- "UK-wide, with offices in Bath, Brighton, Bristol" → location_tag: UK, is_local: false
- "UK-wide, but Sussex-based organisations preferred" → location_tag: UK, is_local: false

A specific catchment IS a restriction.
- "Sussex only" → location_tag: Sussex, is_local: true
- "limited to Surrey" → location_tag: Surrey, is_local: true
- "Bromley and adjacent boroughs" → location_tag: Bromley, is_local: true

MULTI-AREA RULES:

- Multiple London boroughs: tag as "London" (not "South London" / "East London")
  unless the brief uses that exact compound label.
- Multiple counties under an umbrella region (Yorkshire, Tyne & Wear): use
  the umbrella name.
- Don't tag the funder's HEAD OFFICE location — tag where APPLICANTS can be based.

NEVER CALCULATE A FIGURE. THIS IS THE ONE ABSOLUTE RULE.

Every number you write must appear on the page, as written. You may not derive,
infer, multiply, or apportion one. If a page says "£25k - £250k (40% grant)", the
page states TWO figures and a percentage. It does NOT state £10,000, £100,000,
£15,000 or £150,000, and writing "the grant portion therefore ranges from £10,000
to £100,000" is a fabrication even though the arithmetic is correct — a
fundraiser reads it as the funder's own words, and it is not.

The word "therefore" in a sentence about money means you have got this wrong.

This applies to every field: award sizes, income caps, percentages of a pot,
loan/grant splits, interest, durations. If the page gives a range and a
percentage, state the range and the percentage and stop. Say what is stated and
let the reader do their own arithmetic.

COMMON ERRORS TO AVOID:

- Writing a regional geographic_focus but leaving location_tag null or "UK".
  This silently breaks the matching engine.
- Tagging UK-wide funders as regional just because they have a head office
  somewhere ("UK-wide, based in Cambridge" → tag "UK", NOT "Cambridge").
- Tagging at organisation level instead of grant level.

FINAL CHECK before returning the JSON:
Re-read your \`geographic_focus\` value. Run it through the derivation table.
Does \`location_tag\` match? Does \`is_local\` match? If not, fix them now.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Return ONLY valid JSON in this exact shape:
{
  "what_they_fund": "What kinds of projects, causes, or organisations they support",
  "who_can_apply": "Who is eligible — legal structures, organisation types, any income caps or stage restrictions. Write as direct guidance: e.g. 'Open to registered charities, CICs and community groups. No minimum income requirement stated.'",
  "geographic_focus": "Geographic coverage — UK-wide, England only, specific regions, counties or cities. Be specific if restricted.",
  "location_tag": "Short pill label for the geographic scope (max 30 chars): a UK county, city, region, borough name, or country. Examples: 'Somerset', 'Leeds', 'London', 'Coventry & Warwickshire', 'Scotland', 'England & Wales'. Use 'UK' for genuinely UK-wide funders. No qualifiers or parentheticals — keep it short.",
  "is_local": true/false (JSON boolean). True if the funder serves a specific sub-national area (county, region, city, borough). False if UK-wide, England-wide, Scotland-wide, or covers most of the UK.",
  "priorities": "Current funding priorities or themes they care about most",
  "strong_application": "What makes a strong or successful application to this funder",
  "exclusions": "What they explicitly will NOT fund or who cannot apply",
  "typical_award": "The amount a SINGLE applicant can receive for THIS grant (per-grant size or range). Do NOT substitute: (a) the applicant's INCOME-ELIGIBILITY threshold — e.g. 'open to orgs with income £150k–£1m' is who can apply, NOT the award size; (b) the funder's TOTAL annual distribution, cumulative giving, or overall fund pot — e.g. 'distributes £1m a year across all grants' / 'over £2.7m since 2005' is context, NOT the grant size; (c) a DIFFERENT product's amounts (a separate loan/fund). State the per-grant figure only. If the source gives no per-grant size (only a total pot or income band), say so explicitly rather than substituting that number. (d) any figure you WORKED OUT — see the never-calculate rule above. If the page says a range and a grant percentage, give both verbatim; do not apply one to the other.",
  "decision_timeline": "How long decisions take, when trustees meet, or application windows. ONLY include dates relevant to APPLYING — drop project-completion dates, end-of-grant reporting deadlines, and other post-award milestones unless the source uses them as the application deadline. Bias TIGHT.",
  "open_status": "EXACTLY ONE OF: 'open' (currently accepting applications), 'closed' (round explicitly closed, e.g. 'this fund is currently closed', 'applications are now closed'), 'between_rounds' (closed now, will reopen — e.g. 'next round opens in autumn 2026'), or 'unknown' (source is silent on current status). Look for explicit open/closed banners on the page. Default to 'unknown' when not stated.",
  "how_to_apply": "Key steps in the application process",
  "funder_tips": "Any insider tips, preferences, or advice for applicants",
  "last_enriched": "${new Date().toISOString().split('T')[0]}",
  "source": "${fetchedFromUrl ? 'live_fetch' : 'knowledge_fallback'}",
  "_deadline_cycle": [
    {"day": 8, "month": 5, "label": "EOI"}
  ],
  "_citations": {
    "what_they_fund":    {"snippet": "verbatim source phrase 50-300 chars", "confidence": "high"},
    "who_can_apply":     {"snippet": "...", "confidence": "high"},
    "geographic_focus":  {"snippet": "...", "confidence": "high"},
    "location_tag":      {"snippet": "...", "confidence": "high"},
    "is_local":          {"snippet": "...", "confidence": "high"},
    "priorities":        {"snippet": "...", "confidence": "med"},
    "strong_application":{"snippet": "...", "confidence": "med"},
    "exclusions":        {"snippet": "...", "confidence": "high"},
    "typical_award":     {"snippet": "...", "confidence": "high"},
    "decision_timeline": {"snippet": "...", "confidence": "high"},
    "open_status":       {"snippet": "...", "confidence": "high"},
    "how_to_apply":      {"snippet": "...", "confidence": "med"},
    "funder_tips":       {"snippet": "...", "confidence": "low", "reason": "inferred from general charity context"},
    "_deadline_cycle":   {"snippet": "...", "confidence": "high"}
  }
}

NOTE: _deadline_cycle and its _citations entry are ONLY present when a recurring cycle is stated. Omit both if no cycle.`

  let brief: Record<string, unknown>
  // Reported back to the caller so a cron can tally it. Enrichment was the one
  // model-calling path with no cost visibility: `process-pipeline-queue` and
  // `reenrich-stale` both reach the model through here, so their `cron_runs`
  // rows recorded work done and nothing about what it cost.
  let enrichUsage: { model: string; input_tokens: number; output_tokens: number } | null = null
  try {
    const msg = await anthropic.messages.create({
      model: ENRICH_MODEL,
      // v2: brief + per-field citations + optional cycle ~doubles output.
      // 4096 gives generous headroom; Haiku 4.5 supports up to 8k.
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    })
    enrichUsage = {
      model:         ENRICH_MODEL,
      input_tokens:  msg.usage.input_tokens,
      output_tokens: msg.usage.output_tokens,
    }
    const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('[enrich-grant] no JSON in model response', { grantId, textPreview: text.slice(0, 300), stopReason: msg.stop_reason })
      return NextResponse.json({
        error: `Model returned no JSON (stop: ${msg.stop_reason ?? 'unknown'}). First 200 chars: ${text.slice(0, 200)}`,
      }, { status: 500 })
    }
    try {
      brief = JSON.parse(jsonMatch[0])
    } catch (parseErr) {
      console.error('[enrich-grant] JSON parse failed', { grantId, jsonPreview: jsonMatch[0].slice(0, 300), err: parseErr })
      return NextResponse.json({
        error: `Model returned invalid JSON: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
      }, { status: 500 })
    }
  } catch (err) {
    console.error('[enrich-grant] Anthropic call failed', { grantId, err })
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Anthropic API: ${msg}` }, { status: 500 })
  }

  // v2: extract citations + structured cycle from the brief blob.
  // _citations stays inside the brief jsonb (the review UI reads per-sub-field
  // citations from there). _deadline_cycle moves to its own scraped_grants
  // column (canonical home for the cycle parser).
  const briefCitations  = (brief._citations as Record<string, Citation> | undefined) ?? {}
  const cycleFromBrief  = Array.isArray(brief._deadline_cycle) ? brief._deadline_cycle : null

  // ── Stale-date detector ──────────────────────────────────────────────────
  // Scan brief text fields for past-dated phrases in stale contexts (e.g.
  // "expected December 2025", "next round opens autumn 2025"). Flag the
  // brief with _stale_dates and lower citation confidence on affected fields.
  //
  // Consumed by the `stale_dates` review reason and by the admin review UI via
  // citation confidence. It used to say check-stale-rounds picked this up; that
  // cron was deleted on 2026-08-11 having written to zero rows in its entire
  // existence, and it never read _stale_dates anyway.
  const today = new Date()
  const staleFields: Array<{ field: string; phrase: string; matched_date: string }> = []
  const SCAN_FIELDS = ['decision_timeline', 'how_to_apply', 'typical_award', 'open_status', 'priorities', 'who_can_apply'] as const
  for (const fieldName of SCAN_FIELDS) {
    const value = brief[fieldName]
    if (typeof value !== 'string') continue
    const hits = detectStaleDates(value, today)
    for (const h of hits) {
      staleFields.push({ field: fieldName, phrase: h.phrase, matched_date: h.matched_date })
      const existing = briefCitations[fieldName]
      if (existing) {
        existing.confidence = 'low'
        existing.reason = `stale_date_in_value: ${h.matched_date}`
      }
    }
  }
  if (staleFields.length > 0) {
    brief._stale_dates = staleFields
    console.warn('[enrich-grant] stale-date detector flagged', grantId, staleFields)
  }

  // ── Numeric-grounding guard (amounts) ────────────────────────────────────
  // Flag money figures in typical_award the source doesn't support, so the
  // reviewer's eye lands on the highest-risk field. Grounding = the field's own
  // verbatim citation snippet + the original scrape (description / eligibility).
  // Deliberately excludes who_can_apply/exclusions so an org-INCOME band can't
  // launder a fabricated grant SIZE as "grounded".
  if (typeof brief.typical_award === 'string') {
    const amountGrounding = [
      briefCitations.typical_award?.snippet ?? '',
      typeof grant.description === 'string' ? grant.description : '',
      Array.isArray(grant.eligibility_criteria) ? grant.eligibility_criteria.join('  ')
        : typeof grant.eligibility_criteria === 'string' ? grant.eligibility_criteria : '',
    ].join('  ')
    const ungrounded = detectUngroundedAmounts(brief.typical_award, amountGrounding)
    if (ungrounded.length > 0) {
      brief._ungrounded_amounts = ungrounded
      const ta = briefCitations.typical_award
      if (ta) {
        ta.confidence = 'low'
        ta.reason = `ungrounded_amount: ${ungrounded.map(a => '£' + a.toLocaleString()).join(', ')}`
      }
      console.warn('[enrich-grant] ungrounded-amount detector flagged', grantId, ungrounded)
    }
  }

  const preservedFields: string[] = []
  const briefToSave: Record<string, unknown> = { ...brief }
  delete briefToSave._deadline_cycle  // canonical home is the column, not the blob

  // last_enriched is OURS to set, not the model's. The prompt asks for today's
  // date, but a small model sometimes echoes a date lifted off the page instead,
  // saving a stale last_enriched. That makes reenrich-stale think the row was
  // never refreshed → it re-picks the same rows every run and never clears the
  // backlog. Force it server-side so it always reflects when WE enriched.
  briefToSave.last_enriched = new Date().toISOString().split('T')[0]

  // A fresh read must never blank out an eligibility field. The blob is
  // rewritten wholesale, so a key the model did not restate would otherwise
  // vanish — three of eighteen rows lost `exclusions` this way on 2026-08-18.
  // Runs before extractIncomeGate so the income parse sees the preserved text.
  {
    const prev = grant.funder_brief && typeof grant.funder_brief === 'object'
      ? grant.funder_brief as Record<string, unknown>
      : null
    const { brief: guarded, preserved } = preserveEligibilityFields(briefToSave, prev)
    if (preserved.length > 0) {
      for (const f of preserved) briefToSave[f] = guarded[f]
      preservedFields.push(...preserved)
      console.warn('[enrich-grant] re-read dropped eligibility field(s); kept previous', { grantId, preserved })
    }
  }

  // Deterministic org-income gate parse over the stored text + fresh brief.
  // Reads grant.description / eligibility_criteria (original scrape) plus the
  // brief's who_can_apply / exclusions / typical_award so band language phrased
  // either way is caught. Written separately below under INCOME_SOURCE.
  const incomeGate = extractIncomeGate({
    description: typeof grant.description === 'string' ? grant.description : null,
    eligibilityCriteria: Array.isArray(grant.eligibility_criteria)
      ? (grant.eligibility_criteria as string[])
      : typeof grant.eligibility_criteria === 'string' ? [grant.eligibility_criteria] : null,
    whoCanApply:  typeof briefToSave.who_can_apply === 'string' ? briefToSave.who_can_apply : null,
    exclusions:   typeof briefToSave.exclusions === 'string' ? briefToSave.exclusions : null,
    typicalAward: typeof briefToSave.typical_award === 'string' ? briefToSave.typical_award : null,
  })

  const updatePayload: Record<string, unknown> = { funder_brief: briefToSave }
  syncLocationFields(briefToSave, updatePayload)
  if (cycleFromBrief && cycleFromBrief.length > 0) {
    updatePayload.deadline_cycle = cycleFromBrief
  }

  // Per-field citation map for the merger — only for fields written to
  // scraped_grants columns. Citations for funder_brief sub-fields live
  // inside the brief jsonb, not in field_provenance.
  const citationsForMerger: Record<string, Citation> = {}
  if (briefCitations.location_tag && updatePayload.location_tag != null) {
    citationsForMerger.location_tag = briefCitations.location_tag
  }
  if (briefCitations.is_local && 'is_local' in updatePayload) {
    citationsForMerger.is_local = briefCitations.is_local
  }
  if (briefCitations._deadline_cycle && updatePayload.deadline_cycle) {
    citationsForMerger.deadline_cycle = briefCitations._deadline_cycle
  }

  if (additionalSources && additionalSources.length > 0) {
    // Only persist sources that have meaningful content (url or pasted text).
    // grant_sources is untracked by provenance — flows through the merger as-is.
    const sourcesToSave = additionalSources.filter(s =>
      (s.url ?? '').trim().length > 5 || (s.text ?? '').trim().length > 50
    )
    if (sourcesToSave.length > 0) updatePayload.grant_sources = sourcesToSave
  }

  // Spend axes: promoted out of the brief blob into their own columns, the same
  // way _deadline_cycle is. OMISSION IS ABSTAIN — a field the model left out is
  // never written, so a confident earlier answer survives an uncertain re-read.
  // Only an explicit null / [] clears, and that means "the page does not say".
  {
    const rawTypes = (brief as Record<string, unknown>)?._spend_types
    const rawRestr = (brief as Record<string, unknown>)?._spend_restriction
    if (rawTypes !== undefined) {
      updatePayload.spend_types = Array.isArray(rawTypes)
        ? Array.from(new Set(rawTypes.filter(t => t === 'capital' || t === 'revenue'))).sort()
        : null
    }
    if (rawRestr !== undefined) {
      updatePayload.spend_restriction =
        rawRestr === 'restricted' || rawRestr === 'unrestricted' ? rawRestr : null
    }
    delete (brief as Record<string, unknown>)._spend_types
    delete (brief as Record<string, unknown>)._spend_restriction
  }

  try {
    const result = await mergeGrantUpdate({
      id:        grantId,
      fields:    updatePayload,
      source:    PROVENANCE_SOURCE,
      pinned:    false,
      citations: Object.keys(citationsForMerger).length > 0 ? citationsForMerger : undefined,
      db:        supabase,
    })

    // Org-income gate, written under its own source/trust. Always write
    // resolved-or-null so a gate removed from the text clears the prior value
    // (same-source clear) rather than leaving a stale figure behind.
    const incomeFields: Record<string, unknown> = {
      min_org_income: incomeGate.minOrgIncome ?? null,
      max_org_income: incomeGate.maxOrgIncome ?? null,
    }
    const incomeCitations: Record<string, Citation> = {}
    if (incomeGate.citation) {
      if (incomeGate.maxOrgIncome !== undefined) incomeCitations.max_org_income = incomeGate.citation
      if (incomeGate.minOrgIncome !== undefined) incomeCitations.min_org_income = incomeGate.citation
    }
    const incomeResult = await mergeGrantUpdate({
      id:        grantId,
      fields:    incomeFields,
      source:    INCOME_SOURCE,
      pinned:    false,
      citations: Object.keys(incomeCitations).length > 0 ? incomeCitations : undefined,
      db:        supabase,
    })

    // ── Per-applicant amounts ────────────────────────────────────────────────
    // Same source text and same extractor the admin "Detect all" button uses,
    // so the automated chain and the manual button can no longer disagree.
    //
    // NOTE: unlike the income gate and investment terms above, this does NOT
    // write resolved-or-null. Those two describe claims that either are or are
    // not present in the text, so a removed claim should clear the field. An
    // amount can legitimately come from somewhere this prose scan never sees
    // (structured markup on the listing page, a scraper's own parse), so
    // "detected nothing" is not evidence of "there is no amount" and must not
    // wipe a good value. Only positive detections are written.
    const amounts = extractGrantAmounts(buildAwardText([
      typeof briefToSave.typical_award   === 'string' ? briefToSave.typical_award   : null,
      typeof briefToSave.what_they_fund  === 'string' ? briefToSave.what_they_fund  : null,
      typeof grant.description           === 'string' ? grant.description           : null,
      typeof grant.title                 === 'string' ? grant.title                 : null,
    ]))

    // ── Write policy: GAP-FILL ONLY, never overwrite ─────────────────────────
    // This is deliberately conservative, and the reason is empirical. When this
    // extractor was first dry-run over 60 live rows on 2026-07-25 it disagreed
    // with the stored value on 18 of them. Some disagreements were correct (The
    // Mercers' Company had amount_max £2,600,000 stored where the text says
    // "Awards of £50,000 to £120,000 in total" — the £2.6m was the fund's pot).
    // But several were the extractor being wrong, because broadening the source
    // text beyond typical_award also pulls in fund-level figures: "invest a
    // minimum of £15 million across all projects", "from a total £50 million
    // programme", "£40 million (major sector programmes)", "a share of up to
    // £25 million". Those four are now covered by new cues, but one class still
    // is not ("up to 45% / 35% of £250k-£2m" — a percentage of project cost).
    //
    // In the admin UI this logic was safe to trust because a human read the
    // output before it was saved. In an unattended chain it is not. So:
    //   - if the field is NULL, write the derived value (can only add information)
    //   - if a value already exists and the derived one differs materially, DO
    //     NOT overwrite. Record the discrepancy instead, so the checker/review
    //     surface can ask a human. Flagging is cheap; silently rewriting a
    //     correct £10m cap to £15m is not.
    const existingMin = typeof grant.amount_min === 'number' ? grant.amount_min : null
    const existingMax = typeof grant.amount_max === 'number' ? grant.amount_max : null

    const amountFields: Record<string, unknown> = {}
    if (amounts.amount_max !== null && existingMax === null) amountFields.amount_max = amounts.amount_max
    if (amounts.amount_min !== null && existingMin === null) amountFields.amount_min = amounts.amount_min

    // Material = a factor of 2 or more apart. Mirrors the ratio-threshold
    // approach cf-fund-verify already uses for amount sanity.
    const CONFLICT_RATIO = 2
    const flags: Array<{ code: GrantFlagCode; detail: string; suggested?: { amount_min?: number | null; amount_max?: number | null } }> = []
    if (amounts.amount_max !== null && existingMax !== null && existingMax > 0) {
      const potRatio = existingMax / amounts.amount_max
      if (potRatio >= CONFLICT_RATIO) {
        flags.push({
          code:   'amount_pot_suspected',
          detail: `stored amount_max £${existingMax.toLocaleString('en-GB')} is ${potRatio.toFixed(1)}x the per-applicant figure derived from the text (£${amounts.amount_max.toLocaleString('en-GB')}) — the stored value may be the whole fund's pot rather than one applicant's cap`,
          suggested: { amount_max: amounts.amount_max, amount_min: amounts.amount_min },
        })
      // ── Only a CUED figure may dispute a stored amount ────────────────────
      // `amount_max` is the largest figure surviving the pool cues, cued or not,
      // and that cue list is a deny-list which will always be incomplete. So the
      // biggest uncued number in the text wins by default — which is how this
      // branch came to argue that Access's ceiling was £5,000,000, Co-op
      // Belong's £7,000,000 and City Bridge's £22,000,000. Every one of those is
      // the size of the fund, and every stored value it contradicted was right.
      //
      // The asymmetry is deliberate. `amount_pot_suspected` above needs no cue:
      // it fires when the stored figure is LARGER than the derived one, and a
      // pot read as the derivation makes that ratio smaller, never larger — so a
      // pot cannot manufacture one. Understating is the only direction a stray
      // pot can fake, and requiring a per-grant cue is what closes it.
      } else if (amounts.max_cued && amounts.amount_max / existingMax >= CONFLICT_RATIO) {
        flags.push({
          code:   'amount_under_stated',
          detail: `text suggests a per-applicant ceiling of £${amounts.amount_max.toLocaleString('en-GB')}, ${(amounts.amount_max / existingMax).toFixed(1)}x the stored amount_max of £${existingMax.toLocaleString('en-GB')}`,
          suggested: { amount_max: amounts.amount_max, amount_min: amounts.amount_min },
        })
      }
    }

    // ── Uncaptured multi-round cycle ─────────────────────────────────────────
    // Fires when the grant has one deadline, no structured deadline_cycle, and
    // the text says there will be another round. That combination is the silent
    // rot case: the date passes and expire-grants has no cycle to roll forward
    // to, so the row quietly becomes wrong rather than advancing.
    //
    // This check existed only in cf-fund-verify, i.e. for community-foundation
    // funds. Promoted to the shared path 2026-07-25 so every source gets it.
    const effectiveCycle = Array.isArray(updatePayload.deadline_cycle)
      ? updatePayload.deadline_cycle as unknown[]
      : Array.isArray(grant.deadline_cycle) ? grant.deadline_cycle as unknown[] : null
    const multiRound = detectUncapturedMultiRound({
      isRolling:     typeof grant.is_rolling === 'boolean' ? grant.is_rolling : null,
      deadline:      typeof grant.deadline === 'string' ? grant.deadline : null,
      deadlineCycle: effectiveCycle,
      sourceTexts: [
        typeof briefCitations.deadline_cycle?.snippet === 'string' ? briefCitations.deadline_cycle.snippet : null,
        typeof briefToSave.decision_timeline === 'string' ? briefToSave.decision_timeline : null,
        typeof grant.description === 'string' ? grant.description : null,
      ],
    })
    if (multiRound.suspected) {
      flags.push({
        code:   'possible_multi_round_uncaptured',
        detail: `text suggests a recurring cycle ("${multiRound.matched}") but only a single deadline (${grant.deadline}) was captured and no deadline_cycle was set — this will go stale once that date passes, and expire-grants has no cycle to roll forward to`,
      })
    }

    let amountsApplied:  string[] = []
    let amountsRejected: typeof incomeResult.rejected = []
    if (Object.keys(amountFields).length > 0) {
      const amountsResult = await mergeGrantUpdate({
        id:     grantId,
        fields: amountFields,
        source: AMOUNTS_SOURCE,
        pinned: false,
        db:     supabase,
      })
      amountsApplied  = amountsResult.applied
      amountsRejected = amountsResult.rejected
    }

    // Persist flags in the one shared place (raw_data.checks). Idempotent per
    // source, so re-enriching refreshes these findings rather than duplicating
    // them — and an empty array clears them when a re-check finds the problem
    // resolved, which is why this runs unconditionally rather than only when
    // flags exist.
    try {
      await recordGrantFlags({
        db:              supabase,
        grantId,
        existingRawData: grant.raw_data,
        source:          CHECKS_SOURCE,
        flags,
      })
    } catch (err) {
      console.error('[enrich-grant] failed to record quality flags:', err)
    }
    if (flags.length > 0) {
      console.warn(
        `[enrich-grant] ${grantId} flagged: ` + flags.map(f => f.code).join(', ')
      )
    }

    // Social-investment terms — only for investment products. Writes the two
    // verdict-driving fields resolved-or-null (self-clearing); ticket / term are
    // deliberately left untouched (engine falls back to amount_min; terms are
    // all ranges). See extract-investment-terms.ts.
    let investmentApplied: string[] = []
    let investmentRejected: typeof incomeResult.rejected = []
    let investmentDebug: Record<string, unknown> | null = null
    if (grant.funding_type === 'investment') {
      const invTerms = extractInvestmentTerms({
        description: typeof grant.description === 'string' ? grant.description : null,
        eligibilityCriteria: Array.isArray(grant.eligibility_criteria)
          ? (grant.eligibility_criteria as string[])
          : typeof grant.eligibility_criteria === 'string' ? [grant.eligibility_criteria] : null,
        whoCanApply:  typeof briefToSave.who_can_apply === 'string' ? briefToSave.who_can_apply : null,
        exclusions:   typeof briefToSave.exclusions === 'string' ? briefToSave.exclusions : null,
        typicalAward: typeof briefToSave.typical_award === 'string' ? briefToSave.typical_award : null,
        amountMin: typeof grant.amount_min === 'number' ? grant.amount_min : null,
        amountMax: typeof grant.amount_max === 'number' ? grant.amount_max : null,
      })
      const invFields: Record<string, unknown> = {
        si_security_required:     invTerms.securityRequired ?? null,
        si_interest_rate_percent: invTerms.interestRatePercent ?? null,
      }
      const invCitations: Record<string, Citation> = {}
      if (invTerms.securityCitation) invCitations.si_security_required = invTerms.securityCitation
      if (invTerms.interestCitation) invCitations.si_interest_rate_percent = invTerms.interestCitation
      const invResult = await mergeGrantUpdate({
        id:        grantId,
        fields:    invFields,
        source:    INVESTMENT_SOURCE,
        pinned:    false,
        citations: Object.keys(invCitations).length > 0 ? invCitations : undefined,
        db:        supabase,
      })
      investmentApplied = invResult.applied
      investmentRejected = invResult.rejected
      investmentDebug = {
        securityRequired:   invTerms.securityRequired ?? null,
        interestRatePercent: invTerms.interestRatePercent ?? null,
        ticketConflict:     invTerms.ticketConflict ?? null,
        termRangePresent:   invTerms.termRangePresent ?? false,
        notes:              invTerms.notes,
      }
    }

    return NextResponse.json({
      success:  true,
      brief,
      applied:  [...result.applied, ...incomeResult.applied, ...amountsApplied, ...investmentApplied],
      rejected: [...result.rejected, ...incomeResult.rejected, ...amountsRejected, ...investmentRejected],
      // Eligibility fields the re-read dropped and the guard put back. Surfaced
      // rather than logged only, so a caller diffing briefs can see that a field
      // is carried over from a previous read rather than confirmed by this one.
      preserved: preservedFields,
      // Cost of this call, for the caller to tally. Null only if the model was
      // never reached, which the error paths above already return before here.
      usage:    enrichUsage,
      _debug:   {
        primaryFetch:     primaryFetchDebug,
        fetchedFromUrl,
        // Whether the model saw the page or a slice of it. A cap that says
        // nothing is how AF3's brief came back describing the awards table.
        pageExcerpt: primaryExcerpt
          ? { capped: primaryExcerpt.capped, sent: primaryExcerpt.text.length, pageLength: primaryExcerpt.originalLength }
          : null,
        citationsApplied: Object.keys(citationsForMerger),
        cycleExtracted:   cycleFromBrief !== null,
        incomeGate: {
          min:               incomeGate.minOrgIncome ?? null,
          max:               incomeGate.maxOrgIncome ?? null,
          gateLanguagePresent: incomeGate.gateLanguagePresent,
        },
        amounts: {
          detectedMin: amounts.amount_min,
          detectedMax: amounts.amount_max,
          written:     amountsApplied,
        },
        investmentTerms: investmentDebug,
      },
    })
  } catch (err) {
    console.error('[enrich-grant] write failed:', err)
    return NextResponse.json({ error: 'Failed to save brief' }, { status: 500 })
  }
}
