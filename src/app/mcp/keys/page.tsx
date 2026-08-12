// MCP API key list — developer-portal frame (no dashboard sidebar).
// Server-rendered; revoke is wired via a small client component.

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Key, Plus } from 'lucide-react'
import { RevokeKeyButton } from './RevokeKeyButton'
import LogoMark from '@/components/icons/LogoMark'
import { MCP_BRAND_NAME } from '@/lib/mcp-brand'

export const dynamic = 'force-dynamic'

interface ApiKeyListItem {
  id: string
  key_prefix: string
  name: string
  utm_source: string
  org_name: string | null
  use_case: string | null
  tos_version: string
  status: 'active' | 'revoked'
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default async function MCPKeysPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/mcp/keys')

  const { data: keysRaw } = await supabase
    .from('api_keys')
    .select('id, key_prefix, name, utm_source, org_name, use_case, tos_version, status, created_at, last_used_at, revoked_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const keys = (keysRaw ?? []) as ApiKeyListItem[]
  const active = keys.filter(k => k.status === 'active')
  const revoked = keys.filter(k => k.status === 'revoked')

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

      <main style={{ maxWidth: 900, margin: '0 auto', padding: '48px 32px' }}>
        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-charcoal mb-1" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
              MCP API Keys
            </h1>
            <p className="text-sm text-mid">
              Keys for connecting MCP-compatible agents (Claude, ChatGPT, Gemini, others) to the {MCP_BRAND_NAME} funding catalogue.
            </p>
          </div>
          <Link
            href="/mcp/keys/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity flex-shrink-0"
            style={{ background: '#8ECB3C', color: '#173404', fontFamily: 'var(--font-space-grotesk)' }}
          >
            <Plus className="w-4 h-4" />
            New API key
          </Link>
        </div>

        {keys.length === 0 ? (
          <div className="rounded-xl border border-warm p-10 text-center" style={{ background: 'white' }}>
            <Key className="w-8 h-8 mx-auto mb-3" style={{ color: '#8A8986' }} />
            <p className="text-sm font-semibold text-charcoal mb-1" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
              No API keys yet
            </p>
            <p className="text-xs text-mid mb-4">Generate your first key to connect an agent to the {MCP_BRAND_NAME} MCP.</p>
            <Link
              href="/mcp/keys/new"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg"
              style={{ background: '#173404', color: '#FAF7F2', fontFamily: 'var(--font-space-grotesk)' }}
            >
              Get my first key
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {active.length > 0 && (
              <section>
                <h2 className="text-xs font-bold uppercase tracking-wider text-mid mb-3" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                  Active ({active.length})
                </h2>
                <div className="bg-white rounded-xl border border-warm overflow-hidden" style={{ boxShadow: '0 2px 16px rgba(26,46,43,0.04)' }}>
                  {active.map((k, i) => (
                    <KeyRow key={k.id} k={k} isLast={i === active.length - 1} />
                  ))}
                </div>
              </section>
            )}
            {revoked.length > 0 && (
              <section>
                <h2 className="text-xs font-bold uppercase tracking-wider text-mid mb-3" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                  Revoked ({revoked.length})
                </h2>
                <div className="bg-white rounded-xl border border-warm overflow-hidden opacity-70">
                  {revoked.map((k, i) => (
                    <KeyRow key={k.id} k={k} isLast={i === revoked.length - 1} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

function KeyRow({ k, isLast }: { k: ApiKeyListItem; isLast: boolean }) {
  return (
    <div className={`flex items-start gap-4 p-5 ${isLast ? '' : 'border-b border-warm'}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="text-sm font-semibold text-charcoal truncate" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
            {k.name}
          </span>
          <code className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: '#F0EDE2', color: '#5F5E5A', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
            {k.key_prefix}…
          </code>
          {k.status === 'revoked' && (
            <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded" style={{ background: '#FAECE7', color: '#993C1D' }}>
              revoked
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-mid flex-wrap">
          <span>Source: <span className="text-charcoal">{k.utm_source}</span></span>
          <span>·</span>
          <span>Created {formatDate(k.created_at)}</span>
          <span>·</span>
          <span>Last used {formatDate(k.last_used_at)}</span>
          {k.status === 'revoked' && k.revoked_at && (
            <>
              <span>·</span>
              <span>Revoked {formatDate(k.revoked_at)}</span>
            </>
          )}
        </div>
        {(k.org_name || k.use_case) && (
          <p className="text-xs text-mid mt-2 truncate">
            {k.org_name && <span>{k.org_name}</span>}
            {k.org_name && k.use_case && <span> · </span>}
            {k.use_case && <span>{k.use_case}</span>}
          </p>
        )}
      </div>
      {k.status === 'active' && (
        <RevokeKeyButton keyId={k.id} keyName={k.name} />
      )}
    </div>
  )
}
