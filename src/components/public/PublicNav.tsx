import React from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import LogoMark from '@/components/icons/LogoMark'
import { MCP_BRAND_NAME } from '@/lib/mcp-brand'

/**
 * The logged-out header shared by the public catalogue pages. The same markup
 * as the grant page's nav (which predates this file and keeps its own copy):
 * 42px mark, 11px gap, wordmark 27px at weight 500, matching the landing
 * header. Paul, 14 Sept: exactly the same.
 */
export const PUBLIC_T = {
  cream:    '#F6F1E7',
  deep:     '#1D3C3E',
  charcoal: '#2E2E2E',
  inkMuted: '#5F5E5A',
  inkPlace: '#74736E',
  warm:     '#F1EDE3',
  hair:     'rgba(29,60,62,0.10)',
  ghost:    'rgba(29,60,62,0.22)',
  green:    '#1B6B3D',
  greenBg:  '#E4F1EA',
}

export const PUBLIC_UI   = 'var(--font-space-grotesk), Space Grotesk, sans-serif'
export const PUBLIC_BODY = 'var(--font-plus-jakarta, Plus Jakarta Sans, sans-serif)'

export default function PublicNav({ signupHref }: { signupHref: string }) {
  const T = PUBLIC_T
  return (
    <nav style={{ background: '#fff', borderBottom: `1px solid ${T.hair}` }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '16px 26px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 11, fontFamily: PUBLIC_UI, fontWeight: 500, fontSize: 27, letterSpacing: '-0.01em', color: T.deep, textDecoration: 'none' }}>
          <LogoMark size={42} />
          {MCP_BRAND_NAME.toLowerCase()}
        </Link>
        <span style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <Link href="/grants" style={{ fontFamily: PUBLIC_UI, fontSize: 14, fontWeight: 500, color: T.inkMuted, textDecoration: 'none' }}>
            Browse funding
          </Link>
          <Link href="/auth/login" style={{ fontFamily: PUBLIC_UI, fontSize: 14, fontWeight: 500, color: T.inkMuted, textDecoration: 'none' }}>
            Sign in
          </Link>
          <Link
            href={signupHref}
            style={{
              fontFamily: PUBLIC_UI, fontSize: 14, fontWeight: 600, color: T.cream, background: T.deep,
              padding: '11px 20px', borderRadius: 999, textDecoration: 'none',
              display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
            }}
          >
            <span>Find funding<span className="hidden md:inline"> for your organisation</span></span>
            <ArrowRight style={{ width: 15, height: 15 }} />
          </Link>
        </span>
      </div>
    </nav>
  )
}
