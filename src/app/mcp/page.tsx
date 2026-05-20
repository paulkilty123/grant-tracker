// Public MCP landing page at /mcp. Lightweight intro + path to key issuance.
// Production design polish to come; v1 ships functional.

import Link from 'next/link'
import { ArrowRight, Key, BookOpen, FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function MCPLandingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const ctaHref = user ? '/mcp/keys/new' : '/auth/login?next=/mcp/keys/new'

  return (
    <div style={{ background: '#FAFAF7', minHeight: '100vh', fontFamily: 'var(--font-plus-jakarta, Plus Jakarta Sans, sans-serif)', color: '#2C2C2A' }}>
      <nav style={{ background: 'white', borderBottom: '0.5px solid rgba(23,52,4,0.08)', padding: '18px 0' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/" style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 500, fontSize: 22, letterSpacing: '-0.03em', color: '#2C2C2A', textDecoration: 'none' }}>
            GrantTracker
          </Link>
          <Link href="/mcp/terms" style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 13, color: '#5F5E5A', textDecoration: 'none' }}>
            Terms
          </Link>
        </div>
      </nav>

      <main style={{ maxWidth: 760, margin: '0 auto', padding: '64px 32px 48px' }}>
        <span style={{ display: 'inline-block', fontFamily: 'var(--font-space-grotesk)', fontWeight: 600, fontSize: 11, color: '#3B6D11', textTransform: 'uppercase', letterSpacing: '0.08em', background: '#F1F7E4', padding: '4px 10px', borderRadius: 999, marginBottom: 18 }}>
          MCP server
        </span>
        <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 500, fontSize: 40, lineHeight: 1.1, letterSpacing: '-0.02em', color: '#2C2C2A', marginBottom: 18 }}>
          UK funding discovery, inside your AI agent.
        </h1>
        <p style={{ fontSize: 17, lineHeight: 1.6, color: '#5F5E5A', marginBottom: 28 }}>
          Grant Tracker&apos;s catalogue of UK grants, programmes, social investment, and in-kind support, made available to Claude, ChatGPT, Gemini, and any other MCP-compatible agent.
        </p>

        <div style={{ display: 'flex', gap: 12, marginBottom: 48, flexWrap: 'wrap' }}>
          <Link
            href={ctaHref}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 22px', fontSize: 15, fontWeight: 600, borderRadius: 10, background: '#8ECB3C', color: '#173404', fontFamily: 'var(--font-space-grotesk)', textDecoration: 'none', boxShadow: '0 2px 8px rgba(132,204,22,0.25)' }}
          >
            Get a free API key
            <ArrowRight size={16} />
          </Link>
          <Link
            href="/mcp/terms"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 22px', fontSize: 15, fontWeight: 600, borderRadius: 10, border: '1px solid #2C2C2A', background: 'transparent', color: '#2C2C2A', fontFamily: 'var(--font-space-grotesk)', textDecoration: 'none' }}
          >
            Read the terms
          </Link>
        </div>

        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: 40 }}>
          <Feature icon={<Key size={18} />} title="Free API key" body="Self-serve. Bound to a Grant Tracker account. Generated in under a minute." />
          <Feature icon={<BookOpen size={18} />} title="Five tools" body="search_funding_and_support, get_opportunity_detail, get_provider_intelligence, get_taxonomy, health_check." />
          <Feature icon={<FileText size={18} />} title="UK-specialised" body="Eligibility-aware scoring across the four funding types — grants, programmes, investment, in-kind." />
        </div>

        <div style={{ borderTop: '0.5px solid rgba(23,52,4,0.08)', paddingTop: 24, fontSize: 13, color: '#8A8986', lineHeight: 1.6 }}>
          The MCP is read-only. Saving opportunities, deadline alerts, pipeline tracking, and personalised matching against your organisation&apos;s profile all happen in the <Link href="/" style={{ color: '#3B6D11', fontWeight: 600, textDecoration: 'none' }}>Grant Tracker web app</Link>.
        </div>
      </main>
    </div>
  )
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div style={{ background: 'white', border: '0.5px solid rgba(23,52,4,0.10)', borderRadius: 12, padding: 18, boxShadow: '0 2px 16px rgba(26,46,43,0.04)' }}>
      <div style={{ color: '#3B6D11', marginBottom: 8 }}>{icon}</div>
      <p style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 600, fontSize: 14, color: '#2C2C2A', marginBottom: 4 }}>
        {title}
      </p>
      <p style={{ fontSize: 13, color: '#5F5E5A', lineHeight: 1.5 }}>
        {body}
      </p>
    </div>
  )
}
