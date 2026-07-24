// OAuth 2.0 authorization endpoint — consent screen (RFC 6749 §3.1, §4.1.1).
//
// GET: server-rendered consent UI in the developer-portal frame. Auth-gated.
// POST (via the ApproveDenyForm server action): generates a code on approve,
// or bounces back with error=access_denied on deny.
//
// Validation lives in src/lib/mcp-oauth.ts:validateAuthorizeRequest so the
// GET render and POST action share one source of truth. Two failure modes:
//   - fatal: redirect_uri can't be trusted (unknown client, mismatch) →
//            render an in-app error page, never bounce
//   - redirect: redirect_uri is OK but other params are wrong →
//                bounce back with error= per RFC 6749 §4.1.2.1

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import {
  validateAuthorizeRequest,
  buildRedirect,
  issueAuthorizationCode,
  type ValidatedAuthorizeParams,
} from '@/lib/mcp-oauth'
import LogoMark from '@/components/icons/LogoMark'
import { brand } from '@/config/brand'

export const dynamic = 'force-dynamic'

interface AuthorizeSearchParams {
  client_id?:             string
  redirect_uri?:          string
  response_type?:         string
  scope?:                 string
  state?:                 string
  code_challenge?:        string
  code_challenge_method?: string
  resource?:              string
}

// Server action — handles the Approve/Cancel form POST.
async function decideAction(formData: FormData) {
  'use server'

  const decision = String(formData.get('decision') ?? '')
  const params: AuthorizeSearchParams = {
    client_id:             (formData.get('client_id')             as string) || undefined,
    redirect_uri:          (formData.get('redirect_uri')          as string) || undefined,
    response_type:         (formData.get('response_type')         as string) || undefined,
    scope:                 (formData.get('scope')                 as string) || undefined,
    state:                 (formData.get('state')                 as string) || undefined,
    code_challenge:        (formData.get('code_challenge')        as string) || undefined,
    code_challenge_method: (formData.get('code_challenge_method') as string) || undefined,
    resource:              (formData.get('resource')              as string) || undefined,
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    // Session expired between render and submit — restart from /authorize.
    const restart = buildAuthorizeUrl(params)
    redirect(`/auth/login?next=${encodeURIComponent(restart)}`)
  }

  const v = await validateAuthorizeRequest(params)
  if (!v.ok) {
    if (v.kind === 'redirect') {
      redirect(buildRedirect(v.redirect_uri, { error: v.error, error_description: v.description, state: v.state }))
    }
    // Fatal — re-render the GET page which will show the error.
    redirect(buildAuthorizeUrl(params))
  }

  if (decision !== 'approve') {
    redirect(buildRedirect(v.params.redirect_uri, { error: 'access_denied', state: v.params.state }))
  }

  const code = await issueAuthorizationCode({
    user_id:               user!.id,
    client_id:             v.params.client.client_id,
    redirect_uri:          v.params.redirect_uri,
    scope:                 v.params.scope,
    code_challenge:        v.params.code_challenge,
    code_challenge_method: v.params.code_challenge_method,
    resource:              v.params.resource,
  })

  redirect(buildRedirect(v.params.redirect_uri, { code, state: v.params.state }))
}

function buildAuthorizeUrl(p: AuthorizeSearchParams): string {
  const u = new URL('/oauth/authorize', brand.siteUrl)
  for (const [k, v] of Object.entries(p)) {
    if (v != null && v !== '') u.searchParams.set(k, v)
  }
  // Strip the origin — Next redirect() accepts a relative path
  return u.pathname + u.search
}

