import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import LandingPage from '@/components/landing/LandingPage'

// Always render dynamically — never cache this page at the CDN edge
export const dynamic = 'force-dynamic'

export default async function RootPage({
  searchParams,
}: {
  searchParams: { code?: string; error?: string; error_code?: string }
}) {
  const supabase = await createClient()

  // Supabase sometimes falls back to the Site URL instead of /auth/callback.
  // Forward the code to the Route Handler which CAN set session cookies
  // (Server Components cannot set cookies, so exchanging here would silently fail).
  if (searchParams.code) {
    redirect(`/auth/callback?code=${searchParams.code}`)
  }

  // Forward Supabase auth errors to the login page with a readable message
  if (searchParams.error) {
    redirect(`/auth/login?error=${searchParams.error_code ?? 'auth_error'}`)
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')

  return <LandingPage />
}
