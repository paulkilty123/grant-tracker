import { createClient } from './supabase/client'

export type InteractionAction = 'saved' | 'dismissed' | 'applied' | 'liked' | 'disliked' | 'flagged'

/** Record a user interaction with a grant */
export async function recordInteraction(
  orgId: string,
  grantId: string,
  action: InteractionAction,
): Promise<void> {
  const supabase = createClient()
  await supabase
    .from('grant_interactions')
    .upsert(
      { org_id: orgId, grant_id: grantId, action },
      { onConflict: 'org_id,grant_id,action' },
    )
}

/** Remove an interaction (e.g. un-dismiss a grant) */
export async function removeInteraction(
  orgId: string,
  grantId: string,
  action: InteractionAction,
): Promise<void> {
  const supabase = createClient()
  await supabase
    .from('grant_interactions')
    .delete()
    .match({ org_id: orgId, grant_id: grantId, action })
}

/** Load all interactions for an org, returned as a map: grantId → set of actions */
export async function getInteractions(
  orgId: string,
): Promise<Map<string, Set<InteractionAction>>> {
  const supabase = createClient()
  const { data } = await supabase
    .from('grant_interactions')
    .select('grant_id, action')
    .eq('org_id', orgId)

  const result = new Map<string, Set<InteractionAction>>()
  for (const row of data ?? []) {
    if (!result.has(row.grant_id)) result.set(row.grant_id, new Set())
    result.get(row.grant_id)!.add(row.action as InteractionAction)
  }
  return result
}

/** Set (or clear, with null) a reminder date on a saved grant. Upserts the
 *  'saved' row — setting a reminder implies the grant is saved. */
export async function setSavedReminder(
  orgId: string,
  grantId: string,
  reminderAt: string | null,
): Promise<void> {
  const supabase = createClient()
  await supabase
    .from('grant_interactions')
    .upsert(
      { org_id: orgId, grant_id: grantId, action: 'saved', reminder_at: reminderAt },
      { onConflict: 'org_id,grant_id,action' },
    )
}

/** Load reminder dates for an org's saved grants: grantId → ISO date string. */
export async function getSavedReminders(orgId: string): Promise<Map<string, string>> {
  const supabase = createClient()
  const { data } = await supabase
    .from('grant_interactions')
    .select('grant_id, reminder_at')
    .eq('org_id', orgId)
    .eq('action', 'saved')
    .not('reminder_at', 'is', null)

  const result = new Map<string, string>()
  for (const row of (data ?? []) as { grant_id: string; reminder_at: string | null }[]) {
    if (row.reminder_at) result.set(row.grant_id, row.reminder_at)
  }
  return result
}
