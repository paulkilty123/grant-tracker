import { NextRequest } from 'next/server'
import { getAdminDb } from '@/lib/admin/admin-db'
import { verifyWaitlistRemovalToken } from '@/lib/waitlist-unsubscribe'
import { UI, BODY, C } from '@/lib/email/tokens'
import { EMAIL_APP_URL } from '@/lib/mcp-brand'

export const dynamic = 'force-dynamic'

/**
 * "Take me off the list", from the waitlist acknowledgement email.
 *
 * GET rather than POST, and no confirmation step, because the person clicking
 * has already decided and the cost of being wrong is that they stop getting an
 * email they did not want. A confirm page here would be a second thing to do
 * in order to stop hearing from us, which is the pattern this link exists to
 * be the opposite of.
 *
 * The row is UPDATED, never deleted. `created_at` is the consent record the
 * privacy policy rests on, so deleting the row would destroy the evidence of
 * the consent AND of its withdrawal in one statement.
 *
 * Always renders the same page, authentic token or not. A different response
 * for a bad token turns this into an oracle, and there is nothing a visitor
 * can do about a mangled link anyway. A genuine failure is logged, not shown.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('t') ?? ''
  const rowId = token ? verifyWaitlistRemovalToken(token) : null

  if (rowId) {
    // Idempotent: a second click keeps the FIRST timestamp, because the first
    // click is when they asked. `is null` in the filter, not a bare update.
    const { error } = await getAdminDb()
      .from('waitlist_signups')
      .update({ unsubscribed_at: new Date().toISOString() })
      .eq('id', rowId)
      .is('unsubscribed_at', null)
    if (error) console.error('[waitlist/unsubscribe] update failed:', error.message)
  } else {
    console.warn('[waitlist/unsubscribe] token did not verify')
  }

  return new Response(page(), {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Nothing here should sit in a cache: the page is the receipt for a
      // write, and a CDN copy would show it to somebody who never clicked.
      'Cache-Control': 'no-store',
    },
  })
}

function page(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Removed from the Shoots list</title>
</head>
<body style="margin:0;padding:0;background:${C.page};">
  <div style="max-width:460px;margin:0 auto;padding:80px 24px;font-family:${BODY},sans-serif;">
    <p style="margin:0 0 12px;font-family:${UI};font-size:24px;font-weight:600;letter-spacing:-.4px;color:${C.deep};line-height:1.25;">You are off the list</p>
    <p style="margin:0 0 24px;font-size:15.5px;line-height:1.65;color:${C.body};">We will not email you again. If you change your mind you can sign up again any time.</p>
    <p style="margin:0;font-size:14px;line-height:1.6;">
      <a href="${EMAIL_APP_URL}" style="color:${C.deep};font-weight:600;text-decoration:underline;">shootsfunding.co.uk</a>
    </p>
  </div>
</body>
</html>`
}
