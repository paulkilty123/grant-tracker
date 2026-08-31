import { createClient } from '@/lib/supabase/client'
import { emitClientEvent } from '@/lib/events/client'
import type { Organisation } from '@/types'

export async function getOrganisation(orgId: string): Promise<Organisation | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('organisations')
    .select('*')
    .eq('id', orgId)
    .single()

  if (error) return null
  return data
}

/** Active-org id chosen in the profile switcher. Stored in a cookie (not just
 *  localStorage) so server components can read it too. Client-only read. */
export function readActiveOrgCookie(): string | null {
  if (typeof document === 'undefined') return null
  const m = document.cookie.match(/(?:^|;\s*)gt_active_org_id=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

export function writeActiveOrgCookie(orgId: string): void {
  if (typeof document === 'undefined') return
  document.cookie = `gt_active_org_id=${encodeURIComponent(orgId)}; path=/; max-age=31536000; samesite=lax`
}

export async function getOrganisationByOwner(userId: string): Promise<Organisation | null> {
  const supabase = createClient()
  // Load all of the owner's orgs (some users have more than one) and honour
  // the active-org selection; fall back to the oldest. Previously this took
  // limit(1) on the oldest, which silently ignored the switcher.
  const { data, error } = await supabase
    .from('organisations')
    .select('*')
    .eq('owner_id', userId)
    .order('created_at', { ascending: true })

  if (error || !data?.length) return null
  const activeId = readActiveOrgCookie()
  if (activeId) {
    const match = data.find(o => o.id === activeId)
    if (match) return match
  }
  return data[0]
}

/**
 * NOTE ON THE ROW THIS RETURNS: `apply_access` on it may be STALE.
 *
 * `organisations` carries an AFTER INSERT trigger that derives apply_access
 * (migration 069), and PostgREST's returned row is the pre-trigger state. So a
 * person who subscribed before creating an organisation gets `false` back here
 * while the database already says true.
 *
 * Harmless today: both callers use only `.id`, and the profile page reloads
 * from the database immediately after. It is written down because the same
 * shape already produced a real bug in /api/admin/apply-access, where the route
 * answered "not granted" straight after a successful grant and an admin would
 * have clicked twice. If you ever need entitlement here, re-read the row.
 */
export async function createOrganisation(
  org: Omit<Organisation, 'id' | 'created_at'>
): Promise<Organisation> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('organisations')
    .insert(org)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateOrganisation(
  id: string,
  updates: Partial<Omit<Organisation, 'id' | 'created_at' | 'owner_id'>>
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('organisations')
    .update(updates)
    .eq('id', id)

  if (error) throw error
  // Capture layer — field names only, never values (no PII in payloads).
  const fieldsChanged = Object.keys(updates)
  if (fieldsChanged.length > 0) {
    emitClientEvent(id, 'profile_updated', { fields_changed: fieldsChanged })
  }
}

export async function getOrganisationsByOwner(userId: string): Promise<Organisation[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('organisations')
    .select('*')
    .eq('owner_id', userId)
    .order('created_at', { ascending: true })

  if (error) return []
  return data ?? []
}

export async function deleteOrganisation(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('organisations')
    .delete()
    .eq('id', id)
  if (error) throw error
}
