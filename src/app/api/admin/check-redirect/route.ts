import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const ADMIN_EMAIL = 'paulkilty1@gmail.com'

/**
 * Check whether a URL redirects to a different destination.
 * Returns the final URL after following all redirects.
 */
export async function POST(req: NextRequest) {
  // Auth check
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (data.user?.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { url } = (await req.json()) as { url?: string }
  if (!url || !url.startsWith('http')) {
    return NextResponse.json({ error: 'Valid URL required' }, { status: 400 })
  }

  try {
    // Follow redirects and capture the final URL
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (GrantTracker/1.0)',
      },
      signal: AbortSignal.timeout(8000),
    })

    const finalUrl = res.url
    // Normalise both for comparison:
    // - strip trailing slash, fragments, query params
    // - ignore protocol difference (http vs https) — not a meaningful redirect
    // - ignore www prefix difference — not a meaningful redirect
    const normalise = (u: string) => {
      try {
        const parsed = new URL(u)
        const host = parsed.hostname.replace(/^www\./, '').toLowerCase()
        return (host + parsed.pathname).replace(/\/$/, '').toLowerCase()
      } catch { return u }
    }

    const inputNorm = normalise(url)
    const finalNorm = normalise(finalUrl)
    const redirected = inputNorm !== finalNorm

    return NextResponse.json({
      ok: true,
      inputUrl: url,
      finalUrl,
      redirected,
      status: res.status,
    })
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to check URL',
    })
  }
}
