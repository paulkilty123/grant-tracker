import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Captures user-pasted assessment criteria onto the catalogue grant for later
 * review. Writes to `application_criteria_contributed` — a NON-LIVE holding-pen
 * field. Nothing reads it: not matching, not the grant detail page, not the
 * spike's own criteria prefill. Promotion into live enrichment is a separate,
 * deliberate step taken after quality testing.
 *
 * Fill-if-empty: never overwrites an existing contribution. Best-effort — any
 * failure is swallowed, because capture must never block the user response.
 */
export async function captureContributedCriteria(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any>,
  grantUrl: string | null | undefined,
  criteria: string,
): Promise<void> {
  if (!grantUrl || !criteria.trim()) return
  try {
    const { data: g } = await admin
      .from('scraped_grants')
      .select('id, application_criteria_contributed')
      .eq('apply_url', grantUrl)
      .maybeSingle()
    if (!g || g.application_criteria_contributed) return  // no catalogue match, or already captured
    await admin
      .from('scraped_grants')
      .update({
        application_criteria_contributed:    criteria.trim(),
        application_criteria_contributed_at: new Date().toISOString(),
      })
      .eq('id', g.id)
  } catch {
    /* best-effort capture — never block the user-facing response */
  }
}
