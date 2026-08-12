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
import { MCP_PUBLIC_ORIGIN, MCP_BRAND_NAME } from '@/lib/mcp-brand'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { headers } from 'next/headers'
import { enforceSignupRateLimit } from '@/lib/mcp-rate-limit'
import SignupForm from './SignupForm'
import ConnectButton from './ConnectButton'
import type { AuthActionResult } from './auth-errors'
import './shoots-auth.css'

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
  // Origin is only a parsing base — the return value is stripped to
  // pathname+search below — but it reads from config so no stray literal
  // survives a domain move.
  const u = new URL('/oauth/authorize', MCP_PUBLIC_ORIGIN)
  for (const [k, v] of Object.entries(p)) {
    if (v != null && v !== '') u.searchParams.set(k, v)
  }
  // Strip the origin — Next redirect() accepts a relative path
  return u.pathname + u.search
}

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

function clientIp(h: Headers): string {
  const xff = h.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return h.get('x-real-ip')?.trim() || 'unknown'
}

/**
 * Create an account without leaving the connect flow, then continue to consent.
 *
 * Uses the service role with email_confirm: true because Supabase will not
 * issue a session for an unconfirmed user, and an interrupted OAuth flow is
 * exactly what phase 6 exists to prevent. The consequence is that nobody has
 * proved they own the address at this point, which is why:
 *   - a per-IP ceiling guards the endpoint (this path bypasses Supabase's own
 *     signup protections, so it is the only brake), and
 *   - marketing consent is recorded but NOT armed. public.marketing_list
 *     filters on own_verified_at, which only the nudge link can set.
 */
