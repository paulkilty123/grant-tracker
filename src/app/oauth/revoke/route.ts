// OAuth 2.0 token revocation (RFC 7009).
//
// Public clients revoke their own access or refresh tokens. We accept both
// kinds; the matching oauth_tokens row is marked revoked. Per RFC 7009 §2.2
// the response MUST be 200 regardless of whether the token was found — we
// must not leak token validity to an attacker.
//
// Body MUST be application/x-www-form-urlencoded. token_type_hint is
// accepted but ignored (we look up by hash on both columns).

import { NextRequest, NextResponse } from 'next/server'
import { revokeToken } from '@/lib/mcp-oauth'

export const dynamic = 'force-dynamic'

function ok() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Cache-Control':                'no-store',
      'Pragma':                       'no-cache',
      'Access-Control-Allow-Origin':  '*',
    },
  })
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().includes('application/x-www-form-urlencoded')) {
    // RFC 7009 §2.1 mandates form-encoded. Treat anything else as a bad
    // request — clients should fix their integration, not silently 200.
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'Content-Type must be application/x-www-form-urlencoded.' },
      { status: 400, headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } },
    )
  }

  let form: URLSearchParams
  try {
    form = new URLSearchParams(await req.text())
  } catch {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'Request body could not be parsed as form-urlencoded.' },
      { status: 400, headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } },
    )
  }

  const token = form.get('token')
  if (!token) {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'token is required.' },
      { status: 400, headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } },
    )
  }

  // Errors during revocation are swallowed — RFC 7009 wants 200 regardless,
  // so an unfound or already-revoked token returns success.
  try { await revokeToken(token) } catch { /* fall through to 200 */ }
  return ok()
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
