// MCP API key issuance endpoint.
// POST /api/mcp/keys/issue
// Requires authenticated Grant Tracker user (cookie-based, Supabase auth).
// Records ToS version at issuance, generates the key, returns the raw value
// once — never again retrievable.
//
// Spec: docs/mcp-spec-v1.md §6.1.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { generateApiKey, readMCPToS } from '@/lib/mcp-auth'

export const dynamic = 'force-dynamic'

const ALLOWED_UTM_SOURCES = new Set([
  'developer_mcp',
  'claude_mcp',
  'chatgpt_mcp',
  'gemini_mcp',
])

interface IssueBody {
  name?: string
  org_name?: string
  use_case?: string
  utm_source?: string
  tos_accepted?: boolean
  tos_version?: string
}

export async function POST(req: NextRequest) {
  // 1. Authenticate the Grant Tracker user issuing the key
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: { code: 'auth_required', message: 'Sign in to issue an MCP key.' } }, { status: 401 })
  }

  // 2. Parse and validate body
  let body: IssueBody
  try {
    body = await req.json() as IssueBody
  } catch {
    return NextResponse.json({ error: { code: 'invalid_parameter', message: 'Body must be JSON.' } }, { status: 400 })
  }

  const name = (body.name ?? '').trim()
  if (!name) {
    return NextResponse.json({ error: { code: 'invalid_parameter', message: 'name is required.' } }, { status: 400 })
  }
  if (name.length > 80) {
    return NextResponse.json({ error: { code: 'invalid_parameter', message: 'name must be 80 characters or fewer.' } }, { status: 400 })
  }

  if (!body.tos_accepted) {
    return NextResponse.json({ error: { code: 'invalid_parameter', message: 'Must accept the Terms of Service.' } }, { status: 400 })
  }

  // ToS version check: client-side tells us which version they accepted; we
  // compare against the current server-side version. Mismatch means the
  // terms changed mid-flow and they need to re-read + re-accept.
  const tos = await readMCPToS()
  if (body.tos_version && body.tos_version !== tos.version) {
    return NextResponse.json({
      error: {
        code: 'invalid_parameter',
        message: `Terms of Service have been updated (current: ${tos.version}). Please re-read and re-accept.`,
        details: { current_version: tos.version, submitted_version: body.tos_version },
      },
    }, { status: 409 })
  }

  const utm_source = body.utm_source && ALLOWED_UTM_SOURCES.has(body.utm_source)
    ? body.utm_source
    : 'developer_mcp'

  // 3. Generate and store
  const generated = generateApiKey()
  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
  const { data: inserted, error } = await service.from('api_keys').insert({
    user_id:     user.id,
    key_hash:    generated.hash,
    key_prefix:  generated.prefix,
    name,
    utm_source,
    org_name:    body.org_name?.trim() || null,
    use_case:    body.use_case?.trim() || null,
    tos_version: tos.version,
  }).select('id, key_prefix, name, utm_source, created_at, tos_version').single()

  if (error || !inserted) {
    return NextResponse.json({ error: { code: 'internal_error', message: error?.message ?? 'failed to create key' } }, { status: 500 })
  }

  // 4. Return raw key ONCE. Caller must store it; it cannot be retrieved again.
  return NextResponse.json({
    api_key: generated.raw,
    key: inserted,
    warning: 'Save this key now. It will not be shown again.',
  }, { status: 201 })
}
