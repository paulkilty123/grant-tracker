import { createClient } from './supabase/client'

export interface MatchFeedbackPayload {
  userId: string
  /** The organisation whose matches were on screen. Feedback shapes scores for this organisation only (migration 086). */
  orgId: string
  grantId: string
  direction: 'up' | 'down'
  reasons: string[]
  freeText: string | null
  matchScoreAtTime: number
}

export async function saveMatchFeedback(payload: MatchFeedbackPayload): Promise<void> {
  const supabase = createClient()
  await supabase
    .from('match_feedback')
    .upsert(
      {
        user_id: payload.userId,
        org_id: payload.orgId,
        grant_id: payload.grantId,
        direction: payload.direction,
        reasons: payload.reasons,
        free_text: payload.freeText,
        match_score_at_time: payload.matchScoreAtTime,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,grant_id' }
    )
}

export async function deleteMatchFeedback(userId: string, grantId: string): Promise<void> {
  const supabase = createClient()
  await supabase
    .from('match_feedback')
    .delete()
    .match({ user_id: userId, grant_id: grantId })
}

export interface StoredFeedback {
  direction: 'up' | 'down'
  reasons: string[]
  freeText: string | null
}

/** Load all match feedback for a user, returned as a map: grantId -> feedback */
// Scoped to one organisation. Until migration 086 this read every row the
// user had ever written, so a thumbs-down on one organisation's list docked
// the same sectors on every other organisation the user owned (Paul's
// FareShare test, 14 Sept 2026: reveal 75, Find Funding 71). A re-vote on the
// same grant from another organisation moves the row rather than adding one,
// because the unique key is still (user_id, grant_id).
export async function getMatchFeedback(
  userId: string,
  orgId: string,
): Promise<Map<string, StoredFeedback>> {
  const supabase = createClient()
  const { data } = await supabase
    .from('match_feedback')
    .select('grant_id, direction, reasons, free_text')
    .eq('user_id', userId)
    .eq('org_id', orgId)

  const result = new Map<string, StoredFeedback>()
  for (const row of data ?? []) {
    result.set(row.grant_id, {
      direction: row.direction as 'up' | 'down',
      reasons: row.reasons ?? [],
      freeText: row.free_text ?? null,
    })
  }
  return result
}
