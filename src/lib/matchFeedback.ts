import { createClient } from './supabase/client'

export interface MatchFeedbackPayload {
  userId: string
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
export async function getMatchFeedback(
  userId: string,
): Promise<Map<string, StoredFeedback>> {
  const supabase = createClient()
  const { data } = await supabase
    .from('match_feedback')
    .select('grant_id, direction, reasons, free_text')
    .eq('user_id', userId)

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
