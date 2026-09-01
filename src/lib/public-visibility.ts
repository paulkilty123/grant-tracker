/**
 * Is this catalogue row's own page allowed to be public?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PUBLIC GRANT ROUTE USED TO SERVE ANY ROW BY ID, WHATEVER ITS STATE.
 *
 * Found 2026-09-01, taking five unapplyable rows out of view and then finding
 * them still open at their own URLs. `is_active = false` removes a row from
 * search, the listings and the sitemap, and did nothing at all on the detail
 * page. So "hidden" meant "unfindable", not "gone" — and the difference is
 * invisible from the admin side, because every admin surface reads is_active and
 * agrees the row is hidden.
 *
 * Measured the same day: 994 rejected or archived rows and 92 withheld-in-review
 * rows were reachable by anyone with the URL, or by a crawler. Among them,
 * duplicates of live funds, programmes ruled out of scope for our audience, and
 * press releases scraped as funds. The launch push on 10 September is aimed
 * partly at search and AI crawlers, so those are precisely the pages that must
 * not be found.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS NOT SIMPLY `is_active`
 *
 *   live now                       serve.
 *   published, currently inactive  SERVE. This is the between-rounds case the
 *                                  page is built for: formatNextOpen and the
 *                                  deadlinePassed branch exist to render a fund
 *                                  that is shut and expected back. 404ing it
 *                                  would break a link a fundraiser saved, and
 *                                  182 published rows are inactive right now.
 *   rejected / archived            404. We decided it is not a fund, a
 *                                  duplicate, or out of scope.
 *   never published                404. Nothing was ever shown, so there is no
 *                                  link to keep alive.
 *
 * Lives here rather than in the route because a page.tsx may export only the
 * names Next.js knows: an extra export fails the build's generated types.
 */
export function isPubliclyVisible(row: { is_active?: unknown; pipeline_state?: unknown }): boolean {
  if (row.is_active === true) return true
  return ['published', 'between_rounds_scheduled'].includes(String(row.pipeline_state ?? ''))
}