async function createAccountAction(formData: FormData): Promise<AuthActionResult> {
  'use server'

  const sp = Object.fromEntries(
    Array.from(formData.entries())
      .filter(([k]) => k.startsWith('oa_'))
      .map(([k, v]) => [k.slice(3), String(v)]),
  ) as AuthorizeSearchParams

  const email    = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')
  const consent  = formData.get('marketing_consent') === 'yes'

  if (!email || !password) return { ok: false, code: 'missing_fields' }
  if (password.length < 8)  return { ok: false, code: 'password_too_short' }

  // Fails CLOSED: an Upstash outage blocks signup rather than leaving an
  // unauthenticated account-creation path with no brake at all.
  const rl = await enforceSignupRateLimit(clientIp(await headers()))
  if (!rl.allowed) {
    return {
      ok: false,
      code: rl.reason === 'limiter_unavailable' ? 'limiter_unavailable' : 'rate_limited',
    }
  }

  const svc = serviceClient()
  const { data: created, error: createErr } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,   // lets a session issue; NOT proof of ownership
  })
  if (createErr) {
    // Supabase does not distinguish "already exists" cleanly across versions;
    // treat it as the common case rather than leaking the raw message.
    const msg = createErr.message.toLowerCase()
    if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
      return { ok: false, code: 'email_exists' }
    }
    return { ok: false, code: 'create_failed' }
  }

  const userId = created.user?.id
  if (!userId) return { ok: false, code: 'create_no_user' }

  // Record the answer either way: a stored `false` is what proves the box was
  // not pre-ticked, and an absent row would prove nothing.
  await svc.from('user_marketing_consent').upsert({
    user_id: userId,
    consented: consent,
    source: 'mcp_authorize',
  }, { onConflict: 'user_id' })

  // Establish the session on the user-scoped client so the consent screen sees
  // them as signed in.
  const supabase = await createClient()
  const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
  if (signInErr) return { ok: false, code: 'signin_after_create_failed' }

  // The single nudge. Transactional, not marketing, so it is not gated on
  // consent: it is the only way own_verified_at ever gets set. Best-effort —
  // a mail failure must not strand someone mid-connection.
  try {
    const { error: nudgeErr } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${MCP_PUBLIC_ORIGIN}/auth/callback?next=/mcp/verified`,
      },
    })
    if (!nudgeErr) {
      await svc.from('user_marketing_consent')
        .update({ nudge_sent_at: new Date().toISOString() })
        .eq('user_id', userId)
    }
  } catch { /* non-fatal by design */ }

  redirect(buildAuthorizeUrl(sp))
}

async function signInAction(formData: FormData): Promise<AuthActionResult> {
  'use server'

  const sp = Object.fromEntries(
    Array.from(formData.entries())
      .filter(([k]) => k.startsWith('oa_'))
      .map(([k, v]) => [k.slice(3), String(v)]),
  ) as AuthorizeSearchParams

  const email    = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { ok: false, code: 'signin_failed' }

  redirect(buildAuthorizeUrl(sp))
}

export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<AuthorizeSearchParams & { mode?: string }>
}) {
  const sp = await searchParams

  // Auth gate. Logged-out callers now stay INSIDE the flow: phase 6 replaced
  // the bounce to /auth/login with in-place signup, because a detour to the
  // main site loses most people and the site's own signup is cohort-gated.
  // Validation still runs first, so an unrecognised client is refused before
  // anyone is invited to type a password.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    const pre = await validateAuthorizeRequest(sp)
    if (!pre.ok) {
      if (pre.kind === 'redirect') {
        redirect(buildRedirect(pre.redirect_uri, { error: pre.error, error_description: pre.description, state: pre.state }))
      }
      return <ErrorScreen error={pre.error} description={pre.description} />
    }
    const mode = sp.mode === 'signin' ? 'signin' : 'signup'
    return (
      <AuthScreen
        params={pre.params}
        sp={sp}
        mode={mode}
        action={mode === 'signup' ? createAccountAction : signInAction}
      />
    )
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
    <nav style={{ background: 'var(--surface-card)', borderBottom: '1px solid var(--border-hairline)', padding: '18px 0' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {/* Logotype, matched to the landing page's `.brand` treatment: lowercase
            wordmark, weight 500, -0.01em tracking, 8px gap. Lowercased in CSS
            rather than by changing MCP_BRAND_NAME, because the brand is
            capitalised everywhere it appears as prose ("your Shoots funding
            catalogue") and only the logotype is lowercase. */}
        <Link href="/mcp" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <LogoMark size={28} />
          <span style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 500, fontSize: 22, letterSpacing: '-0.01em', textTransform: 'lowercase', color: 'var(--deep, #1D3C3E)' }}>{MCP_BRAND_NAME}</span>
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
    <div className="shoots-auth" style={{ minHeight: '100vh', fontFamily: 'var(--font-plus-jakarta, Plus Jakarta Sans, sans-serif)' }}>
      <PortalNav />
      <main style={{ maxWidth: 560, margin: '0 auto', padding: '64px 32px' }}>
        <div className="rounded-xl p-8" style={{ background: 'var(--surface-card)', border: '1px solid var(--border-hairline)' }}>
          <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ fontFamily: 'var(--font-space-grotesk)', color: 'var(--terra)' }}>
            Authorization request rejected
          </div>
          <h1 className="text-xl font-bold mb-3" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
            Can&apos;t complete this connection
          </h1>
          <p className="text-sm text-mid mb-4">{description}</p>
          <p className="text-xs text-mid mb-5">
            Error code: <code style={{ background: 'var(--surface-sunken)', padding: '1px 6px', borderRadius: 4, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{error}</code>
          </p>
          <p className="text-xs text-mid mb-6">
            If you reached this page from an app you trust, please go back and try connecting again.
            If the problem persists, contact the app&apos;s support team — the redirect address it sent us
            doesn&apos;t match what was registered with {MCP_BRAND_NAME}, so we can&apos;t safely complete the sign-in.
          </p>
          <Link
            href="/mcp"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg"
            style={{ background: 'var(--deep)', color: 'var(--text-on-dark)', fontFamily: 'var(--font-space-grotesk)' }}
          >
            Back to {MCP_BRAND_NAME} MCP
          </Link>
        </div>
      </main>
    </div>
  )
}

/**
 * Signup / sign-in, rendered in place of the old bounce to /auth/login.
 *
 * The OAuth params ride along as hidden oa_* fields so the server action can
 * rebuild the authorize URL and drop the user straight onto consent. Carrying
 * them through the form rather than a session avoids losing the request state
 * if someone takes a while over the password field.
 */
function AuthScreen({
  params,
  sp,
  mode,
  action,
}: {
  params: ValidatedAuthorizeParams
  sp:     AuthorizeSearchParams & { mode?: string }
  mode:   'signup' | 'signin'
  action: (fd: FormData) => Promise<AuthActionResult | void>
}) {
  const clientName = params.client.client_name?.trim() || 'an application'
  const isSignup = mode === 'signup'
  const switchSp = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) {
    if (k !== 'mode' && v != null && v !== '') switchSp.set(k, String(v))
  }
  switchSp.set('mode', isSignup ? 'signin' : 'signup')

  return (
    <div className="shoots-auth" style={{ minHeight: '100vh', fontFamily: 'var(--font-plus-jakarta, Plus Jakarta Sans, sans-serif)' }}>
      <PortalNav />
      <main style={{ maxWidth: 460, margin: '0 auto', padding: '48px 20px' }}>
        <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border-hairline)', borderRadius: 12, padding: 28 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 22, fontWeight: 600, color: 'var(--text-heading)', letterSpacing: '-0.01em', marginBottom: 6 }}>
            {isSignup ? 'Create your account' : 'Sign in to continue'}
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.55, marginBottom: 22 }}>
            {isSignup
              ? 'A free account lets you search the full UK funding catalogue from your AI client, with complete eligibility criteria on every result.'
              : 'Sign in to connect your account.'}
          </p>

          <SignupForm
            action={action}
            clientName={clientName}
            mode={mode}
            switchHref={`/oauth/authorize?${switchSp.toString()}`}
            hiddenFields={Object.entries(sp)
              .filter(([k, v]) => k !== 'mode' && v != null && v !== '')
              .map(([k, v]) => ({ name: `oa_${k}`, value: String(v) }))}
          />
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
    <div className="shoots-auth" style={{ minHeight: '100vh', fontFamily: 'var(--font-plus-jakarta, Plus Jakarta Sans, sans-serif)' }}>
      <PortalNav />
      <main style={{ maxWidth: 560, margin: '0 auto', padding: '48px 32px' }}>
        <div className="rounded-xl p-8" style={{ background: 'var(--surface-card)', border: '1px solid var(--border-hairline)' }}>
          <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ fontFamily: 'var(--font-space-grotesk)', color: 'var(--text-muted)' }}>
            Authorize connection
          </div>
          <h1 className="text-2xl font-bold mb-3" style={{ fontFamily: 'var(--font-space-grotesk)', letterSpacing: '-0.01em' }}>
            Connect {clientName} to {MCP_BRAND_NAME}
          </h1>
          <p className="text-sm mb-5" style={{ color: 'var(--text-heading)' }}>
            {/* Was "asking for read access". The OAuth scope string is indeed
                `read`, but the scope string is not the granted capability: paid
                plans expose pipeline and goal writes over this connection, so
                summarising the whole grant as read access was wrong. The scope
                value itself is unchanged. */}
            <strong>{clientName}</strong> is asking to connect to your {MCP_BRAND_NAME} account.
            Here is what that allows.
          </p>

          <div className="rounded-lg p-4 mb-5" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border-hairline)' }}>
            <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#3B6D11' }}>
              What it can do on any plan
            </div>
            <ul className="text-sm space-y-1.5" style={{ color: 'var(--text-heading)' }}>
              <li>• Search the UK funding catalogue</li>
              <li>• Read full details for an opportunity</li>
              <li>• Read intelligence on a funder or provider</li>
              <li>• Browse the controlled taxonomies (sectors, regions, etc.)</li>
              <li>• Check server health</li>
            </ul>
          </div>

          {/* Write scope, stated because it is real. The Apply and Adviser plans
              expose four writing tools over this same connection
              (add_to_pipeline, update_pipeline_item, set_funding_goal,
              update_goal_purposes), all verified live in the phase 7 smoke test.
              This block previously did not exist and the panel below claimed the
              connection could not "edit your pipeline" or "write any data back",
              which understated the grant for anyone on a paid plan.

              Deliberately NOT tier-aware: the consent screen resolves the signed
              in user but never their organisation, so the tier is not known here.
              Making it tier-aware would mean adding an org lookup to the consent
              path, which is a behaviour change, not a copy fix. Stating the
              condition in words is accurate for every tier. */}
          <div className="rounded-lg p-4 mb-5" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border-hairline)' }}>
            <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ fontFamily: 'var(--font-space-grotesk)', color: 'var(--text-heading)' }}>
              And, on plans that include these features
            </div>
            <ul className="text-sm space-y-1.5" style={{ color: 'var(--text-heading)' }}>
              <li>• Add opportunities to your pipeline and update their stage</li>
              <li>• Set your funding goal and what it is for</li>
            </ul>
            <p className="text-xs mt-2.5" style={{ color: 'var(--text-muted)' }}>
              These write to your own pipeline and goals on the Apply and Adviser
              plans. On the free plan the connection reads only.
            </p>
          </div>

          <div className="rounded-lg p-4 mb-6" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border-hairline)' }}>
            <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ fontFamily: 'var(--font-space-grotesk)', color: 'var(--text-muted)' }}>
              What it can&apos;t do
            </div>
            <p className="text-sm" style={{ color: 'var(--text-heading)' }}>
              Change your organisation profile, write or store application content,
              delete anything, or reach another organisation&apos;s data.
            </p>
          </div>

          {/* The address is echoed prominently rather than as fine print
              because a typo here is the common failure and an unrecoverable
              one: the account is created against an address the person cannot
              read, so the nudge never arrives and password reset cannot help.
              Last point at which it can be caught. */}
          <div
            className="mb-4"
            style={{
              background: 'var(--surface-sunken)',
              border: '1px solid var(--border-hairline)',
              borderRadius: 10,
              padding: '12px 14px',
            }}
          >
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 2 }}>
              Connecting as
            </div>
            <div style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 15, fontWeight: 600, color: 'var(--text-heading)', wordBreak: 'break-all' }}>
              {userEmail}
            </div>
          </div>

          <div className="text-xs space-y-1 mb-7" style={{ color: 'var(--text-muted)' }}>
            <div>Will redirect to <span style={{ color: 'var(--text-heading)', fontWeight: 600 }}>{redirectHost}</span></div>
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
              {/* The main consent action: deep filled, per the Shoots set.
                  Was lime, which is the retiring palette. */}
              <ConnectButton type="submit" name="decision" value="approve" variant="primary">
                Approve
              </ConnectButton>
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

        <p className="text-[11px] text-center mt-5" style={{ color: '#8A8986' }}>
          You can revoke this connection at any time by disconnecting the connector in your AI
          client. <Link href="/mcp" className="underline">How revocation works</Link>.
        </p>
      </main>
    </div>
  )
}
