// MCP key issuance form — server component that reads current ToS version
// and renders the form. Submission is handled by a client component so we
// can show the raw key once before redirecting.

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { readMCPToS } from '@/lib/mcp-auth'
import { IssueKeyForm } from './IssueKeyForm'

export const dynamic = 'force-dynamic'

export default async function NewMCPKeyPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/dashboard/mcp/keys/new')

  const tos = await readMCPToS()

  return (
    <div className="max-w-2xl">
      <Link
        href="/dashboard/mcp/keys"
        className="inline-flex items-center gap-1.5 text-xs font-semibold mb-5 hover:underline"
        style={{ color: '#5F5E5A', fontFamily: 'var(--font-space-grotesk)' }}
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to keys
      </Link>

      <h1 className="text-2xl font-bold text-charcoal mb-1" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
        Generate a new MCP API key
      </h1>
      <p className="text-sm text-mid mb-6">
        Use this key in any MCP-compatible agent (Claude, ChatGPT, Gemini) to give it access to the Grant Tracker funding catalogue.
      </p>

      <IssueKeyForm tosVersion={tos.version} tosStatus={tos.status} />
    </div>
  )
}
