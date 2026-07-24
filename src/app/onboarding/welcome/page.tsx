'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { brand } from '@/config/brand'

const UI = "var(--font-space-grotesk), Space Grotesk, sans-serif"
const BODY = "var(--font-dm-sans), Plus Jakarta Sans, sans-serif"

function firstName(email: string | null | undefined, meta: Record<string, unknown> | null): string {
  const metaName = typeof meta?.first_name === 'string' ? (meta.first_name as string).trim() : ''
  if (metaName) return metaName
  const fullName = typeof meta?.full_name === 'string' ? (meta.full_name as string).trim() : ''
  if (fullName) return fullName.split(/\s+/)[0]
  if (email) {
    const local = email.split('@')[0]
    const token = local.split(/[._-]/)[0]
    if (token) return token.charAt(0).toUpperCase() + token.slice(1)
  }
  return 'there'
}

export default function OnboardingWelcomePage() {
  const [name, setName] = useState<string>('there')

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setName(firstName(user.email, user.user_metadata ?? null))
    }
    load()
  }, [])

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      padding: '20px 24px 40px',
      minHeight: 620,
      width: '100%',
      background: 'var(--surface-card)',
      fontFamily: BODY,
      color: 'var(--text-body)',
    }}>
      {/* Hero — matches wizard step 'entry' positioning */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        textAlign: 'center',
        maxWidth: 560,
        margin: '0 auto',
        width: '100%',
        paddingTop: 146,
      }}>
        {/* Eyebrow */}
        <div style={{
          fontFamily: UI,
          fontWeight: 500,
          fontSize: 11.5,
          color: '#8ECB3C',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          marginBottom: 20,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <span style={{ width: 6, height: 6, background: '#8ECB3C', borderRadius: '50%', display: 'inline-block', flexShrink: 0 }} />
          Founding cohort, you&rsquo;re in
        </div>

        <h1 style={{
          fontFamily: UI,
          fontWeight: 500,
          fontSize: 'clamp(36px, 5.5vw, 52px)',
          lineHeight: 1.08,
          letterSpacing: '-0.025em',
          color: 'var(--text-body)',
          marginBottom: 18,
        }}>
          Welcome, {name}.
        </h1>

        <p style={{
          fontFamily: BODY,
          fontSize: 17,
          lineHeight: 1.55,
          color: 'var(--text-muted)',
          maxWidth: 460,
          marginBottom: 36,
        }}>
          You&rsquo;re one of the first to use {brand.name}. Let&rsquo;s set up your organisation so we can match you with funding that fits: grants, programmes, social investment, and in-kind support. About two minutes.
        </p>

        <Link
          href="/onboarding/wizard"
          style={{
            fontFamily: UI,
            fontWeight: 600,
            fontSize: 15,
            background: '#8ECB3C',
            color: 'var(--deep)',
            padding: '13px 24px',
            borderRadius: 10,
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          Let&rsquo;s get you set up
          <ArrowRight size={16} strokeWidth={2.5} />
        </Link>
      </div>

      {/* Bottom skip — matches wizard's pattern */}
      <div style={{ textAlign: 'center' }}>
        <Link
          href="/dashboard/profile"
          style={{ fontFamily: UI, fontSize: 13, color: 'var(--text-subtle)', padding: '12px 16px', display: 'inline-block', textDecoration: 'none' }}
        >
          Set up later
        </Link>
      </div>
    </div>
  )
}
