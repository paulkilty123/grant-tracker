import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 45 // seconds — requires Vercel Pro

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

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

Return ONLY valid JSON in this exact shape:
{
  "what_they_fund": "What kinds of projects, causes, or organisations they support",
  "who_can_apply": "Who is eligible — legal structures, organisation types, any income caps or stage restrictions. Write as direct guidance: e.g. 'Open to registered charities, CICs and community groups. No minimum income requirement stated.'",
  "geographic_focus": "Geographic coverage — UK-wide, England only, specific regions, counties or cities. Be specific if restricted.",
  "priorities": "Current funding priorities or themes they care about most",
  "strong_application": "What makes a strong or successful application to this funder",
  "exclusions": "What they explicitly will NOT fund or who cannot apply",
  "typical_award": "Typical grant size or range",
  "decision_timeline": "How long decisions take, when trustees meet, or application windows",
  "how_to_apply": "Key steps in the application process",
  "funder_tips": "Any insider tips, preferences, or advice for applicants",
  "last_enriched": "${new Date().toISOString().split('T')[0]}",
  "source": "${fetchedFromUrl ? 'live_fetch' : 'knowledge_fallback'}"
}`

  let brief: Record<string, string | null>
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in response')
    brief = JSON.parse(jsonMatch[0])
  } catch {
    return NextResponse.json({ error: 'Failed to generate summary' }, { status: 500 })
  }

  // Save brief + persist any additional sources so bulk re-enrich can reuse them
  const updatePayload: Record<string, unknown> = { funder_brief: brief }
  if (additionalSources && additionalSources.length > 0) {
    // Only persist sources that have meaningful content (url or pasted text)
    const sourcesToSave = additionalSources.filter(s =>
      (s.url ?? '').trim().length > 5 || (s.text ?? '').trim().length > 50
    )
    if (sourcesToSave.length > 0) updatePayload.grant_sources = sourcesToSave
  }

  const { error: updateError } = await supabase
    .from('scraped_grants')
    .update(updatePayload)
    .eq('id', grantId)

  if (updateError) return NextResponse.json({ error: 'Failed to save brief' }, { status: 500 })

  return NextResponse.json({ success: true, brief, _debug: { primaryFetch: primaryFetchDebug, fetchedFromUrl } })
}
