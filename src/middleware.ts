import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl

  // ── Early exits: handle Supabase auth redirects before touching the session ──
  // These must run BEFORE supabase.auth.getUser() so a slow/failed Supabase
  // call cannot prevent the redirect from firing.

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

  const isAuthPage = pathname.startsWith('/auth')
  const isPublicPage = pathname === '/'
  const isApiRoute = pathname.startsWith('/api/')

  // Redirect unauthenticated users to login
  if (!user && !isAuthPage && !isPublicPage && !isApiRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    return NextResponse.redirect(url)
  }

  // Redirect logged-in users away from auth pages
  if (user && isAuthPage) {
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
