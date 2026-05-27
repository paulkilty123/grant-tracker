import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { syncLocationFields } from '@/lib/funder-brief'
import { requireAdmin, isAdminBearerToken } from '@/lib/auth/require-admin'
import { mergeGrantUpdate } from '@/lib/grant-merge'

export const maxDuration = 45 // seconds — requires Vercel Pro

// Bump when the enrichment prompt below changes materially.
const ENRICH_VERSION    = 'v1'
const PROVENANCE_SOURCE = `ai_enrich:${ENRICH_VERSION}`

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
  "source": "${fetchedFromUrl ? 'live_fetch' : 'knowledge_fallback'}"
}`

  let brief: Record<string, unknown>
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
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

  // Save brief + sync structured location fields the LLM derived alongside the
  // narrative geographic_focus (closes the wiring gap that left location_tag
  // pointing to "UK" while the brief correctly said "Somerset only").
  const updatePayload: Record<string, unknown> = { funder_brief: brief }
  syncLocationFields(brief, updatePayload)

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
      id:     grantId,
      fields: updatePayload,
      source: PROVENANCE_SOURCE,
      pinned: false,
      db:     supabase,
    })
    return NextResponse.json({
      success:  true,
      brief,
      applied:  result.applied,
      rejected: result.rejected,
      _debug:   { primaryFetch: primaryFetchDebug, fetchedFromUrl },
    })
  } catch (err) {
    console.error('[enrich-grant] write failed:', err)
    return NextResponse.json({ error: 'Failed to save brief' }, { status: 500 })
  }
}
