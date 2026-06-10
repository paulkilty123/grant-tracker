// Application builder v0 — cohort allowlist gate.
// The builder is the most inference-heavy feature on the roadmap; access is
// gated to cohort members for the validation round. Add cohort emails below
// to widen access — no rebuild needed.

import { createClient as createServerClient } from '@/lib/supabase/server'

export const BUILDER_ALLOWLIST = [
  'paulkilty1@gmail.com',
  'paul@granttracker.co.uk',
  // Cohort members — add emails here to grant builder access:
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
    if (user?.email && BUILDER_ALLOWLIST.includes(user.email.toLowerCase())) {
      return { id: user.id, email: user.email }
    }
    return null
  } catch {
    return null
  }
}
