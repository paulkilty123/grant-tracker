'use client'

import { useState } from 'react'
import Link from 'next/link'
import ConnectButton from './ConnectButton'
import { AUTH_ERROR_COPY, AUTH_ERROR_FALLBACK, type AuthActionResult } from './auth-errors'

/**
 * Account creation inside the OAuth connect flow.
 *
 * Deliberately in-flow: the point of phase 6 is that someone adding the
 * connector never leaves it. A detour to the main site loses most people, and
 * the site's own signup is cohort-gated anyway.
 *
 * Consent copy is verbatim from docs/legal/mcp-legal-copy.md section 3. Do not
 * reword it here; edit the legal doc and copy across, so the shipped wording
 * and the reviewed wording cannot drift.
 */

const LABEL: React.CSSProperties = {
  display: 'block', fontFamily: 'var(--font-space-grotesk)', fontSize: 13,
  fontWeight: 500, color: 'var(--text-body)', marginBottom: 6,
}
const INPUT: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  border: '1px solid var(--border-mid)', background: 'var(--surface-card)',
  color: 'var(--text-body)', fontSize: 14, fontFamily: 'inherit',
}

export default function SignupForm({
  action,
  clientName,
  mode,
  switchHref,
  hiddenFields,
}: {
  action: (fd: FormData) => Promise<AuthActionResult | void>
  clientName: string
  mode: 'signup' | 'signin'
  switchHref: string
  /** OAuth request state, carried through the form so the action can rebuild
   *  the authorize URL. Rendered inside this form because nesting forms is
   *  invalid HTML and silently drops the inner one's fields. */
  hiddenFields: { name: string; value: string }[]
}) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isSignup = mode === 'signup'

  return (
    <form
      action={async (fd) => {
        // Guard against a double submit creating two accounts. The server
        // action redirects on success, so this never needs resetting on the
        // happy path.
        if (submitting) return
        setError(null)
        setSubmitting(true)
        try {
          // The action RETURNS its failures as codes and redirects on success,
          // so nothing user-facing rides on an Error message: Next strips those
          // in production. See auth-errors.ts.
          const result = await action(fd)
          if (result && !result.ok) {
            setError(AUTH_ERROR_COPY[result.code] ?? AUTH_ERROR_FALLBACK)
            setSubmitting(false)
          }
        } catch (e) {
          // A Next redirect throws by design; only surface real failures.
          if (e && typeof e === 'object' && 'digest' in e && String((e as { digest?: string }).digest).startsWith('NEXT_REDIRECT')) throw e
          // Anything reaching here is unexpected, and its message is stripped in
          // production anyway, so show the generic line rather than the digest.
          setError(AUTH_ERROR_FALLBACK)
          setSubmitting(false)
        }
      }}
    >
      {hiddenFields.map(f => (
        <input key={f.name} type="hidden" name={f.name} value={f.value} />
      ))}

      <div style={{ marginBottom: 14 }}>
        <label style={LABEL} htmlFor="email">Email address</label>
        <input id="email" name="email" type="email" required autoComplete="email" style={INPUT} />
      </div>

      <div style={{ marginBottom: isSignup ? 16 : 20 }}>
        <label style={LABEL} htmlFor="password">Password</label>
        <input
          id="password" name="password" type="password" required
          autoComplete={isSignup ? 'new-password' : 'current-password'}
          minLength={isSignup ? 8 : undefined}
          style={INPUT}
        />
        {isSignup && (
          <p style={{ fontSize: 12, color: 'var(--text-subtle)', marginTop: 6 }}>
            At least 8 characters.
          </p>
        )}
      </div>

      {isSignup && (
        <>
          {/* Unticked by default. Pre-ticking invalidates consent under UK GDPR
              and is the first thing a privacy-conscious fundraiser looks for.
              No defaultChecked here, ever. */}
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 16, cursor: 'pointer' }}>
            <input type="checkbox" name="marketing_consent" value="yes" style={{ marginTop: 3 }} />
            <span style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Send me occasional emails about new funding opportunities and Shoots updates.
              Unsubscribe any time.
            </span>
          </label>

          <p style={{ fontSize: 12.5, color: 'var(--text-subtle)', lineHeight: 1.55, marginBottom: 18 }}>
            By creating an account you agree to our{' '}
            <Link href="/terms" style={{ color: 'var(--text-muted)', textDecoration: 'underline' }}>terms of service</Link>{' '}
            and{' '}
            <Link href="/privacy" style={{ color: 'var(--text-muted)', textDecoration: 'underline' }}>privacy policy</Link>.
            Connecting through an AI client shares your funding searches with that client; see the
            privacy policy for how this works.
          </p>
        </>
      )}

      {error && (
        <p role="alert" style={{ fontSize: 13, color: 'var(--terra)', marginBottom: 14 }}>{error}</p>
      )}

      <ConnectButton type="submit" variant="primary" fullWidth disabled={submitting}>
        {submitting
          ? (isSignup ? 'Creating your account...' : 'Signing in...')
          : (isSignup ? 'Create account and continue' : 'Sign in and continue')}
      </ConnectButton>

      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 16, textAlign: 'center' }}>
        {isSignup ? 'Already have an account? ' : 'No account yet? '}
        <Link href={switchHref} style={{ color: 'var(--text-heading)', textDecoration: 'underline' }}>
          {isSignup ? 'Sign in' : 'Create one'}
        </Link>
      </p>

      <p style={{ fontSize: 12, color: 'var(--text-subtle)', marginTop: 18, textAlign: 'center', lineHeight: 1.5 }}>
        You are connecting <strong style={{ color: 'var(--text-muted)' }}>{clientName}</strong>.
        You will be asked to approve the connection next.
      </p>
    </form>
  )
}
