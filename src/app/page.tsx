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

  // Handle Supabase auth callbacks that land here instead of /auth/callback.
  // Exchange the code for a session right here so we don't need an extra redirect hop.
  if (searchParams.code) {
    const { error } = await supabase.auth.exchangeCodeForSession(searchParams.code)
    if (error) {
      redirect('/auth/login?error=confirmation_failed')
    }
    redirect('/dashboard')
  }

  // Forward Supabase auth errors to the login page with a readable message
  if (searchParams.error) {
    redirect(`/auth/login?error=${searchParams.error_code ?? 'auth_error'}`)
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')

  return <LandingPage />
}
