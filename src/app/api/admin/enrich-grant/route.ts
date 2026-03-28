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
  const { grantId, pastedContent } = await req.json()
  if (!grantId) return NextResponse.json({ error: 'grantId required' }, { status: 400 })

  // Load grant
  const { data: grant, error } = await supabase
    .from('scraped_grants')
    .select('id, title, funder, apply_url, description, eligibility_criteria, funder_brief')
    .eq('id', grantId)
    .single()

  if (error || !grant) return NextResponse.json({ error: 'Grant not found' }, { status: 404 })

  // Use pasted content if provided, otherwise fetch the funder page
  let pageText = ''
  if (pastedContent && pastedContent.trim().length > 200) {
    pageText = pastedContent.trim().slice(0, 12000)
  } else {
    if (!grant.apply_url) return NextResponse.json({ error: 'No apply URL for this grant' }, { status: 400 })
    try {
      pageText = await fetchPageText(grant.apply_url)
    } catch (e) {
      return NextResponse.json({ error: `Could not fetch URL: ${grant.apply_url}` }, { status: 422 })
    }
    if (pageText.length < 200) {
      return NextResponse.json({ error: 'Page content too short to summarise' }, { status: 422 })
    }
  }

  // Ask Claude to extract a structured funder brief
  const prompt = `You are analysing a grant funder's website page for a UK charity/CIC grant tracker tool.

Grant title: ${grant.title}
Funder: ${grant.funder}
Existing description: ${grant.description ?? 'None'}

Page content from ${grant.apply_url}:
---
${pageText}
---

Extract a structured "funder brief" as JSON. Be concise — each field should be 1–3 sentences max. If a field isn't mentioned on the page, use null.

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
