// Admin-only endpoint: runs deep searches for multiple queries in sequence,
// then imports unique results into scraped_grants as Needs Review records.
//
// POST /api/admin/bulk-deep-search
// Body: { queries: string[] }
// Auth: ADMIN_SECRET bearer token or authenticated admin session

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin, isAdminBearerToken } from '@/lib/auth/require-admin'
import { stampNewGrant, mergeGrantUpdate } from '@/lib/grant-merge'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes — multiple searches take time

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!
const PROVENANCE_SOURCE = 'discovery:deep_search'

async function isAuthorised(req: NextRequest): Promise<boolean> {
  if (isAdminBearerToken(req.headers.get('authorization'))) return true
  const auth = await requireAdmin()
  return auth.ok
}

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

interface DeepGrant {
  title: string
  funder: string
  description: string
  amountRange: string | null
  deadline: string | null
  applyUrl: string
  notes: string
  fundingType?: string
}

// Delay helper — avoids rate limits between sequential API calls
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

// Run a single deep search using Claude Sonnet + web search
async function runDeepSearch(query: string): Promise<DeepGrant[]> {
  const systemPrompt = `You are a UK funding research specialist. Search the live web for grants, funding programmes, accelerators, social investment, and support programmes available to UK social enterprises, CICs, charities, and impact-driven organisations.

Return ONLY results that:
- Are currently open or regularly recurring
- Are based in or available to organisations in the UK
- Have a working application URL

For each result, determine the funding_type from: grant, accelerator, support_programme, social_investment, loan, equity, blended_finance, in_kind, diversity_fund, tax_relief

Return valid JSON only — no markdown fencing.`

  const userPrompt = `Search for: "${query}"

Find 8-15 funding opportunities matching this query.

Return JSON in this exact format:
{
  "grants": [
    {
      "title": "Programme name",
      "funder": "Organisation name",
      "description": "2-3 sentence description of what's offered and who's eligible",
      "amountRange": "£X,000–£Y,000 or null if unknown",
      "deadline": "Month YYYY, Rolling, or null",
      "applyUrl": "https://...",
      "notes": "Any eligibility or timing tips",
      "fundingType": "grant|accelerator|support_programme|social_investment|loan|equity|blended_finance|in_kind|diversity_fund|tax_relief"
    }
  ]
}`

  // Retry with exponential backoff for rate limits
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any = null
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      const wait = 60_000 * attempt // 60s, 120s
      console.log(`[deep-search] Rate limited, retrying in ${wait / 1000}s...`)
      await sleep(wait)
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 8000,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    if (res.ok) {
      data = await res.json()
      break
    }

    const err = await res.text()
    if (res.status === 429 || err.includes('rate_limit')) {
      console.error(`[deep-search] Rate limited for "${query}" (attempt ${attempt + 1})`)
      continue
    }

    console.error(`Deep search failed for "${query}":`, err)
    return []
  }

  if (!data) {
    console.error(`Deep search exhausted retries for "${query}"`)
    return []
  }

  // Extract the LAST text block — with web_search, Claude emits multiple text
  // blocks during the search process; the final one contains the JSON answer
  const textBlock = data.content
    ?.filter((b: { type: string }) => b.type === 'text')
    .pop() as { text: string } | undefined
  if (!textBlock?.text) {
    console.error(`No text block in response for "${query}". Content types: ${data.content?.map((b: { type: string }) => b.type).join(', ')}`)
    return []
  }

  try {
    // Strip markdown fencing
    let raw = textBlock.text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

    // If the text doesn't start with '{', try to extract JSON object from within it
    if (!raw.startsWith('{')) {
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        raw = jsonMatch[0]
      } else {
        console.error(`No JSON found in deep search response for "${query}". Text starts with: ${raw.slice(0, 200)}`)
        return []
      }
    }

    const parsed = JSON.parse(raw)
    return parsed.grants ?? []
  } catch (e) {
    console.error(`Failed to parse deep search JSON for "${query}":`, e)
    return []
  }
}

// Parse amount range like "£5,000–£50,000" into min/max numbers
function parseAmountRange(range: string | null): { min: number | null; max: number | null } {
  if (!range) return { min: null, max: null }
  const nums = Array.from(range.matchAll(/[\d,]+/g)).map(m => parseInt(m[0].replace(/,/g, ''), 10))
  if (nums.length === 0) return { min: null, max: null }
  if (nums.length === 1) return { min: nums[0], max: nums[0] }
  return { min: Math.min(...nums), max: Math.max(...nums) }
}

