import { createClient } from '@/lib/supabase/server'

/**
 * Is there a live connection for this user?
 *
 * A row counts only if it has not been revoked AND its refresh token has not
 * expired — an access token expiring is normal and renews itself, a refresh
 * token expiring is the connection ending.
 *
 * The spec allowed for dropping the "Connected" chip entirely if this could
 * not be answered reliably, on the grounds that an unreliable badge is worse
 * than none. It can: oauth_tokens carries user_id, revoked_at and
 * refresh_expires_at, so the answer is definite rather than inferred.
 *
 * Any failure returns null — "we do not know" — and the caller shows no chip.
 * It never falls back to "not connected", which would tell a connected user
 * their connection had gone.
 */
export async function getConnectionState(userId: string): Promise<{ connectedAt: string } | null | undefined> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('oauth_tokens')
      .select('created_at')
      .eq('user_id', userId)
      .is('revoked_at', null)
      .gt('refresh_expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
    if (error) return undefined          // unknown
    if (!data || data.length === 0) return null   // definitely not connected
    return { connectedAt: data[0].created_at as string }
  } catch {
    return undefined
  }
}