export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<AuthorizeSearchParams>
}) {
  const sp = await searchParams

  // Auth gate. If logged out, bounce to login with next= so consent resumes
  // after sign-in.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect(`/auth/login?next=${encodeURIComponent(buildAuthorizeUrl(sp))}`)
  }

  const v = await validateAuthorizeRequest(sp)
  if (!v.ok && v.kind === 'redirect') {
    redirect(buildRedirect(v.redirect_uri, { error: v.error, error_description: v.description, state: v.state }))
  }

  if (!v.ok) {
    return <ErrorScreen error={v.error} description={v.description} />
  }

  return <ConsentScreen params={v.params} userEmail={user!.email ?? ''} action={decideAction} />
}

// ──────────────────────────────────────────────────────────────────────────
// UI
// ──────────────────────────────────────────────────────────────────────────

function PortalNav() {
  return (
    <nav style={{ background: 'white', borderBottom: '0.5px solid rgba(23,52,4,0.08)', padding: '18px 0' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href="/mcp" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
          <LogoMark size={28} />
          <span style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 700, fontSize: 22, letterSpacing: '-0.025em', color: 'var(--text-body)' }}>{brand.name}</span>
        </Link>
        <div style={{ display: 'flex', gap: 18 }}>
          <Link href="/mcp" style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 13, color: 'var(--text-muted)', textDecoration: 'none' }}>
            Overview
          </Link>
          <Link href="/mcp/terms" style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 13, color: 'var(--text-muted)', textDecoration: 'none' }}>
            Terms
          </Link>
          <Link href="/dashboard" style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 13, color: 'var(--text-muted)', textDecoration: 'none' }}>
            App
          </Link>
        </div>
      </div>
    </nav>
  )
}

function ErrorScreen({ error, description }: { error: string; description: string }) {
  return (
    <div style={{ background: 'var(--surface-page)', minHeight: '100vh', fontFamily: 'var(--font-plus-jakarta, Plus Jakarta Sans, sans-serif)', color: 'var(--text-body)' }}>
      <PortalNav />
      <main style={{ maxWidth: 560, margin: '0 auto', padding: '64px 32px' }}>
        <div className="rounded-xl p-8" style={{ background: 'white', border: '0.5px solid rgba(23,52,4,0.08)', boxShadow: '0 2px 16px rgba(26,46,43,0.04)' }}>
          <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ fontFamily: 'var(--font-space-grotesk)', color: 'var(--state-error)' }}>
            Authorization request rejected
          </div>
          <h1 className="text-xl font-bold mb-3" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
            Can&apos;t complete this connection
          </h1>
          <p className="text-sm text-mid mb-4">{description}</p>
          <p className="text-xs text-mid mb-5">
            Error code: <code style={{ background: 'var(--surface-pill)', padding: '1px 6px', borderRadius: 4, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{error}</code>
          </p>
          <p className="text-xs text-mid mb-6">
            If you reached this page from an app you trust, please go back and try connecting again.
            If the problem persists, contact the app&apos;s support team — the redirect address it sent us
            doesn&apos;t match what was registered with {brand.name}, so we can&apos;t safely complete the sign-in.
          </p>
          <Link
            href="/mcp"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg"
            style={{ background: 'var(--deep)', color: 'var(--state-success-pale)', fontFamily: 'var(--font-space-grotesk)' }}
          >
            Back to {brand.mcp.productName}
          </Link>
        </div>
      </main>
    </div>
  )
}

