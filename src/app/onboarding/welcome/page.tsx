'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { isFoundingCohort } from '@/lib/founding-cohort'
import '@/styles/shoots-band-a.css'

/* Band A page 5 — onboarding welcome.
   ============================================================
   The headline is Space Grotesk, 48/1.08/600, tracking -0.03em. This was put
   to Paul as an open question because brand-guidelines.md reserves DM Serif
   Display for this exact headline while the page has always used the sans; he
   chose the page over the doc on 20 Aug. The serif is now used in one place
   across the whole product, the marketing About testimonial, and no band A
   page loads it. brand-guidelines.md §2 should drop the onboarding reference.

   Two copy fixes, both about the first screen telling the truth:

   1. The eyebrow is conditional. "Founding cohort, you're in" is true today
      and false for anyone arriving through public signup from September.
      See src/lib/founding-cohort.ts for how membership is decided.
   2. The name fallback no longer renders "Welcome, there." firstName() used
      to return the literal string 'there'. It now returns empty and the
      headline drops the comma with it.
   ============================================================ */

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
  // Empty, not 'there'. The headline reads "Welcome." rather than the
  // typo-looking "Welcome, there."
  return ''
}

export default function OnboardingWelcomePage() {
  const [name, setName] = useState<string>('')
  const [cohort, setCohort] = useState(false)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setName(firstName(user.email, user.user_metadata ?? null))
      setCohort(isFoundingCohort(user.created_at))
    }
    load()
  }, [])

  // The .shoots-a scope and the cream ground come from onboarding/layout.tsx.
  return (
    <div className="centred" style={{ flex: 1, alignItems: 'center' }}>
      <div className="hero">

        <span className="pill-eyebrow">
          <i />
          {cohort ? 'Founding cohort, you’re in' : 'Let’s get you set up'}
        </span>

        <h1 className="hero-head">
          {name ? `Welcome, ${name}.` : 'Welcome.'}
        </h1>

        <p>
          You&rsquo;re one of the first to use Shoots. Let&rsquo;s set up your organisation so we can
          match you with funding that fits: grants, programmes, social investment, and in-kind
          support. About two minutes.
        </p>

        <Link href="/onboarding/wizard" className="btn btn-primary">
          Let&rsquo;s get you set up
          <ArrowRight size={16} strokeWidth={2.5} />
        </Link>

        <div style={{ marginTop: 26 }}>
          <Link href="/dashboard/profile" className="skip">Set up later</Link>
        </div>

      </div>
    </div>
  )
}
