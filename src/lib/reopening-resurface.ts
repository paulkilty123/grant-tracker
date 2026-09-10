/**
 * What check-coming-soon does with a row whose reopening date is within the
 * lead but whose "Opens …" badge it is NOT allowed to clear.
 *
 * Found 2026-09-10. The cron already reads every row with a reopening date,
 * hidden or live, so the sweep was never too narrow. What actually happened:
 * the badge (`next_open_date`) on most of these rows was written by a human
 * (`user_verified:` at trust 70, or `admin:` at 100), the cron writes at
 * `system:` (50), so the ladder refused the clear, and the cron treated the
 * refusal as "leave this row alone entirely". Twenty-eight rows were listed
 * as skipped every morning, among them funds hidden since spring and due to
 * reopen within the week. A refused badge clear says nothing about whether
 * the row needs looking at; it only says the badge is somebody else's.
 *
 * The rule now: the badge stays, and the row is still routed to review when
 * it is hidden. A live row keeps its badge and its visibility; there is
 * nothing to surface. Rejected and archived rows are excluded upstream, so
 * a date can never drag a rejected fund back.
 */
export type ResurfaceDecision =
  | 'route'            // hidden, not yet in the queue: send to tagged_awaiting_review
  | 'already_queued'   // hidden and already awaiting review: nothing to write
  | 'leave_live'       // visible already: badge is the human's, nothing to surface

export function resurfaceDecision(row: { is_active: boolean | null; pipeline_state: string | null }): ResurfaceDecision {
  if (row.is_active) return 'leave_live'
  if (row.pipeline_state === 'tagged_awaiting_review') return 'already_queued'
  return 'route'
}
