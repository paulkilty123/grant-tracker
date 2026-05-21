// OAuth 2.0 token endpoint (RFC 6749 §3.2, §4.1.3, §6).
//
// Accepts:
//   - grant_type=authorization_code: code + redirect_uri + client_id + code_verifier
//   - grant_type=refresh_token:      refresh_token + client_id
//
// All public clients (token_endpoint_auth_method='none') — no client_secret
// required. PKCE is mandatory and was bound at /authorize; we verify it here.
//
// Body MUST be application/x-www-form-urlencoded (RFC 6749 §3.2). We do not
// accept JSON.

import { NextRequest, NextResponse } from 'next/server'
import {
  consumeAuthorizationCode,
  consumeRefreshToken,
  getClient,
  issueTokens,
} from '@/lib/mcp-oauth'

export const dynamic = 'force-dynamic'

function err(status: number, code: string, description: string) {
  return NextResponse.json(
    { error: code, error_description: description },
    {
      status,
      headers: {
        'Cache-Control':                'no-store',
        'Pragma':                       'no-cache',
        'Access-Control-Allow-Origin':  '*',
      },
    },
  )
}

function tokenJson(body: Record<string, unknown>): NextResponse {
  return NextResponse.json(body, {
    status: 200,
    headers: {
      'Cache-Control':                'no-store',
      'Pragma':                       'no-cache',
      'Access-Control-Allow-Origin':  '*',
    },
  })
}

export async function POST(req: NextRequest) {
  // RFC 6749 mandates form-encoded; reject anything else.
  const contentType = req.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().includes('application/x-www-form-urlencoded')) {
    return err(400, 'invalid_request', 'Content-Type must be application/x-www-form-urlencoded.')
  }

  let form: URLSearchParams
  try {
    form = new URLSearchParams(await req.text())
  } catch {
    return err(400, 'invalid_request', 'Request body could not be parsed as form-urlencoded.')
  }

  const grant_type = form.get('grant_type')
  const client_id  = form.get('client_id')

  if (!client_id) {
    return err(400, 'invalid_client', 'client_id is required.')
  }
  // Validate the client exists + is active; rejects revoked clients.
  let client
  try {
    client = await getClient(client_id)
  } catch (e) {
    return err(500, 'server_error', e instanceof Error ? e.message : 'Client lookup failed.')
  }
  if (!client) {
    return err(401, 'invalid_client', 'Unknown or inactive client_id.')
  }

  if (grant_type === 'authorization_code') {
    const code          = form.get('code')
    const redirect_uri  = form.get('redirect_uri')
    const code_verifier = form.get('code_verifier')

    if (!code)          return err(400, 'invalid_request', 'code is required.')
    if (!redirect_uri)  return err(400, 'invalid_request', 'redirect_uri is required.')
    if (!code_verifier) return err(400, 'invalid_request', 'code_verifier is required (PKCE).')
    // PKCE verifier length per RFC 7636 §4.1: 43–128 chars, [A-Z a-z 0-9 -._~].
    if (code_verifier.length < 43 || code_verifier.length > 128 || !/^[A-Za-z0-9\-._~]+$/.test(code_verifier)) {
      return err(400, 'invalid_request', 'code_verifier must be 43–128 chars from the unreserved set.')
    }

    const consumed = await consumeAuthorizationCode({
      raw_code:      code,
      client_id,
      redirect_uri,
      code_verifier,
    })
    if (!consumed.ok) {
      const status = consumed.err.error === 'server_error' ? 500 : 400
      return err(status, consumed.err.error, consumed.err.description)
    }

    let tokens
    try {
      tokens = await issueTokens({
        user_id:   consumed.data.user_id,
        client_id,
        scope:     consumed.data.scope,
        resource:  consumed.data.resource,
      })
    } catch (e) {
      return err(500, 'server_error', e instanceof Error ? e.message : 'Token issuance failed.')
    }

    return tokenJson({
      access_token:  tokens.access_token,
      token_type:    'Bearer',
      expires_in:    tokens.expires_in,
      refresh_token: tokens.refresh_token,
      scope:         tokens.scope,
    })
  }

  if (grant_type === 'refresh_token') {
    const refresh_token = form.get('refresh_token')
    if (!refresh_token) return err(400, 'invalid_request', 'refresh_token is required.')

    const rotated = await consumeRefreshToken({ raw_refresh: refresh_token, client_id })
    if (!rotated.ok) {
      const status = rotated.err.error === 'server_error' ? 500 : 400
      return err(status, rotated.err.error, rotated.err.description)
    }
    const t = rotated.data
    return tokenJson({
      access_token:  t.access_token,
      token_type:    'Bearer',
      expires_in:    t.expires_in,
      refresh_token: t.refresh_token,
      scope:         t.scope,
    })
  }

  return err(400, 'unsupported_grant_type', `grant_type "${grant_type ?? ''}" is not supported.`)
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
