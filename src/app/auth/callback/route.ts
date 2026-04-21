import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { computePostLoginPath, isOnboardingComplete } from '@/lib/onboarding'
import type { Organisation } from '@/types'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // Respect explicit ?next= overrides (e.g. magic-link deep linking).
  // Otherwise compute the right landing page from auth + onboarding state
  // so new users don't bounce through /dashboard → gate → /onboarding.
  const explicitNext = searchParams.get('next')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      if (explicitNext) {
        return NextResponse.redirect(`${origin}${explicitNext}`)
      }
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return NextResponse.redirect(`${origin}/dashboard`)

      const { data: orgs } = await supabase
        .from('organisations')
        .select('*')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
      const org = (orgs?.[0] ?? null) as Organisation | null

      let pipelineCount = 0
      if (org?.id) {
        const { count } = await supabase
          .from('pipeline_items')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', org.id)
        pipelineCount = count ?? 0
      }

      const dest = computePostLoginPath({
        onboardingComplete: isOnboardingComplete(org),
        hasPipelineActivity: pipelineCount > 0,
      })
      return NextResponse.redirect(`${origin}${dest}`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/login?error=confirmation_failed`)
}
