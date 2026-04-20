import { redirect } from 'next/navigation'

// This page has been merged into the wizard — Step 1 now handles URL auto-fill.
export default function OnboardingStartRedirect() {
  redirect('/onboarding/wizard')
}
