import { redirect } from 'next/navigation'

/**
 * /auth/signup is the path every public opportunity page links to, with a
 * ?return= naming the grant the visitor was reading. Until launch it sent
 * people to /apply, the invite-only cohort form, which was the wrong door for
 * a stranger arriving from a grant page.
 *
 * `return` is passed through untouched. /signup does not read it today (the
 * post-confirmation path is /auth/callback?next=/onboarding/welcome), so this
 * is the hook for bringing people back to the grant they came from, not the
 * behaviour. Dropping it here would make that a two-file change later.
 */
export default function SignupPage({ searchParams }: { searchParams: { return?: string } }) {
  const back = searchParams.return
  redirect(back ? `/signup?return=${encodeURIComponent(back)}` : '/signup')
}
