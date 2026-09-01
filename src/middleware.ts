import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { retiredOriginTarget } from '@/lib/mcp-retired-origin'
import { landingCutoverTarget } from '@/lib/landing-cutover'
import { isGone, grantKeyFromPath } from '@/lib/gone-grants'

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl

  // ── Early exits: handle Supabase auth redirects before touching the session ──
  // These must run BEFORE supabase.auth.getUser() so a slow/failed Supabase
  // call cannot prevent the redirect from firing.

  // Retired MCP origin → canonical origin. First of the early exits: a machine
  // client calling the MCP endpoint has no session to refresh, and the redirect
  // must hold even if Supabase is unreachable. Inert until MCP_RETIRED_HOSTS is
  // set at cutover.
  const retiredTarget = retiredOriginTarget(
    request.headers.get('host'),
    pathname,
    request.nextUrl.search,
  )
  if (retiredTarget) {
    // 308 preserves method and body, so a POSTed JSON-RPC call survives.
    return NextResponse.redirect(retiredTarget, 308)
  }

  // ── Deliberately removed grant pages answer 410, not 404 ────────────────────
  //
  // Sits with the early exits because it needs no session: a crawler asking for
  // a withdrawn grant has none, and the answer must hold even if Supabase auth
  // is slow. `isGone` never throws and fails open, so a bad read falls through
  // to the page, which 404s on its own.
  //
  // 404 says "not found right now" and a crawler may keep asking. 410 says the
  // page is deliberately and permanently gone, which de-indexes faster — and
  // `rejected` and `archived` are exactly that: somebody decided this is a
  // duplicate, not a fund, or out of scope. Rows withheld in review keep their
  // 404, because those can come back.
  const grantKey = grantKeyFromPath(pathname)
  if (grantKey && await isGone(grantKey)) {
    return new NextResponse(null, {
      status: 410,
      headers: { 'X-Robots-Tag': 'noindex', 'Cache-Control': 'public, max-age=3600' },
    })
  }

  // Supabase sometimes falls back to the Site URL (/) instead of /auth/callback.
  // Forward the code straight to the Route Handler which CAN set session cookies.
  if (pathname === '/' && searchParams.get('code')) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/callback'
    return NextResponse.redirect(url)
  }

  // Forward Supabase auth errors (e.g. expired confirmation links) to the login page.
  if (pathname === '/' && searchParams.get('error')) {
    const errorCode = searchParams.get('error_code') ?? 'auth_error'
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    url.search = `?error=${errorCode}`
    return NextResponse.redirect(url)
  }

  // ── Session refresh ────────────────────────────────────────────────────────
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options as Parameters<typeof supabaseResponse.cookies.set>[2])
          )
        },
      },
    }
  )

  // Refresh session — keeps the user logged in
  const { data: { user } } = await supabase.auth.getUser()

  // Shoots landing page → the site root, once the cutover env is set. Inert
  // until LANDING_CUTOVER is set at the flip. Runs after the session lookup
  // because it deliberately does not apply to a signed-in user, and before the
  // login redirect below because the rewritten path is not a public page and
  // would otherwise bounce a logged-out visitor to /auth/login.
  const landingTarget = landingCutoverTarget(pathname, Boolean(user))
  if (landingTarget) {
    const url = request.nextUrl.clone()
    url.pathname = landingTarget
    // Rewrite, not redirect: the visitor stays on `/` and the URL never shows
    // the internal document path.
    return NextResponse.rewrite(url)
  }

  const isAuthPage = pathname.startsWith('/auth')
  const isPublicPage =
    pathname === '/' ||
    pathname === '/apply' ||
    // Reachable by direct URL but deliberately unlinked until launch: nothing
    // public points at /signup, and the landing page's only two entry points
    // stay "Sign in" and the #waitlist anchor. Without this the auth gate 307s
    // a logged-out visitor to /auth/login and the page never renders at all.
    pathname === '/signup' ||
    pathname === '/cohort-signup-7k9m2x' ||
    pathname === '/privacy' ||
    pathname === '/terms' ||
    pathname === '/mcp' ||
    pathname === '/mcp/terms' ||
    pathname.startsWith('/grants/')  // Public bridge pages for MCP-returned URLs (read-only catalogue view)
  // OAuth 2.0 + DCR endpoints — discovery, registration, token exchange,
  // revocation. /oauth/authorize is also listed here because it does its own
  // auth gate inside the page (logged-out users are redirected to
  // /auth/login?next=<full URL> so consent resumes after sign-in). Leaving it
  // off this list would short-circuit to /auth/login with no `next` and lose
  // the OAuth request state.
  const isOAuthPublic =
    pathname === '/.well-known/oauth-authorization-server' ||
    pathname === '/.well-known/oauth-protected-resource' ||
    pathname.startsWith('/.well-known/oauth-protected-resource/') ||
    pathname === '/oauth/register' ||
    pathname === '/oauth/token' ||
    pathname === '/oauth/revoke' ||
    pathname === '/oauth/authorize'
  const isApiRoute = pathname.startsWith('/api/')
  // Umami analytics proxy — the tracker script (/o/script.js) and its collect
  // endpoint (/o/api/send) are rewritten to the self-hosted Umami app
  // (next.config.mjs). They must stay public so visitors' browsers can load
  // the script and post events; otherwise the auth gate 307s them to /login.
  const isAnalyticsProxy = pathname.startsWith('/o/')
  // Next-generated metadata routes must be reachable for crawlers (WhatsApp,
  // Slack, LinkedIn, Twitter, Facebook) to fetch the OG / Twitter image.
  // Without this they get redirected to /auth/login and the link preview
  // never renders.
  const isMetadataRoute =
    pathname.startsWith('/opengraph-image') ||
    pathname.startsWith('/twitter-image') ||
    pathname.startsWith('/icon') ||
    pathname.startsWith('/apple-icon') ||
    pathname === '/manifest.webmanifest' ||
    pathname === '/site.webmanifest' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml'

  // Redirect unauthenticated users to login, REMEMBERING where they were going.
  //
  // This used to clone the URL and swap the pathname for /auth/login, which
  // dropped the destination entirely: every deep link followed by a logged-out
  // person landed them on the dashboard instead of the thing they clicked.
  // That is fine for someone opening the app and invisible in normal use, and
  // it is exactly wrong for a link in an email — the weekly digest sends people
  // to a specific grant, and most readers open email on a phone where they are
  // least likely to have a live session.
  //
  // /auth/login already honours ?next= (safeNext there rejects anything not a
  // plain relative path), so this only has to supply it.
  if (!user && !isAuthPage && !isPublicPage && !isApiRoute && !isMetadataRoute && !isOAuthPublic && !isAnalyticsProxy) {
    const intended = `${pathname}${request.nextUrl.search}`
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    // Clear the original query first, or the destination's params would be
    // duplicated onto the login URL alongside `next`.
    url.search = ''
    url.searchParams.set('next', intended)
    return NextResponse.redirect(url)
  }

  // Redirect logged-in users away from auth pages.
  // Password reset is exempt: recovery deliberately establishes a session on
  // that page before the new password is saved, so bouncing an authenticated
  // user to /dashboard would throw them off mid-flow and burn the single-use
  // link. It also broke reset for anyone who still had a live session in the
  // browser where they opened the email.
  if (user && isAuthPage && pathname !== '/auth/reset-password') {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
