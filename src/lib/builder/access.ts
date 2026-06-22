// Apply-tier access gate (pipeline + builder).
// Deliberately NOT "all authenticated users": once the public can sign up, Apply
// must stay gated (it's the paid tier). Two sources, OR'd:
//   1. organisations.apply_access — the DB entitlement (migration 030). This is
//      the forward-compatible source: the post-GA Stripe gate flips this column,
//      no code change here. RLS on the Apply data tables enforces the same fact.
//   2. BUILDER_ALLOWLIST below — retained as the seed for (1) and as a fallback
//      for internal accounts that have no organisation row (e.g. reviewer/ops
//      logins), so they don't lose builder compute.
// The list mirrors what migration 030 seeded into apply_access.

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

/** Returns the session user when Apply-entitled, else null. */
export async function getBuilderUser(): Promise<BuilderUser | null> {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) return null

    // 1. Hardcoded allowlist (internal + founding cohort). Kept as the seed/
    //    fallback so internal accounts without an org row still resolve.
    if (BUILDER_ALLOWLIST.some(e => e.toLowerCase() === user.email!.toLowerCase())) {
      return { id: user.id, email: user.email }
    }

    // 2. DB entitlement: any org owned by this user with apply_access = true.
    //    Reads under the user's own RLS (they can read their own orgs). This is
    //    the path future paid (non-allowlisted) users take — no code change when
    //    Stripe flips the column.
    const { data: entitled } = await supabase
      .from('organisations')
      .select('id')
      .eq('owner_id', user.id)
      .eq('apply_access', true)
      .limit(1)
    if (entitled && entitled.length > 0) {
      return { id: user.id, email: user.email }
    }

    return null
  } catch {
    return null
  }
}
