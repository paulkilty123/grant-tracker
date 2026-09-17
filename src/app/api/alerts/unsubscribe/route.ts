import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/admin/admin-db'
import { verifyUnsubscribeToken } from '@/lib/alerts-unsubscribe'
import { MCP_APP_ORIGIN, MCP_BRAND_NAME } from '@/lib/mcp-brand'

export const dynamic = 'force-dynamic'

/**
 * One-click unsubscribe from new-opportunity alerts.
 *
 * Reached by a logged-out person from an email, so it authenticates on the
 * signed token in the URL and nothing else. Service-role client, because there
 * is no session to carry RLS.
 *
 * POST is the RFC 8058 endpoint that Gmail and Outlook call from their own
 * "unsubscribe" affordance. GET is the same action for a human clicking the
 * link in the footer.
 *
 * GET performs the unsubscribe rather than showing a confirm step. A link
 * prefetched by a mail scanner will therefore switch alerts off without the
 * person asking — accepted deliberately: the cost is one email they can
 * re-enable in two clicks from the page this returns, and the alternative is
 * an unsubscribe that does not work on the first click, which is the failure
 * that actually loses trust.
 */

async function unsubscribe(token: string | null): Promise<{ ok: boolean; reason?: string }> {
  const orgId = verifyUnsubscribeToken(token)
  if (!orgId) return { ok: false, reason: 'invalid' }

  const db = getAdminDb()
  const { data, error } = await db
    .from('organisations')
    .update({ alerts_enabled: false })
    .eq('id', orgId)
    .select('id')

  if (error) return { ok: false, reason: error.message }
  // An authentic token for a deleted org: report success. The person asked not
  // to be emailed and they will not be. Saying "not found" would be true and
  // useless.
  if (!data?.length) return { ok: true }
  return { ok: true }
}

function page(title: string, body: string, showBack: boolean): string {
  return `<!DOCTYPE html><html lang="en-GB"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${title} | ${MCP_BRAND_NAME}</title></head>
<body style="margin:0;background:#F5F1E8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:64px 20px;">
    <div style="background:#fff;border:1px solid #E4DED2;border-radius:16px;padding:32px;">
      <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#173404;">${title}</h1>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#2C2C2A;">${body}</p>
      ${showBack ? `<a href="${MCP_APP_ORIGIN}/dashboard/profile#card-alerts"
         style="display:inline-block;background:#173404;color:#F1F7E4;text-decoration:none;
                padding:11px 20px;border-radius:10px;font-size:14px;font-weight:600;">
        Turn it back on
      </a>` : ''}
    </div>
  </div>
</body></html>`
}

export async function GET(req: NextRequest) {
  const result = await unsubscribe(req.nextUrl.searchParams.get('t'))

  if (!result.ok && result.reason === 'invalid') {
    return new NextResponse(
      page(
        'That link did not work',
        'The unsubscribe link looks incomplete or has been altered. You can turn the Weekly Funding Update off yourself on your profile page.',
        true,
      ),
      { status: 400, headers: { 'content-type': 'text/html; charset=utf-8' } },
    )
  }

  if (!result.ok) {
    return new NextResponse(
      page(
        'Something went wrong',
        'We could not turn the Weekly Funding Update off just now. Please try again, or turn it off on your profile page.',
        true,
      ),
      { status: 500, headers: { 'content-type': 'text/html; charset=utf-8' } },
    )
  }

  return new NextResponse(
    page(
      'You are unsubscribed',
      'You will not get the Weekly Funding Update any more. Nothing else about your account has changed.',
      true,
    ),
    { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
  )
}

/**
 * RFC 8058 one-click. The mail client posts here with no body worth reading
 * and expects a 2xx; it shows the user its own confirmation, so there is no
 * HTML to return.
 */
export async function POST(req: NextRequest) {
  // The token may arrive in the query string (where List-Unsubscribe put it).
  const result = await unsubscribe(req.nextUrl.searchParams.get('t'))
  if (!result.ok && result.reason === 'invalid') {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
  }
  if (!result.ok) {
    return NextResponse.json({ error: 'Unsubscribe failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
