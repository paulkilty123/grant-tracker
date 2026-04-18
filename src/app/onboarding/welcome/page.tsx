'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

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
    <div className="flex-1 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-xl text-center">
        {/* "You're in" cohort pill */}
        <span
          className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold"
          style={{
            fontFamily: 'var(--font-space-grotesk)',
            background: '#F5F1E8',
            color: '#173404',
            border: '1px solid #E8E0D1',
            borderRadius: 9999,
            letterSpacing: '0.02em',
          }}
        >
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: '#8ECB3C' }}
          />
          You&rsquo;re in — founding cohort
        </span>

        {/* DM Serif welcome heading */}
        <h1
          className="mt-6 leading-tight"
          style={{
            fontFamily: 'var(--font-dm-serif)',
            fontWeight: 400,
            fontSize: 'clamp(40px, 6vw, 64px)',
            color: '#173404',
            letterSpacing: '-0.01em',
          }}
        >
          Welcome, {name}.
        </h1>

        <p
          className="mt-5 text-base leading-relaxed max-w-md mx-auto"
          style={{ color: '#5F5E5A' }}
        >
          You&rsquo;re one of the first to use Grant Tracker. Let&rsquo;s set up your organisation
          so we can match you with funding that actually fits &mdash; about two minutes.
        </p>

        <div className="mt-10">
          <Link
            href="/onboarding/start"
            className="inline-flex items-center gap-2 px-6 py-3.5 text-sm font-bold transition-opacity hover:opacity-80"
            style={{
              fontFamily: 'var(--font-space-grotesk)',
              background: '#8ECB3C',
              color: '#173404',
              borderRadius: 9999,
            }}
          >
            Let&rsquo;s get you set up
            <ArrowRight size={16} strokeWidth={2.5} />
          </Link>
        </div>
      </div>
    </div>
  )
}
