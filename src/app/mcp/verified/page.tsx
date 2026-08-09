// Landing for the single post-signup nudge link.
//
// Reaching this page requires having followed the emailed magic link, which
// establishes a session. That round trip is the ONLY proof that the person
// controls the address, because the MCP signup path confirms every account it
// creates in order to issue a session (see migration 050). So this is where
// own_verified_at is set, and therefore the only way anyone ever enters
// public.marketing_list.
//
// Idempotent: a second visit is a no-op rather than an error, since people
// re-click links.

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import LogoMark from '@/components/icons/LogoMark'
import '../../oauth/authorize/shoots-auth.css'

export const dynamic = 'force-dynamic'

export default async function VerifiedPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let state: 'verified' | 'already' | 'not_signed_in' = 'not_signed_in'

  if (user) {
    const svc = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    )
    const { data: existing } = await svc
      .from('user_marketing_consent')
      .select('own_verified_at')
      .eq('user_id', user.id)
      .maybeSingle()

    if (existing?.own_verified_at) {
      state = 'already'
    } else {
      // Upsert rather than update: someone who signed up before this table
      // existed, or through another surface, still deserves to be verifiable.
      // consented defaults to false so arriving here never grants consent that
      // was not given.
      await svc.from('user_marketing_consent').upsert({
        user_id: user.id,
        consented: existing ? undefined : false,
        own_verified_at: new Date().toISOString(),
        source: 'mcp_authorize',
      }, { onConflict: 'user_id' })
      state = 'verified'
    }
  }

  return (
    <div className="shoots-auth" style={{ minHeight: '100vh', fontFamily: 'var(--font-plus-jakarta, Plus Jakarta Sans, sans-serif)' }}>
      <nav style={{ background: 'var(--surface-card)', borderBottom: '1px solid var(--border-hairline)', padding: '18px 0' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <LogoMark size={26} />
          <span style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 700, fontSize: 20, letterSpacing: '-0.025em', color: 'var(--text-heading)' }}>
            Shoots
          </span>
        </div>
      </nav>

      <main style={{ maxWidth: 460, margin: '0 auto', padding: '56px 20px' }}>
        <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border-hairline)', borderRadius: 12, padding: 28 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 21, fontWeight: 600, color: 'var(--text-heading)', marginBottom: 8 }}>
            {state === 'not_signed_in' ? 'Link expired' : 'Email confirmed'}
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.55, marginBottom: 20 }}>
            {state === 'not_signed_in'
              ? 'This confirmation link has expired or was already used. Sign in and we can send a fresh one.'
              : state === 'already'
                ? 'This address was already confirmed. Nothing further to do.'
                : 'Thanks. Your email address is confirmed, and your AI client connection is unaffected.'}
          </p>
          <Link
            href="/dashboard"
            style={{
              display: 'inline-block', background: 'var(--deep)', color: 'var(--text-on-dark)',
              fontFamily: 'var(--font-space-grotesk)', fontSize: 14, fontWeight: 500,
              padding: '11px 20px', borderRadius: 10, textDecoration: 'none',
            }}
          >
            Go to the app
          </Link>
        </div>
      </main>
    </div>
  )
}
