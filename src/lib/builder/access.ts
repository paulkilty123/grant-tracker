// Application builder — cohort allowlist gate.
// Deliberately an explicit allowlist, NOT "all authenticated users": once the
// public can sign up, the builder must stay gated (it's the paid Apply tier).
// For the beta cohort the list below = every currently-registered user. Future
// Apply-tier access will be driven by entitlement, replacing this list.

import { createClient as createServerClient } from '@/lib/supabase/server'

export const BUILDER_ALLOWLIST = [
  // Paul / internal
  'paulkilty1@gmail.com',
  'paul@granttracker.co.uk',
  'paulkilty77@gmail.com',
  'reviewer@granttracker.co.uk',
  'rohan.kilty@me.com',
  // Cohort orgs (all registered users as of 2026-06-17)
  'admin@asiancommunityconcern.co.uk',
  'pip.projectfemaleuk@gmail.com',
  'destination6one8@gmail.com',
  'monica@tibetwatch.org',
  'louis@reprezent.org.uk',
  'deviyani.clark@gmail.com',
  'dave@thirdspacetheatre.co.uk',
  'jen.robinson-slater@learningwithparents.com',
  'emma@thepaperbirds.com',
  'hema@olympiasmusic.com',
  'david@digitalability.co',
  'billymizen@gmail.com',
  'georgia.dale@gmail.com',
  'j@joelknightphotography.co.uk',
  // Added post-cohort
  'jack@tinderboxcollective.org', // Tinderbox Collective (Edinburgh), joined 2026-06-19
]

export interface BuilderUser {
  id: string
  email: string
}

/** Returns the session user when allowlisted, else null. */
export async function getBuilderUser(): Promise<BuilderUser | null> {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user?.email && BUILDER_ALLOWLIST.some(e => e.toLowerCase() === user.email!.toLowerCase())) {
      return { id: user.id, email: user.email }
    }
    return null
  } catch {
    return null
  }
}
