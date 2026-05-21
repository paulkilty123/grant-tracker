// OAuth 2.0 Dynamic Client Registration (RFC 7591).
// Open endpoint — anyone can register a client. Hardening per the 2026-05-21
// build decision:
//   - Per-IP sliding-window rate limit (5/hour, Upstash)
//   - redirect_uri validated: https only, no localhost/private IPs in prod
//   - Per-IP cap on active clients (REGISTER_MAX_CLIENTS_PER_IP)
//   - 60-day unused-client expiry (set on registration; refreshed on use)

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  enforceRegisterRateLimit,
  countActiveClientsByIp,
  registerClient,
  validateRedirectUri,
  REGISTER_MAX_CLIENTS_PER_IP,
} from '@/lib/mcp-oauth'

export const dynamic = 'force-dynamic'

// RFC 7591 §2 — client metadata. We accept a permissive superset and validate
// the bits that matter for our flow.
const RegisterRequestSchema = z.object({
  client_name:                z.string().min(1).max(120).optional(),
  redirect_uris:              z.array(z.string().min(1).max(2048)).min(1).max(10),
  grant_types:                z.array(z.string()).optional(),
  response_types:             z.array(z.string()).optional(),
  scope:                      z.string().max(200).optional(),
  token_endpoint_auth_method: z.enum(['none', 'client_secret_basic', 'client_secret_post']).optional(),
  software_id:                z.string().max(120).optional(),
  software_version:           z.string().max(40).optional(),
})

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  const real = req.headers.get('x-real-ip')
  if (real) return real
  return 'unknown'
}

function err(status: number, code: string, description: string) {
  return NextResponse.json(
    { error: code, error_description: description },
    { status, headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } },
  )
}

export async function POST(req: NextRequest) {
  // Rate limit first — cheapest rejection.
  const ip = clientIp(req)
  const rl = await enforceRegisterRateLimit(ip)
  if (!rl.allowed) {
    return new NextResponse(
      JSON.stringify({ error: 'too_many_requests', error_description: 'Rate limit exceeded for /oauth/register.' }),
      {
        status: 429,
        headers: {
          'Content-Type':                'application/json',
          'Cache-Control':               'no-store',
          'Retry-After':                 String(rl.retry_after ?? 60),
          'Access-Control-Allow-Origin': '*',
        },
      },
    )
  }

  // Parse + shape-validate the request body.
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return err(400, 'invalid_client_metadata', 'Request body must be valid JSON.')
  }
  const parsed = RegisterRequestSchema.safeParse(raw)
  if (!parsed.success) {
    return err(400, 'invalid_client_metadata', parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '))
  }
  const meta = parsed.data

  // Validate each redirect_uri — hardening.
  const allowLocalhost = process.env.NODE_ENV !== 'production'
  for (const uri of meta.redirect_uris) {
    const v = validateRedirectUri(uri, { allowLocalhost })
    if (!v.ok) {
      return err(400, 'invalid_redirect_uri', `${uri} — ${v.reason}`)
    }
  }

  // Per-IP cap on active clients.
  let activeCount: number
  try {
    activeCount = await countActiveClientsByIp(ip)
  } catch {
    return err(500, 'server_error', 'Could not check existing registrations for this IP.')
  }
  if (activeCount >= REGISTER_MAX_CLIENTS_PER_IP) {
    return err(429, 'too_many_requests', `Per-IP active-client cap reached (${REGISTER_MAX_CLIENTS_PER_IP}). Revoke unused clients before registering more.`)
  }

  // Restrict scope at registration time. We only emit 'read' in v1.
  if (meta.scope && meta.scope.split(/\s+/).some(s => s !== 'read')) {
    return err(400, 'invalid_scope', "Only the 'read' scope is currently supported.")
  }

  // Register.
  let registered
  try {
    registered = await registerClient(meta, ip)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown'
    return err(500, 'server_error', `Registration failed: ${msg}`)
  }

  return NextResponse.json(
    registered,
    {
      status: 201,
      headers: {
        'Cache-Control':                'no-store',
        'Access-Control-Allow-Origin':  '*',
      },
    },
  )
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
