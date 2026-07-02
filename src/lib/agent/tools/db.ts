// Server-side service client for the tool layer. The tool is the authorization
// boundary (service role bypasses RLS), so every query MUST scope by the orgId
// from ToolContext. Never import a session/cookie/request-bound client here.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export function serviceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}
