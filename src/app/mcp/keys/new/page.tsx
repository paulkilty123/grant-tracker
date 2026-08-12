// MCP key issuance form — developer-portal frame (no dashboard sidebar).
// Server-rendered; submission is handled by a client component so we can
// show the raw key once before redirecting.

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { readMCPToS } from '@/lib/mcp-auth'
import { IssueKeyForm } from './IssueKeyForm'
import LogoMark from '@/components/icons/LogoMark'
import { MCP_BRAND_NAME } from '@/lib/mcp-brand'

export const dynamic = 'force-dynamic'

export default async function NewMCPKeyPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/mcp/keys/new')

  const tos = await readMCPToS()

  return (
    <div style={{ background: '#FAFAF7', minHeight: '100vh', fontFamily: 'var(--font-plus-jakarta, Plus Jakarta Sans, sans-serif)', color: '#2C2C2A' }}>
      <nav style={{ background: 'white', borderBottom: '0.5px solid rgba(23,52,4,0.08)', padding: '18px 0' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/mcp" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
            <LogoMark size={28} />
            <span style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 700, fontSize: 22, letterSpacing: '-0.025em', color: '#2C2C2A' }}>{MCP_BRAND_NAME}</span>
          </Link>
          <div style={{ display: 'flex', gap: 18 }}>
            <Link href="/mcp" style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 13, color: '#5F5E5A', textDecoration: 'none' }}>
              Overview
            </Link>
            <Link href="/mcp/terms" style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 13, color: '#5F5E5A', textDecoration: 'none' }}>
              Terms
            </Link>
            <Link href="/dashboard" style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 13, color: '#5F5E5A', textDecoration: 'none' }}>
              App
            </Link>
          </div>
        </div>
      </nav>

      <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 32px' }}>
        <Link
          href="/mcp/keys"
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
          Use this key in any MCP-compatible agent (Claude, ChatGPT, Gemini, others) to give it access to the {MCP_BRAND_NAME} funding catalogue.
        </p>

        {/* Brand passed down: IssueKeyForm is a client component and must not
            import mcp-brand, which reads non-public env at module load. */}
        <IssueKeyForm tosVersion={tos.version} tosStatus={tos.status} brandName={MCP_BRAND_NAME} />
      </main>
    </div>
  )
}
