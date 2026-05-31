import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { syncLocationFields } from '@/lib/funder-brief'
import { requireAdmin, isAdminBearerToken } from '@/lib/auth/require-admin'
import { mergeGrantUpdate, type ProvenanceEntry } from '@/lib/grant-merge'
import { extractIncomeGate } from '@/lib/extract-income-gate'

type Citation = NonNullable<ProvenanceEntry['citation']>

export const maxDuration = 45 // seconds — requires Vercel Pro

// Bump when the enrichment prompt below changes materially.
// v2 (2026-05-27): citation + confidence per field, structured _deadline_cycle
// extraction. See docs/pipeline-v1-spec.md §4 and §6.
const ENRICH_VERSION    = 'v2'
const PROVENANCE_SOURCE = `ai_enrich:${ENRICH_VERSION}`

// Deterministic org-income gate parse runs alongside the LLM brief but writes
// under its own source/trust (ai_extract = 50) so a verified gate survives the
// daily crawl. Re-derived on every enrich so a removed gate clears itself.
const INCOME_SOURCE = 'ai_extract:income:v1'

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

// Fetch page text with realistic browser headers, strip HTML tags
async function fetchPageText(url: string): Promise<string> {
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
    // Strip scripts, styles, and HTML tags; normalise whitespace
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, 12000) // cap at ~3k tokens
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
    .select('id, title, funder, apply_url, description, eligibility_criteria, funder_brief')
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

  if (pastedContent && pastedContent.trim().length > 100) {
    sections.push(`Primary source (pasted):\n---\n${pastedContent.trim().slice(0, 10000)}\n---`)
    primaryFetchDebug = 'used pasted content'
  } else if (grant.apply_url) {
    try {
      const fetched = await fetchPageText(grant.apply_url)
      if (fetched.length >= 200) {
        sections.push(`Primary source (${grant.apply_url}):\n---\n${fetched}\n---`)
        fetchedFromUrl = true
        primaryFetchDebug = `ok (${fetched.length} chars after strip)`
      } else {
        primaryFetchDebug = `fetch returned only ${fetched.length} chars after stripping (< 200 threshold)`
        console.warn('[enrich-grant] short fetch', grant.apply_url, primaryFetchDebug)
      }
    } catch (err) {
      primaryFetchDebug = `fetch failed: ${err instanceof Error ? err.message : String(err)}`
      console.warn('[enrich-grant] fetch error', grant.apply_url, primaryFetchDebug)
    }
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
          if (fetched.length >= 100) {
            sections.push(`${heading} (${src.url}):\n---\n${fetched}\n---`)
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
  "typical_award": "Typical grant size or range",
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
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      // v2: brief + per-field citations + optional cycle ~doubles output.
      // 4096 gives generous headroom; Haiku 4.5 supports up to 8k.
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    })
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

  const briefToSave: Record<string, unknown> = { ...brief }
  delete briefToSave._deadline_cycle  // canonical home is the column, not the blob

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

    return NextResponse.json({
      success:  true,
      brief,
      applied:  [...result.applied, ...incomeResult.applied],
      rejected: [...result.rejected, ...incomeResult.rejected],
      _debug:   {
        primaryFetch:     primaryFetchDebug,
        fetchedFromUrl,
        citationsApplied: Object.keys(citationsForMerger),
        cycleExtracted:   cycleFromBrief !== null,
        incomeGate: {
          min:               incomeGate.minOrgIncome ?? null,
          max:               incomeGate.maxOrgIncome ?? null,
          gateLanguagePresent: incomeGate.gateLanguagePresent,
        },
      },
    })
  } catch (err) {
    console.error('[enrich-grant] write failed:', err)
    return NextResponse.json({ error: 'Failed to save brief' }, { status: 500 })
  }
}
