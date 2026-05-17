import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ReviewSpikeForm from './ReviewSpikeForm'

// Application-review spike — application-builder Phase 0 (review-only standalone).
// Admin-only. Access is gated to this allowlist; cohort-member emails are added
// here for the weeks 3-4 validation round, no rebuild needed.
const REVIEW_SPIKE_ALLOWLIST = [
  'paulkilty1@gmail.com',
]

export default async function ApplicationReviewPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  if (!user.email || !REVIEW_SPIKE_ALLOWLIST.includes(user.email)) {
    redirect('/dashboard')
  }
  return <ReviewSpikeForm />
}
