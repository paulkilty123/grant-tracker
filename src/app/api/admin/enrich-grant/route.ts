import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

// Fetch page text via a simple server-side request, strip HTML tags
async function fetchPageText(url: string): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GrantTracker/1.0)' },
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

  if (pastedContent && pastedContent.trim().length > 100) {
    sections.push(`Primary source (pasted):\n---\n${pastedContent.trim().slice(0, 10000)}\n---`)
  } else if (grant.apply_url) {
    try {
      const fetched = await fetchPageText(grant.apply_url)
      if (fetched.length >= 200) {
        sections.push(`Primary source (${grant.apply_url}):\n---\n${fetched}\n---`)
      }
    } catch {
      // Primary fetch failed — will rely on additional sources if provided
    }
  }

  // Append any additional sources (URL fetch or pasted text)
  if (additionalSources?.length) {
    for (const src of additionalSources) {
      const heading = src.label?.trim() ? `Additional source — ${src.label}` : 'Additional source'
      // If a URL is provided and there's no pasted text, try fetching it
      if (src.url?.trim() && (!src.text || src.text.trim().length < 50)) {
        try {
          const fetched = await fetchPageText(src.url.trim())
          if (fetched.length >= 100) {
            sections.push(`${heading} (${src.url}):\n---\n${fetched}\n---`)
          }
        } catch {
          // URL fetch failed — skip this source
        }
      } else if (src.text && src.text.trim().length > 50) {
        sections.push(`${heading}:\n---\n${src.text.trim().slice(0, 8000)}\n---`)
      }
    }
  }

  if (sections.length === 0) {
    return NextResponse.json({ error: 'No usable content — provide a URL that can be fetched or paste the page text' }, { status: 422 })
  }

  const combinedContent = sections.join('\n\n')

  // Ask Claude to extract a structured funder brief across all sources
  const prompt = `You are analysing content from a grant funder's website for a UK charity/CIC grant tracker tool. You may have been given content from multiple pages — use all of it to fill in as many fields as possible.

Grant title: ${grant.title}
Funder: ${grant.funder}
Existing description: ${grant.description ?? 'None'}

${combinedContent}

Extract a structured "funder brief" as JSON. Be concise — each field should be 1–3 sentences max. Draw from whichever source contains the relevant information. If a field isn't covered in any source, use null.

Return ONLY valid JSON in this exact shape:
{
  "what_they_fund": "What kinds of projects, causes, or organisations they support",
  "priorities": "Current funding priorities or themes they care about most",
  "strong_application": "What makes a strong or successful application to this funder",
  "exclusions": "What they explicitly will NOT fund or who cannot apply",
  "typical_award": "Typical grant size or range based on this page",
  "decision_timeline": "How long decisions take, when trustees meet, or application windows",
  "how_to_apply": "Key steps in the application process",
  "funder_tips": "Any insider tips, preferences, or advice mentioned on the page",
  "last_enriched": "${new Date().toISOString().split('T')[0]}"
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
  } catch (e) {
    return NextResponse.json({ error: 'Failed to generate summary' }, { status: 500 })
  }

  // Save to Supabase
  const { error: updateError } = await supabase
    .from('scraped_grants')
    .update({ funder_brief: brief })
    .eq('id', grantId)

  if (updateError) return NextResponse.json({ error: 'Failed to save brief' }, { status: 500 })

  return NextResponse.json({ success: true, brief })
}
