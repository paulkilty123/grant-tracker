import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import LandingPage from '@/components/landing/LandingPage'

export default async function RootPage({
  searchParams,
}: {
  searchParams: { code?: string; error?: string; error_code?: string }
}) {
  // Forward Supabase auth callbacks that land on the homepage to the proper handler
  if (searchParams.code) {
    redirect(`/auth/callback?code=${searchParams.code}`)
  }

  // Forward Supabase auth errors to the login page with a readable message
  if (searchParams.error) {
    redirect(`/auth/login?error=${searchParams.error_code ?? 'auth_error'}`)
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) redirect('/dashboard')

  return <LandingPage />
}
