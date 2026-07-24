// POST /api/builder/guidelines — applicant-supplied funder guidance (v0.x).
// When the catalogue's funder context is thin, the user can paste the
// funder's application guidance or point at its URL. Stored on the
// application and injected into generation/drafting as an explicitly
// unverified, applicant-supplied block. Never promoted to live enrichment.
//
// Body: { application_id: string, text?: string, url?: string }
// Returns: { ok: true, char_count: number }

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getBuilderUser } from '@/lib/builder/access'
import { emitEvent } from '@/lib/events/emit'
import { brand } from '@/config/brand'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60

const MAX_CHARS = 30_000

/** Crude but dependency-free HTML → text: strip scripts/styles/tags, squash space. */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<br\s*\/?>(?=.)/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim()
}

export async function POST(req: NextRequest) {
  const user = await getBuilderUser()
  if (!user) return NextResponse.json({ error: 'The application builder is currently cohort-only' }, { status: 403 })

  let body: { application_id?: string; text?: string; url?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body.application_id) return NextResponse.json({ error: 'application_id required' }, { status: 400 })

  const supabase = await createServerClient()
  const { data: app } = await supabase
    .from('applications')
    .select('id, org_id')
    .eq('id', body.application_id)
    .maybeSingle()
  if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 })

  let guidelines = ''
  let method: 'pasted' | 'url'

  if (body.text?.trim()) {
    guidelines = body.text.trim()
    method = 'pasted'
  } else if (body.url?.trim()) {
    method = 'url'
    let parsed: URL
    try {
      parsed = new URL(body.url.trim())
      if (!/^https?:$/.test(parsed.protocol)) throw new Error('bad protocol')
    } catch {
      return NextResponse.json({ error: 'That does not look like a valid web address' }, { status: 400 })
    }
    try {
      const res = await fetch(parsed.toString(), {
        headers: { 'User-Agent': `${brand.userAgentBuilder} (+${brand.siteUrl})` },
        redirect: 'follow',
        signal: AbortSignal.timeout(20_000),
      })
      if (!res.ok) {
        return NextResponse.json({ error: `Could not fetch that page (${res.status}). Paste the guidance instead` }, { status: 422 })
      }
      const html = await res.text()
      guidelines = htmlToText(html)
    } catch {
      return NextResponse.json({ error: 'Could not reach that page. Paste the guidance instead' }, { status: 422 })
    }
  } else {
    return NextResponse.json({ error: 'Paste the guidance or give a URL' }, { status: 400 })
  }

  if (guidelines.length < 100) {
    return NextResponse.json({ error: 'That looks too short to be application guidance' }, { status: 422 })
  }
  guidelines = guidelines.slice(0, MAX_CHARS)

  const { error } = await supabase
    .from('applications')
    .update({
      supplied_guidelines: guidelines,
      supplied_guidelines_source: method,
      updated_at: new Date().toISOString(),
    })
    .eq('id', app.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await emitEvent(
    { surface: 'app', orgId: app.org_id, userId: user.id },
    'builder_guidelines_added',
    { application_id: app.id, method, char_count: guidelines.length },
  )

  return NextResponse.json({ ok: true, char_count: guidelines.length })
}