function ConsentScreen({
  params,
  userEmail,
  action,
}: {
  params:    ValidatedAuthorizeParams
  userEmail: string
  action:    (formData: FormData) => Promise<void>
}) {
  const clientName = params.client.client_name?.trim() || 'an unrecognised application'
  let redirectHost = ''
  try {
    redirectHost = new URL(params.redirect_uri).hostname
  } catch {
    redirectHost = params.redirect_uri
  }

  return (
    <div style={{ background: 'var(--surface-page)', minHeight: '100vh', fontFamily: 'var(--font-plus-jakarta, Plus Jakarta Sans, sans-serif)', color: 'var(--text-body)' }}>
      <PortalNav />
      <main style={{ maxWidth: 560, margin: '0 auto', padding: '48px 32px' }}>
        <div className="rounded-xl p-8" style={{ background: 'white', border: '0.5px solid rgba(23,52,4,0.08)', boxShadow: '0 2px 16px rgba(26,46,43,0.04)' }}>
          <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ fontFamily: 'var(--font-space-grotesk)', color: 'var(--text-muted)' }}>
            Authorize connection
          </div>
          <h1 className="text-2xl font-bold mb-3" style={{ fontFamily: 'var(--font-space-grotesk)', letterSpacing: '-0.01em' }}>
            Connect {clientName} to {brand.name}
          </h1>
          <p className="text-sm mb-5" style={{ color: 'var(--text-body)' }}>
            <strong>{clientName}</strong> is asking for <strong>read access</strong> to your {brand.name} funding catalogue.
          </p>

          <div className="rounded-lg p-4 mb-5" style={{ background: 'var(--state-success-pale)', border: '0.5px solid rgba(59,109,17,0.18)' }}>
            <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ fontFamily: 'var(--font-space-grotesk)', color: 'var(--state-success)' }}>
              What it can do
            </div>
            <ul className="text-sm space-y-1.5" style={{ color: 'var(--text-body)' }}>
              <li>• Search the UK funding catalogue</li>
              <li>• Read full details for an opportunity</li>
              <li>• Read intelligence on a funder or provider</li>
              <li>• Browse the controlled taxonomies (sectors, regions, etc.)</li>
              <li>• Check server health</li>
            </ul>
          </div>

          <div className="rounded-lg p-4 mb-6" style={{ background: 'var(--surface-sunken)', border: '0.5px solid rgba(95,94,90,0.18)' }}>
            <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ fontFamily: 'var(--font-space-grotesk)', color: 'var(--text-muted)' }}>
              What it can&apos;t do
            </div>
            <p className="text-sm" style={{ color: 'var(--text-body)' }}>
              Save grants, edit your pipeline, change your profile, or write any data back to your account.
            </p>
          </div>

          <div className="text-xs space-y-1 mb-7" style={{ color: 'var(--text-muted)' }}>
            <div>Signed in as <span style={{ color: 'var(--text-body)', fontWeight: 600 }}>{userEmail}</span></div>
            <div>Will redirect to <span style={{ color: 'var(--text-body)', fontWeight: 600 }}>{redirectHost}</span></div>
          </div>

          <form action={action}>
            <input type="hidden" name="client_id"             value={params.client.client_id} />
            <input type="hidden" name="redirect_uri"          value={params.redirect_uri} />
            <input type="hidden" name="response_type"         value="code" />
            <input type="hidden" name="scope"                 value={params.scope} />
            <input type="hidden" name="state"                 value={params.state ?? ''} />
            <input type="hidden" name="code_challenge"        value={params.code_challenge} />
            <input type="hidden" name="code_challenge_method" value={params.code_challenge_method} />
            <input type="hidden" name="resource"              value={params.resource ?? ''} />
            <div className="flex items-center gap-5">
              <button
                type="submit"
                name="decision"
                value="approve"
                className="inline-flex items-center justify-center px-5 py-2.5 text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity"
                style={{ background: '#8ECB3C' /* eslint-disable-line no-restricted-syntax -- RETIRED lime (#8ECB3C) — button-hierarchy redesign, not a token rename */, color: 'var(--deep)', fontFamily: 'var(--font-space-grotesk)' }}
              >
                Approve
              </button>
              <button
                type="submit"
                name="decision"
                value="deny"
                className="text-sm font-semibold hover:underline"
                style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-space-grotesk)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>

        <p className="text-[11px] text-center mt-5" style={{ color: 'var(--text-subtle)' }}>
          You can revoke this connection at any time from your <Link href="/mcp/keys" className="underline">{brand.mcp.productName} settings</Link>.
        </p>
      </main>
    </div>
  )
}
