// MCP API key revocation endpoint.
// POST /api/mcp/keys/[id]/revoke
// Requires authenticated user who owns the key. Sets status='revoked'
// and stamps revoked_at. Audit trail preserved (no row deletion).
//
// Spec: docs/mcp-spec-v1.md §6.1 (kill switch).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: { code: 'auth_required', message: 'Sign in to revoke a key.' } }, { status: 401 })
  }

  const keyId = params.id
  if (!keyId || !/^[0-9a-f-]{36}$/i.test(keyId)) {
    return NextResponse.json({ error: { code: 'invalid_parameter', message: 'id must be a UUID.' } }, { status: 400 })
  }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  // Ownership check
  const { data: existing } = await service
    .from('api_keys')
    .select('id, user_id, status')
    .eq('id', keyId)
    .maybeSingle()
  if (!existing) {
    return NextResponse.json({ error: { code: 'not_found', message: 'Key not found.' } }, { status: 404 })
  }
  if (existing.user_id !== user.id) {
    return NextResponse.json({ error: { code: 'not_found', message: 'Key not found.' } }, { status: 404 })
  }
  if (existing.status === 'revoked') {
    return NextResponse.json({ ok: true, already_revoked: true }, { status: 200 })
  }

  let reason: string | null = null
  try {
    const body = await req.json() as { reason?: string }
    if (body?.reason && typeof body.reason === 'string') reason = body.reason.slice(0, 200)
  } catch {
    // body optional
  }

  const { error } = await service.from('api_keys').update({
    status: 'revoked',
    revoked_at: new Date().toISOString(),
    revoked_reason: reason ?? 'User-initiated revocation',
  }).eq('id', keyId)

  if (error) {
    return NextResponse.json({ error: { code: 'internal_error', message: error.message } }, { status: 500 })
  }
  return NextResponse.json({ ok: true }, { status: 200 })
}
