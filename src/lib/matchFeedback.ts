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