// Parse deadline into ISO date or null
function parseDeadline(deadline: string | null): { date: string | null; isRolling: boolean } {
  if (!deadline) return { date: null, isRolling: false }
  const lower = deadline.toLowerCase().trim()
  if (lower === 'rolling' || lower.includes('rolling') || lower.includes('ongoing') || lower.includes('always open')) {
    return { date: null, isRolling: true }
  }
  // Try to parse "March 2026" style dates
  try {
    const d = new Date(deadline)
    if (!isNaN(d.getTime())) return { date: d.toISOString().split('T')[0], isRolling: false }
  } catch { /* ignore */ }
  return { date: null, isRolling: false }
}

export async function POST(req: NextRequest) {
  if (!await isAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { queries } = await req.json() as { queries: string[] }
  if (!queries?.length) {
    return NextResponse.json({ error: 'queries array required' }, { status: 400 })
  }

  const db = getAdminClient()

  // Get existing grant titles to avoid duplicates
  const { data: existing } = await db
    .from('scraped_grants')
    .select('title')
    .limit(2000)
  const existingTitles = (existing ?? []).map(g => String(g.title).toLowerCase())

  const results: { query: string; found: number; imported: number; skipped: string[] }[] = []

  for (let qi = 0; qi < queries.length; qi++) {
    const query = queries[qi]
    // Rate-limit spacing: wait 65s between queries to stay under 30k tokens/min
    if (qi > 0) {
      console.log(`[bulk-deep-search] Waiting 65s before next query...`)
      await sleep(65_000)
    }
    console.log(`[bulk-deep-search] Running: "${query}"`)
    const grants = await runDeepSearch(query)
    const skipped: string[] = []
    let imported = 0

    for (const g of grants) {
      // Skip duplicates (fuzzy title match)
      const titleLower = g.title.toLowerCase().trim()
      if (existingTitles.some(et => et === titleLower || et.includes(titleLower) || titleLower.includes(et))) {
        skipped.push(`${g.title} (duplicate)`)
        continue
      }

      // Skip if no URL
      if (!g.applyUrl) {
        skipped.push(`${g.title} (no URL)`)
        continue
      }

      const { min, max } = parseAmountRange(g.amountRange)
      const { date: deadline, isRolling } = parseDeadline(g.deadline)

      const row = {
        external_id: `deep-search-${titleLower.replace(/[^a-z0-9]+/g, '-').slice(0, 80)}`,
        source: 'deep_search',
        title: g.title.trim(),
        funder: g.funder?.trim() || 'Unknown',
        funder_type: 'other',
        funding_type: g.fundingType || 'grant',
        description: g.description?.trim() || null,
        amount_min: min,
        amount_max: max,
        deadline,
        is_rolling: isRolling,
        is_local: false,
        sectors: [] as string[],
        eligibility_criteria: [] as string[],
        apply_url: g.applyUrl,
        is_active: false, // Needs Review
        url_status: 'unchecked',
        raw_data: { notes: g.notes, search_query: query },
      }

      // Look up by external_id to choose insert-vs-merge.
      const { data: existingRow } = await db
        .from('scraped_grants')
        .select('id')
        .eq('external_id', row.external_id)
        .maybeSingle()

      let writeErr: Error | null = null
      if (existingRow) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { external_id: _drop, ...patch } = row
          await mergeGrantUpdate({
            id: existingRow.id as string,
            fields: patch,
            source: PROVENANCE_SOURCE,
            pinned: false,
            db,
          })
        } catch (e) {
          writeErr = e instanceof Error ? e : new Error(String(e))
        }
      } else {
        const stamped = stampNewGrant(row, PROVENANCE_SOURCE, { pinned: false })
        const { error } = await db.from('scraped_grants').insert(stamped)
        if (error) writeErr = new Error(error.message)
      }

      if (writeErr) {
        skipped.push(`${g.title} (DB error: ${writeErr.message})`)
      } else {
        imported++
        existingTitles.push(titleLower) // Prevent dups in later queries
      }
    }

    results.push({ query, found: grants.length, imported, skipped })
    console.log(`[bulk-deep-search] "${query}": found ${grants.length}, imported ${imported}`)
  }

  const totalImported = results.reduce((sum, r) => sum + r.imported, 0)
  return NextResponse.json({
    ok: true,
    totalImported,
    results,
  })
}
